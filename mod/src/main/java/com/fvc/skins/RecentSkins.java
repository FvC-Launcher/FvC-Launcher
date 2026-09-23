package com.fvc.skins;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/**
 * Skins you applied before, newest first, in {@code config/fvc-skins/recent/}. The launcher
 * rewrites fvc-skins.json at every launch, so this lives in its own file.
 */
public final class RecentSkins {
	public record Entry(String hash, byte[] png, boolean slim) {}

	private static final int MAX = 6;

	private RecentSkins() {}

	private static Path dir() {
		return SkinRepository.config().skinDir().resolve("recent");
	}

	public static List<Entry> list() {
		Path index = dir().resolve("recent.json");
		List<Entry> entries = new ArrayList<>();
		if (!Files.isRegularFile(index)) return entries;
		try (Reader reader = Files.newBufferedReader(index)) {
			for (var element : JsonParser.parseReader(reader).getAsJsonArray()) {
				JsonObject item = element.getAsJsonObject();
				String hash = item.get("hash").getAsString();
				Path png = dir().resolve(hash + ".png");
				if (!hash.matches("[0-9a-f]{40}") || !Files.isRegularFile(png)) continue;
				entries.add(new Entry(hash, Files.readAllBytes(png), item.get("slim").getAsBoolean()));
			}
		} catch (Exception e) {
			FvcSkins.LOGGER.warn("Could not read recent skins", e);
		}
		return entries;
	}

	static void add(byte[] png, boolean slim) {
		try {
			String hash = hash(png);
			List<Entry> entries = new ArrayList<>(list());
			entries.removeIf(e -> e.hash().equals(hash));
			entries.addFirst(new Entry(hash, png, slim));
			while (entries.size() > MAX) {
				Files.deleteIfExists(dir().resolve(entries.removeLast().hash() + ".png"));
			}

			Files.createDirectories(dir());
			Files.write(dir().resolve(hash + ".png"), png);
			JsonArray index = new JsonArray();
			for (Entry entry : entries) {
				JsonObject item = new JsonObject();
				item.addProperty("hash", entry.hash());
				item.addProperty("slim", entry.slim());
				index.add(item);
			}
			Files.writeString(dir().resolve("recent.json"), index.toString());
		} catch (Exception e) {
			FvcSkins.LOGGER.warn("Could not remember the skin", e);
		}
	}

	public static String hash(byte[] png) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(png));
		} catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}
}
