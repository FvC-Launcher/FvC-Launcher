package com.fvc.skins.ui;

import com.fvc.skins.FvcSkins;
import com.mojang.blaze3d.platform.NativeImage;
import java.io.IOException;
import java.io.InputStream;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;

/**
 * The "FvC Launcher" wordmark that replaces the Minecraft logo on the title screen.
 * Without Fabric API the game doesn't load mod textures, so it's read from our jar.
 */
public final class TitleLogo {
	private static final Identifier TEXTURE = Identifier.fromNamespaceAndPath(FvcSkins.MOD_ID, "title_logo");
	private static final String RESOURCE = "/assets/fvcskins/textures/gui/title_logo.png";
	/** Same width as vanilla's logo, so the splash text and buttons keep their places. */
	private static final int WIDTH = 256;
	/** Vanilla draws its logo from y 30; ours is shorter, so it's centered in that space. */
	private static final int TOP = 36;

	private static boolean loaded;
	private static int textureWidth;
	private static int textureHeight;

	private TitleLogo() {}

	/** Draws the logo; returns false (so vanilla's is drawn instead) if it couldn't be loaded. */
	public static boolean draw(GuiGraphicsExtractor graphics, int screenWidth, float alpha) {
		if (!load()) return false;
		int height = Math.round(WIDTH * (float) textureHeight / textureWidth);
		graphics.blit(RenderPipelines.GUI_TEXTURED, TEXTURE, screenWidth / 2 - WIDTH / 2, TOP, 0.0F, 0.0F,
				WIDTH, height, textureWidth, textureHeight, textureWidth, textureHeight, ARGB.white(alpha));
		return true;
	}

	private static boolean load() {
		if (loaded) return textureWidth > 0;
		loaded = true;
		try (InputStream in = TitleLogo.class.getResourceAsStream(RESOURCE)) {
			if (in == null) throw new IOException(RESOURCE + " is missing from the mod jar");
			NativeImage image = NativeImage.read(in);
			textureWidth = image.getWidth();
			textureHeight = image.getHeight();
			Minecraft.getInstance().getTextureManager().register(TEXTURE, new DynamicTexture(() -> "FvC title logo", image));
		} catch (Exception e) {
			textureWidth = 0;
			FvcSkins.LOGGER.warn("Could not load the title logo; keeping Minecraft's", e);
		}
		return textureWidth > 0;
	}
}
