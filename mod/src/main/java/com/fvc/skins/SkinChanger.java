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
 * Changes your skin from inside the game and swaps the texture you're wearing right away.
 * Microsoft accounts change their real Mojang skin with the game's session. Offline accounts
 * upload to the FvC skin server (with the secret the launcher passes in
 * {@code FVC_SKINS_SECRET}) and save it into the instance for the launcher to pick up.
 */
public final class SkinChanger {
	/**
	 * {@code shared} is false when other players can't see it yet (skin server unreachable);
	 * {@code premium} when it changed the Microsoft account's real skin.
	 */
	public record Result(boolean shared, boolean premium) {}

	private static final String UA = "FvC-Skins/1.2 (github.com/FvC-Launcher)";
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
		if (SkinRepository.isPremium()) {
			return keepPremiumSkin().thenCompose(v -> MojangSkins.upload(png, slim)).thenApplyAsync(v -> {
				if (!SkinRepository.setPremium(png, slim)) throw new SkinSource.SkinException("Minecraft could not load that skin.");
				markPremiumChange();
				RecentSkins.add(png, slim);
				return new Result(true, true);
			}, Minecraft.getInstance());
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
			return new Result(shared, false);
		}, Minecraft.getInstance());
	}

	/** Back to the default skin, for you and for everyone else. Completes on the render thread. */
	public static CompletableFuture<Result> reset() {
		if (SkinRepository.isPremium()) {
			return keepPremiumSkin().thenCompose(v -> MojangSkins.reset()).thenApplyAsync(v -> {
				SkinRepository.setPremium(null, false);
				markPremiumChange();
				return new Result(true, true);
			}, Minecraft.getInstance());
		}
		return upload("DELETE", null, false).thenApplyAsync(shared -> {
			try {
				SkinRepository.updateConfig(SkinRepository.config().withInGameChange(null, false, shared));
			} catch (Exception e) {
				FvcSkins.LOGGER.warn("Could not save the skin reset", e);
				throw new SkinSource.SkinException("Could not save the change into the game folder.");
			}
			SkinRepository.setOwn(null, false);
			return new Result(shared, false);
		}, Minecraft.getInstance());
	}

	/**
	 * Replacing a Microsoft account's skin loses it unless you still have the file, so keep
	 * the one Mojang has now under Recently worn first. Best effort: never blocks the change.
	 */
	private static CompletableFuture<Void> keepPremiumSkin() {
		// A skin changed earlier this session is in the recent list already.
		if (SkinRepository.ownBytes() != null) return CompletableFuture.completedFuture(null);
		return SkinSource.ofProfile(Minecraft.getInstance().getUser().getProfileId(), "")
				.handle((found, error) -> {
					if (found != null) RecentSkins.add(found.png(), found.slim());
					else if (error != null) FvcSkins.LOGGER.warn("Could not keep your current skin", error);
					return null;
				});
	}

	/** Must run on the render thread. */
	private static void markPremiumChange() {
		try {
			SkinRepository.config().markPremiumChange();
		} catch (Exception e) {
			// Only means the launcher shows the old skin for a few minutes.
			FvcSkins.LOGGER.warn("Could not tell the launcher about the skin change", e);
		}
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
