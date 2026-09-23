package com.fvc.skins;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import net.minecraft.client.Minecraft;
import org.jspecify.annotations.Nullable;

/**
 * Changes your skin from inside the game: uploads it to the FvC skin server (with the
 * secret the launcher passes in {@code FVC_SKINS_SECRET}), saves it into the instance
 * for the launcher to pick up, and swaps the texture you're wearing right away.
 */
public final class SkinChanger {
	/** {@code shared} is false when other players can't see it yet (server unreachable). */
	public record Result(boolean shared) {}

	private static final String UA = "FvC-Skins/1.1 (github.com/FvC-Launcher)";
	private static final HttpClient HTTP = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(10))
			.build();

	private SkinChanger() {}

	/** Completes on the render thread. */
	public static CompletableFuture<Result> apply(byte[] png, boolean slim) {
		try {
			SkinSource.validate(png);
		} catch (SkinSource.SkinException e) {
			return CompletableFuture.failedFuture(e);
		}
		return upload("PUT", png, slim).thenApplyAsync(shared -> {
			try {
				SkinRepository.updateConfig(SkinRepository.config().withInGameChange(png, slim, shared));
			} catch (Exception e) {
				FvcSkins.LOGGER.warn("Could not save the new skin", e);
				throw new SkinSource.SkinException("Could not save the skin into the game folder.");
			}
			if (!SkinRepository.setOwn(png, slim)) throw new SkinSource.SkinException("Minecraft could not load that skin.");
			RecentSkins.add(png, slim);
			return new Result(shared);
		}, Minecraft.getInstance());
	}

	/** Back to the default skin, for you and for everyone else. Completes on the render thread. */
	public static CompletableFuture<Result> reset() {
		return upload("DELETE", null, false).thenApplyAsync(shared -> {
			try {
				SkinRepository.updateConfig(SkinRepository.config().withInGameChange(null, false, shared));
			} catch (Exception e) {
				FvcSkins.LOGGER.warn("Could not save the skin reset", e);
				throw new SkinSource.SkinException("Could not save the change into the game folder.");
			}
			SkinRepository.setOwn(null, false);
			return new Result(shared);
		}, Minecraft.getInstance());
	}

	/**
	 * Resolves to whether the server accepted it. Network trouble is not an error (the launcher
	 * retries at the next launch), but the name belonging to someone else is.
	 */
	private static CompletableFuture<Boolean> upload(String method, byte @Nullable [] png, boolean slim) {
		SkinConfig config = SkinRepository.config();
		String secret = System.getenv("FVC_SKINS_SECRET");
		if (config.serverUrl() == null || config.username() == null || secret == null || secret.length() < 32) {
			return CompletableFuture.completedFuture(false);
		}

		HttpRequest.Builder request = HttpRequest.newBuilder()
				.uri(URI.create(config.serverUrl() + "/skins/" + URLEncoder.encode(config.username(), StandardCharsets.UTF_8)))
				.timeout(Duration.ofSeconds(15))
				.header("User-Agent", UA)
				.header("Authorization", "Bearer " + secret);
		if (png != null) {
			request.header("Content-Type", "image/png")
					.header("X-Skin-Model", slim ? "slim" : "classic")
					.method(method, HttpRequest.BodyPublishers.ofByteArray(png));
		} else {
			request.method(method, HttpRequest.BodyPublishers.noBody());
		}

		return HTTP.sendAsync(request.build(), HttpResponse.BodyHandlers.ofString()).handle((response, error) -> {
			if (error != null) {
				FvcSkins.LOGGER.warn("Skin server unreachable", error);
				return false;
			}
			if (response.statusCode() == 403) {
				throw new SkinSource.SkinException("The name " + config.username()
						+ " is already used by another FvC Launcher player, so the skin server won't take it.");
			}
			if (response.statusCode() / 100 != 2) {
				FvcSkins.LOGGER.warn("Skin server answered {}: {}", response.statusCode(), response.body());
				return false;
			}
			return true;
		});
	}
}
