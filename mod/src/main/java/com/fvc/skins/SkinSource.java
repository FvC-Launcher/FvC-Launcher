package com.fvc.skins;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/** Finds skin textures the same ways the launcher's Skin page does: a player name, a link, or a file. */
public final class SkinSource {
	/** A validated skin PNG; {@code label} is what the UI calls it. */
	public record Found(byte[] png, boolean slim, String label) {}

	/** A failure whose message is safe to show to the player. */
	public static final class SkinException extends RuntimeException {
		public SkinException(String message) {
			super(message);
		}
	}

	private static final Pattern NAME = Pattern.compile("^[A-Za-z0-9_]{1,16}$");
	private static final String SESSION = "https://sessionserver.mojang.com/session/minecraft/profile/";
	private static final int MAX_BYTES = 64 * 1024;
	private static final String UA = "FvC-Skins/1.2 (github.com/FvC-Launcher)";
	private static final HttpClient HTTP = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(10))
			.followRedirects(HttpClient.Redirect.NORMAL)
			.build();

	private SkinSource() {}

	public static boolean isLink(String query) {
		return query.trim().toLowerCase().matches("^https?://.*");
	}

	/** Completes off the render thread; failures are {@link SkinException}s. */
	public static CompletableFuture<Found> resolve(String query) {
		String trimmed = query.trim();
		if (trimmed.isEmpty()) return CompletableFuture.failedFuture(new SkinException("Enter a player name or a skin link."));
		if (isLink(trimmed)) {
			return download(trimmed).thenApply(png -> new Found(png, false, shortLink(trimmed)));
		}
		if (!NAME.matcher(trimmed).matches()) {
			return CompletableFuture.failedFuture(new SkinException("That's neither a player name nor an http(s) link."));
		}
		return byName(trimmed);
	}

	public static Found fromFile(Path file) {
		byte[] png;
		try {
			if (Files.size(file) > MAX_BYTES) throw new SkinException("That file is too large to be a skin (max 64 KB).");
			png = Files.readAllBytes(file);
		} catch (IOException e) {
			throw new SkinException("Could not read " + file.getFileName() + ".");
		}
		validate(png);
		String name = file.getFileName().toString();
		return new Found(png, false, name.endsWith(".png") ? name.substring(0, name.length() - 4) : name);
	}

	/** Throws unless the bytes are a 64x64 (or legacy 64x32) PNG. */
	public static void validate(byte[] png) {
		byte[] signature = {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};
		if (png.length < 24) throw new SkinException("That is not a PNG image.");
		for (int i = 0; i < signature.length; i++) {
			if (png[i] != signature[i]) throw new SkinException("That is not a PNG image.");
		}
		int width = readInt(png, 16);
		int height = readInt(png, 20);
		if (width != 64 || (height != 64 && height != 32)) {
			throw new SkinException("A skin must be 64x64, but that image is " + width + "x" + height + ".");
		}
		if (png.length > MAX_BYTES) throw new SkinException("That skin file is too large (max 64 KB).");
	}

	private static CompletableFuture<Found> byName(String name) {
		String url = "https://api.mojang.com/users/profiles/minecraft/" + URLEncoder.encode(name, StandardCharsets.UTF_8);
		return getJson(url).thenCompose(profile -> {
			if (profile == null) throw new SkinException("No Minecraft account is named \"" + name + "\".");
			String id = profile.get("id").getAsString();
			String realName = profile.get("name").getAsString();
			return getJson(SESSION + id).thenCompose(session -> {
				JsonObject skin = session != null ? skinTexture(session) : null;
				if (skin == null) throw new SkinException(realName + " uses a default skin, so there's nothing to copy.");
				return download(skin.get("url").getAsString()).thenApply(png -> new Found(png, isSlim(skin), realName));
			});
		});
	}

	/** The custom skin a profile wears on Mojang right now, or null for a default one. Completes off the render thread. */
	public static CompletableFuture<@Nullable Found> ofProfile(UUID id, String label) {
		return getJson(SESSION + id.toString().replace("-", "")).thenCompose(session -> {
			JsonObject skin = session != null ? skinTexture(session) : null;
			if (skin == null) return CompletableFuture.completedFuture(null);
			return download(skin.get("url").getAsString()).thenApply(png -> new Found(png, isSlim(skin), label));
		});
	}

	private static boolean isSlim(JsonObject skin) {
		return skin.has("metadata") && "slim".equals(skin.getAsJsonObject("metadata").get("model").getAsString());
	}

	private static JsonObject skinTexture(JsonObject session) {
		if (!session.has("properties")) return null;
		for (var element : session.getAsJsonArray("properties")) {
			JsonObject property = element.getAsJsonObject();
			if (!"textures".equals(property.get("name").getAsString())) continue;
			String decoded = new String(Base64.getDecoder().decode(property.get("value").getAsString()), StandardCharsets.UTF_8);
			JsonObject textures = JsonParser.parseString(decoded).getAsJsonObject().getAsJsonObject("textures");
			return textures != null && textures.has("SKIN") ? textures.getAsJsonObject("SKIN") : null;
		}
		return null;
	}

	private static CompletableFuture<JsonObject> getJson(String url) {
		return HTTP.sendAsync(request(url), HttpResponse.BodyHandlers.ofString())
				.handle((response, error) -> {
					if (error != null) throw new SkinException("Could not reach Mojang. Check your connection.");
					// Mojang answers 204/404 for an unknown name.
					if (response.statusCode() == 204 || response.statusCode() == 404) return null;
					if (response.statusCode() == 429) throw new SkinException("Mojang is rate limiting lookups. Try again in a minute.");
					if (response.statusCode() != 200) throw new SkinException("Mojang returned error " + response.statusCode() + ".");
					return JsonParser.parseString(response.body()).getAsJsonObject();
				});
	}

	private static CompletableFuture<byte[]> download(String url) {
		URI uri;
		try {
			uri = URI.create(url);
		} catch (IllegalArgumentException e) {
			return CompletableFuture.failedFuture(new SkinException("That link is not valid."));
		}
		return HTTP.sendAsync(request(uri), HttpResponse.BodyHandlers.ofByteArray())
				.handle((response, error) -> {
					if (error != null) throw new SkinException("Could not reach that link.");
					if (response.statusCode() != 200) throw new SkinException("The link returned error " + response.statusCode() + ".");
					byte[] png = response.body();
					validate(png);
					return png;
				});
	}

	private static HttpRequest request(String url) {
		return request(URI.create(url));
	}

	private static HttpRequest request(URI uri) {
		return HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(15)).header("User-Agent", UA).GET().build();
	}

	private static String shortLink(String url) {
		String path = url.replaceAll("[?#].*$", "");
		String file = path.substring(path.lastIndexOf('/') + 1);
		return file.isEmpty() ? "Skin from link" : file.replaceAll("\\.png$", "");
	}

	private static int readInt(byte[] bytes, int offset) {
		return ((bytes[offset] & 0xff) << 24) | ((bytes[offset + 1] & 0xff) << 16)
				| ((bytes[offset + 2] & 0xff) << 8) | (bytes[offset + 3] & 0xff);
	}

	/** Unwraps a future's failure into a message for the player. */
	public static String message(Throwable error) {
		Throwable cause = error instanceof CompletionException && error.getCause() != null ? error.getCause() : error;
		if (cause instanceof SkinException) return cause.getMessage();
		FvcSkins.LOGGER.warn("Skin lookup failed", cause);
		return "Something went wrong: " + cause.getMessage();
	}
}
