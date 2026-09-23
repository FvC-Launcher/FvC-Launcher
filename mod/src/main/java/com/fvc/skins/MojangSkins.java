package com.fvc.skins;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import net.minecraft.client.Minecraft;
import org.jspecify.annotations.Nullable;

/**
 * Changes a Microsoft account's real skin through the Minecraft services API, signed in
 * with the game's own session, so it shows on every server, not just to FvC players.
 */
final class MojangSkins {
	private static final String PROFILE = "https://api.minecraftservices.com/minecraft/profile";
	private static final String UA = "FvC-Skins/1.2 (github.com/FvC-Launcher)";
	private static final HttpClient HTTP = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(10))
			.build();

	private MojangSkins() {}

	/** Completes off the render thread; failures are {@link SkinSource.SkinException}s. */
	static CompletableFuture<Void> upload(byte[] png, boolean slim) {
		String boundary = "fvcskins-" + UUID.randomUUID();
		ByteArrayOutputStream body = new ByteArrayOutputStream();
		write(body, "--" + boundary + "\r\n"
				+ "Content-Disposition: form-data; name=\"variant\"\r\n\r\n"
				+ (slim ? "slim" : "classic") + "\r\n"
				+ "--" + boundary + "\r\n"
				+ "Content-Disposition: form-data; name=\"file\"; filename=\"skin.png\"\r\n"
				+ "Content-Type: image/png\r\n\r\n");
		body.writeBytes(png);
		write(body, "\r\n--" + boundary + "--\r\n");

		return send(request("/skins")
				.header("Content-Type", "multipart/form-data; boundary=" + boundary)
				.POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())));
	}

	/** Back to the default skin. Completes off the render thread. */
	static CompletableFuture<Void> reset() {
		return send(request("/skins/active").DELETE());
	}

	private static HttpRequest.Builder request(String path) {
		return HttpRequest.newBuilder(URI.create(PROFILE + path))
				.timeout(Duration.ofSeconds(20))
				.header("User-Agent", UA)
				.header("Authorization", "Bearer " + Minecraft.getInstance().getUser().getAccessToken());
	}

	private static CompletableFuture<Void> send(HttpRequest.Builder request) {
		return HTTP.sendAsync(request.build(), HttpResponse.BodyHandlers.ofString()).handle((response, error) -> {
			if (error != null) {
				FvcSkins.LOGGER.warn("Could not reach the Minecraft services API", error);
				throw new SkinSource.SkinException("Could not reach Mojang. Check your connection.");
			}
			int status = response.statusCode();
			if (status / 100 == 2) return null;
			FvcSkins.LOGGER.warn("Minecraft services API answered {}: {}", status, response.body());
			throw new SkinSource.SkinException(switch (status) {
				case 401 -> "Your Minecraft session has expired. Restart the game from FvC Launcher to change your skin.";
				case 429 -> "Mojang limits how often a skin can change. Try again in a minute.";
				default -> {
					String reason = errorMessage(response.body());
					yield reason != null ? "Mojang rejected the skin: " + reason : "Mojang returned error " + status + ".";
				}
			});
		});
	}

	private static @Nullable String errorMessage(String body) {
		try {
			JsonObject json = JsonParser.parseString(body).getAsJsonObject();
			return json.has("errorMessage") ? json.get("errorMessage").getAsString() : null;
		} catch (Exception e) {
			return null;
		}
	}

	private static void write(ByteArrayOutputStream out, String text) {
		out.writeBytes(text.getBytes(StandardCharsets.UTF_8));
	}
}
