package com.fvc.skins;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import org.jspecify.annotations.Nullable;

/**
 * Written by FvC Launcher into the instance before every launch:
 * {@code config/fvc-skins.json} plus the chosen texture at {@code config/fvc-skins/skin.png}.
 */
public record SkinConfig(
		@Nullable String serverUrl,
		@Nullable String username,
		@Nullable Path skinFile,
		boolean slim) {

	private static final SkinConfig EMPTY = new SkinConfig(null, null, null, false);

	static SkinConfig load(Path configDir) {
		Path file = configDir.resolve("fvc-skins.json");
		if (!Files.isRegularFile(file)) return EMPTY;

		try (Reader reader = Files.newBufferedReader(file)) {
			JsonObject json = JsonParser.parseReader(reader).getAsJsonObject();
			String serverUrl = string(json, "serverUrl");
			String username = string(json, "username");
			Path skin = configDir.resolve("fvc-skins").resolve("skin.png");
			boolean hasSkin = username != null && json.has("skin") && json.get("skin").getAsBoolean()
					&& Files.isRegularFile(skin);
			return new SkinConfig(
					serverUrl != null ? serverUrl.replaceAll("/+$", "") : null,
					username,
					hasSkin ? skin : null,
					"slim".equals(string(json, "model")));
		} catch (Exception e) {
			FvcSkins.LOGGER.warn("Could not read {}", file, e);
			return EMPTY;
		}
	}

	private static @Nullable String string(JsonObject json, String key) {
		if (!json.has(key) || json.get(key).isJsonNull()) return null;
		String value = json.get(key).getAsString().trim();
		return value.isEmpty() ? null : value;
	}
}
