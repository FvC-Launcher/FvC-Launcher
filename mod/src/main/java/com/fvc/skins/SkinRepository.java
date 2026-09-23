package com.fvc.skins;

import com.fvc.skins.mixin.SkinTextureDownloaderAccessor;
import com.mojang.blaze3d.platform.NativeImage;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.resources.DefaultPlayerSkin;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.entity.player.PlayerSkin;
import org.jspecify.annotations.Nullable;

/**
 * Skins by player name. Your own comes from the launcher-written config; everyone
 * else's is fetched from the FvC skin server and re-checked every few minutes.
 * {@link #get} is called every frame from the render thread, so it never blocks.
 */
public final class SkinRepository {
	public record Skin(ClientAsset.Texture texture, PlayerModelType model) {}

	private static final long REFRESH_MS = Duration.ofMinutes(10).toMillis();
	private static final long MISSING_RETRY_MS = Duration.ofMinutes(5).toMillis();
	private static final int MAX_BYTES = 64 * 1024;

	private static final HttpClient HTTP = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(10))
			.followRedirects(HttpClient.Redirect.NORMAL)
			.build();
	private static final Map<String, Entry> REMOTE = new ConcurrentHashMap<>();
	private static final AtomicInteger TEXTURE_IDS = new AtomicInteger();

	private static SkinConfig config;
	private static @Nullable String ownKey;
	private static @Nullable Skin ownSkin;
	private static byte @Nullable [] ownBytes;
	private static boolean ownLoaded;
	private static @Nullable Supplier<PlayerSkin> vanillaOwn;
	/** What a Microsoft account wears after changing its skin this session (Mojang lags behind). */
	private static @Nullable Skin premiumSkin;
	/** The PNG of {@link #premiumSkin}; null when it's the default skin, which we don't own. */
	private static byte @Nullable [] premiumBytes;

	private static final class Entry {
		volatile @Nullable Skin skin;
		volatile @Nullable String etag;
		volatile long nextCheck;
		volatile boolean inFlight;
	}

	private SkinRepository() {}

	static void init(SkinConfig loaded) {
		config = loaded;
		ownKey = loaded.username() != null ? key(loaded.username()) : null;
	}

	public static SkinConfig config() {
		return config;
	}

	static void updateConfig(SkinConfig updated) {
		config = updated;
	}

	/**
	 * A Microsoft session, which changes its real skin through Mojang. Offline launches pass
	 * a placeholder access token; a Microsoft one is a JWT (three dot-separated parts).
	 */
	public static boolean isPremium() {
		if (config.offline()) return false;
		String token = Minecraft.getInstance().getUser().getAccessToken();
		return token != null && token.split("\\.", -1).length == 3;
	}

	/**
	 * Microsoft accounts change their real Mojang skin; offline accounts launched by
	 * FvC Launcher change the skin the FvC skin server hands out for their name.
	 */
	public static boolean canChangeSkin() {
		if (isPremium()) return true;
		String name = Minecraft.getInstance().getUser().getName();
		return config.offline() && config.username() != null && config.username().equalsIgnoreCase(name);
	}

	/** Whether "Use default" would change anything we know of. */
	public static boolean canReset() {
		if (isPremium()) return premiumSkin == null || premiumBytes != null;
		return ownBytes() != null;
	}

	/** Your skin as everyone sees it: a skin changed this session, the FvC one, or whatever vanilla resolves. */
	public static PlayerSkin currentSkin() {
		if (premiumSkin != null) {
			PlayerSkin vanilla = vanillaOwn();
			return new PlayerSkin(premiumSkin.texture(), vanilla.cape(), vanilla.elytra(), premiumSkin.model(), false);
		}
		Skin own = ownKey != null ? own() : null;
		if (own != null) return PlayerSkin.insecure(own.texture(), null, null, own.model());
		return vanillaOwn();
	}

	private static PlayerSkin vanillaOwn() {
		if (vanillaOwn == null) {
			Minecraft mc = Minecraft.getInstance();
			vanillaOwn = mc.getSkinManager().createLookup(mc.getGameProfile(), false);
		}
		return vanillaOwn.get();
	}

	/** The PNG of the skin you changed to, or null when it's a default one (or unknown). */
	public static byte @Nullable [] ownBytes() {
		if (premiumSkin != null) return premiumBytes;
		if (ownKey != null) own();
		return ownBytes;
	}

	public static boolean ownSlim() {
		Skin skin = premiumSkin != null ? premiumSkin : ownSkin;
		return skin != null && skin.model() == PlayerModelType.SLIM;
	}

	/**
	 * Your Microsoft account's skin after a change this session, for the player with that
	 * profile id; null for anyone else. Others see the change when you next join a server.
	 */
	public static @Nullable Skin premiumOverride(@Nullable UUID profileId) {
		if (premiumSkin == null || profileId == null) return null;
		return profileId.equals(Minecraft.getInstance().getUser().getProfileId()) ? premiumSkin : null;
	}

	/** Must run on the render thread. {@code png == null} means the default skin. */
	static boolean setPremium(byte @Nullable [] png, boolean slim) {
		Skin previous = premiumSkin;
		boolean ownedPrevious = premiumBytes != null;
		Skin next;
		if (png != null) {
			next = register("premium", png, slim);
			if (next == null) return false;
		} else {
			PlayerSkin fallback = DefaultPlayerSkin.get(Minecraft.getInstance().getUser().getProfileId());
			next = new Skin(fallback.body(), fallback.model());
		}
		premiumSkin = next;
		premiumBytes = png;
		// The default texture belongs to the game; only release textures we registered.
		if (ownedPrevious) release(previous);
		return true;
	}

	/** Must run on the render thread. */
	static boolean setOwn(byte @Nullable [] png, boolean slim) {
		if (ownKey == null) return false;
		Skin previous = ownSkin;
		Skin next = png != null ? register(ownKey, png, slim) : null;
		if (png != null && next == null) return false;
		ownSkin = next;
		ownBytes = next != null ? png : null;
		ownLoaded = true;
		release(previous);
		return true;
	}

	/** Registers a throwaway texture for previews; release it with {@link #release(Skin)}. */
	public static @Nullable Skin preview(byte[] png, boolean slim) {
		return register("preview", png, slim);
	}

	public static @Nullable Skin get(String name) {
		String key = key(name);
		if (key.equals(ownKey)) return own();
		if (config.serverUrl() == null) return null;

		Entry entry = REMOTE.computeIfAbsent(key, k -> new Entry());
		if (!entry.inFlight && System.currentTimeMillis() >= entry.nextCheck) fetch(key, entry);
		return entry.skin;
	}

	private static @Nullable Skin own() {
		if (!ownLoaded) {
			ownLoaded = true;
			if (config.skinFile() != null) {
				try {
					byte[] bytes = Files.readAllBytes(config.skinFile());
					ownSkin = register(ownKey, bytes, config.slim());
					if (ownSkin != null) ownBytes = bytes;
				} catch (Exception e) {
					FvcSkins.LOGGER.warn("Could not load your skin from {}", config.skinFile(), e);
				}
			}
		}
		return ownSkin;
	}

	private static void fetch(String key, Entry entry) {
		entry.inFlight = true;
		HttpRequest.Builder request = HttpRequest.newBuilder()
				.uri(URI.create(config.serverUrl() + "/skins/" + URLEncoder.encode(key, StandardCharsets.UTF_8)))
				.timeout(Duration.ofSeconds(15))
				.header("User-Agent", "FvC-Skins/1.0")
				.GET();
		String etag = entry.etag;
		if (etag != null && entry.skin != null) request.header("If-None-Match", etag);

		HTTP.sendAsync(request.build(), HttpResponse.BodyHandlers.ofByteArray()).whenComplete((response, error) -> {
			long now = System.currentTimeMillis();
			if (error != null) {
				FvcSkins.LOGGER.debug("Skin lookup for {} failed", key, error);
				done(entry, now + MISSING_RETRY_MS);
				return;
			}
			switch (response.statusCode()) {
				case 200 -> {
					byte[] body = response.body();
					if (body.length > MAX_BYTES) {
						done(entry, now + REFRESH_MS);
						return;
					}
					boolean slim = response.headers().firstValue("X-Skin-Model").map("slim"::equals).orElse(false);
					String newEtag = response.headers().firstValue("ETag").orElse(null);
					Minecraft.getInstance().execute(() -> {
						Skin previous = entry.skin;
						Skin next = register(key, body, slim);
						if (next != null) {
							entry.skin = next;
							entry.etag = newEtag;
							release(previous);
						}
						done(entry, System.currentTimeMillis() + REFRESH_MS);
					});
				}
				case 304 -> done(entry, now + REFRESH_MS);
				case 404 -> Minecraft.getInstance().execute(() -> {
					Skin previous = entry.skin;
					entry.skin = null;
					entry.etag = null;
					release(previous);
					done(entry, System.currentTimeMillis() + MISSING_RETRY_MS);
				});
				default -> done(entry, now + MISSING_RETRY_MS);
			}
		});
	}

	private static void done(Entry entry, long nextCheck) {
		entry.nextCheck = nextCheck;
		entry.inFlight = false;
	}

	/** Must run on the render thread. Returns null if the bytes are not a valid skin. */
	private static @Nullable Skin register(String key, byte[] png, boolean slim) {
		NativeImage image;
		try {
			image = SkinTextureDownloaderAccessor.fvcskins$processLegacySkin(NativeImage.read(png), key);
		} catch (Exception e) {
			FvcSkins.LOGGER.warn("Ignoring invalid skin for {}: {}", key, e.getMessage());
			return null;
		}
		// A fresh id per upload so a texture is never swapped out while a frame uses it.
		String path = "skins/" + key.replaceAll("[^a-z0-9_.-]", "_") + "_" + TEXTURE_IDS.incrementAndGet();
		Identifier id = Identifier.fromNamespaceAndPath(FvcSkins.MOD_ID, path);
		Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(() -> "FvC skin " + key, image));
		return new Skin(new ClientAsset.ResourceTexture(id, id), slim ? PlayerModelType.SLIM : PlayerModelType.WIDE);
	}

	public static void release(@Nullable Skin skin) {
		if (skin != null) Minecraft.getInstance().getTextureManager().release(skin.texture().texturePath());
	}

	private static String key(String name) {
		return name.toLowerCase(Locale.ROOT);
	}
}
