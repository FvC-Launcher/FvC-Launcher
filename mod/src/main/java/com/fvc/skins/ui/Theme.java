package com.fvc.skins.ui;

import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Colors and shapes shared by the FvC Skins screens, matching FvC Launcher's dark theme. */
public final class Theme {
	public static final int ACCENT = 0xFF3BCBFF;
	public static final int ACCENT_HOVER = 0xFF6FD9FF;
	public static final int ACCENT_SOFT = 0x383BCBFF;
	public static final int ON_ACCENT = 0xFF06131A;

	public static final int PANEL = 0xD8141821;
	public static final int PANEL_BORDER = 0x26FFFFFF;
	public static final int FIELD = 0xF00C0F15;
	public static final int CONTROL = 0x22FFFFFF;
	public static final int CONTROL_HOVER = 0x3DFFFFFF;
	public static final int CONTROL_BORDER = 0x1CFFFFFF;

	public static final int TEXT = 0xFFFFFFFF;
	public static final int TEXT_DIM = 0xFFB4BCCB;
	public static final int TEXT_MUTED = 0xFF7C8598;
	public static final int TEXT_DISABLED = 0x66FFFFFF;

	public static final int SUCCESS = 0xFF34D399;
	public static final int WARNING = 0xFFFBBF24;
	public static final int ERROR = 0xFFF87171;

	private Theme() {}

	/** A rectangle with 1px clipped corners, drawn without overlapping (so alpha stays even). */
	public static void round(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
		g.fill(x + 1, y, x + w - 1, y + 1, color);
		g.fill(x, y + 1, x + w, y + h - 1, color);
		g.fill(x + 1, y + h - 1, x + w - 1, y + h, color);
	}

	public static void border(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
		g.fill(x + 1, y, x + w - 1, y + 1, color);
		g.fill(x + 1, y + h - 1, x + w - 1, y + h, color);
		g.fill(x, y + 1, x + 1, y + h - 1, color);
		g.fill(x + w - 1, y + 1, x + w, y + h - 1, color);
	}

	public static void panel(GuiGraphicsExtractor g, int x, int y, int w, int h) {
		round(g, x, y, w, h, PANEL);
		border(g, x, y, w, h, PANEL_BORDER);
	}

	/** Small uppercase section label with letter spacing, like the launcher's. */
	public static void label(GuiGraphicsExtractor g, net.minecraft.client.gui.Font font, String text, int x, int y) {
		int cursor = x;
		for (char c : text.toUpperCase().toCharArray()) {
			String s = String.valueOf(c);
			g.text(font, s, cursor, y, TEXT_MUTED, false);
			cursor += font.width(s) + 1;
		}
	}
}
