package com.fvc.skins;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Written by FvC Launcher into the instance before every launch:
 * {@code config/fvc-skins.json} plus the chosen texture at {@code config/fvc-skins/skin.png}.
 * Skins changed in game are written back here, marked with {@code changedInGame}
 * so the launcher adopts them when the game closes.
 */
public record SkinConfig(
		Path configDir,
		@Nullable String serverUrl,
		@Nullable String username,
		boolean offline,
		@Nullable Path skinFile,
		boolean slim) {

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	static SkinConfig empty(Path configDir) {
		return new SkinConfig(configDir, null, null, false, null, false);
	}

	public Path jsonFile() {
		return configDir.resolve("fvc-skins.json");
	}

	public Path skinDir() {
		return configDir.resolve("fvc-skins");
	}

	public Path skinPng() {
		return skinDir().resolve("skin.png");
	}

	static SkinConfig load(Path configDir) {
		SkinConfig empty = empty(configDir);
		Path file = empty.jsonFile();
		if (!Files.isRegularFile(file)) return empty;

		try (Reader reader = Files.newBufferedReader(file)) {
			JsonObject json = JsonParser.parseReader(reader).getAsJsonObject();
			String serverUrl = string(json, "serverUrl");
			String username = string(json, "username");
			Path skin = empty.skinPng();
			boolean hasSkin = username != null && json.has("skin") && json.get("skin").getAsBoolean()
					&& Files.isRegularFile(skin);
			// Launchers before 2.4 didn't write "offline"; they only wrote a skin for offline accounts.
			boolean offline = json.has("offline") ? json.get("offline").getAsBoolean() : hasSkin;
			return new SkinConfig(
					configDir,
					serverUrl != null ? serverUrl.replaceAll("/+$", "") : null,
					username,
					offline,
					hasSkin ? skin : null,
					"slim".equals(string(json, "model")));
		} catch (Exception e) {
			FvcSkins.LOGGER.warn("Could not read {}", file, e);
			return empty;
		}
	}

	/** Records a skin change made in game; {@code png == null} means back to the default skin. */
	SkinConfig withInGameChange(byte @Nullable [] png, boolean slim, boolean shared) throws IOException {
		Files.createDirectories(skinDir());
		if (png != null) Files.write(skinPng(), png);
		else Files.deleteIfExists(skinPng());

		JsonObject json;
		try (Reader reader = Files.newBufferedReader(jsonFile())) {
			json = JsonParser.parseReader(reader).getAsJsonObject();
		} catch (Exception e) {
			json = new JsonObject();
		}
		json.addProperty("skin", png != null);
		json.addProperty("model", slim ? "slim" : "classic");
		json.addProperty("shared", shared);
		json.addProperty("changedInGame", Instant.now().toString());
		Files.writeString(jsonFile(), GSON.toJson(json));

		return new SkinConfig(configDir, serverUrl, username, offline, png != null ? skinPng() : null, slim);
	}

	private static @Nullable String string(JsonObject json, String key) {
		if (!json.has(key) || json.get(key).isJsonNull()) return null;
		String value = json.get(key).getAsString().trim();
		return value.isEmpty() ? null : value;
	}
}
