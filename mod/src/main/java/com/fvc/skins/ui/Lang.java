package com.fvc.skins.ui;

import com.fvc.skins.FvcSkins;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

/**
 * The mod's strings. Without Fabric API, Minecraft doesn't load mod language files,
 * so they're read from our own jar: the game's language first, English as fallback.
 */
public final class Lang {
	private static final Map<String, Map<String, String>> CACHE = new HashMap<>();

	private Lang() {}

	public static Component tr(String key, Object... args) {
		return Component.literal(str(key, args));
	}

	public static String str(String key, Object... args) {
		String code = Minecraft.getInstance().getLanguageManager().getSelected();
		String value = table(code).get(key);
		if (value == null) value = table("en_us").getOrDefault(key, key);
		for (Object arg : args) value = value.replaceFirst("%s", java.util.regex.Matcher.quoteReplacement(String.valueOf(arg)));
		return value;
	}

	private static Map<String, String> table(String code) {
		return CACHE.computeIfAbsent(code, c -> {
			Map<String, String> strings = new HashMap<>();
			try (InputStream in = Lang.class.getResourceAsStream("/assets/fvcskins/lang/" + c + ".json")) {
				if (in == null) return strings;
				JsonObject json = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
				json.entrySet().forEach(e -> strings.put(e.getKey(), e.getValue().getAsString()));
			} catch (Exception e) {
				FvcSkins.LOGGER.warn("Could not read FvC Skins strings for {}", c, e);
			}
			return strings;
		});
	}
}
