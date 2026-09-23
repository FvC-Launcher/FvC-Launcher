package com.fvc.skins.ui;

import java.util.function.BooleanSupplier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.InputWithModifiers;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

/** A flat, launcher-style button instead of vanilla's stone one. */
public class FlatButton extends AbstractButton {
	public enum Style { PRIMARY, SECONDARY, SEGMENT }

	/** Draws custom content (e.g. a player head) instead of the label. */
	public interface Icon {
		void draw(GuiGraphicsExtractor g, int x, int y, int w, int h);
	}

	private final Style style;
	private final Runnable action;
	private BooleanSupplier selected = () -> false;
	private @Nullable Icon icon;

	public FlatButton(int x, int y, int w, int h, Component label, Style style, Runnable action) {
		super(x, y, w, h, label);
		this.style = style;
		this.action = action;
	}

	public FlatButton selected(BooleanSupplier selected) {
		this.selected = selected;
		return this;
	}

	public FlatButton icon(Icon icon) {
		this.icon = icon;
		return this;
	}

	@Override
	public void onPress(InputWithModifiers input) {
		action.run();
	}

	@Override
	protected void extractContents(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		int x = getX();
		int y = getY();
		int w = getWidth();
		int h = getHeight();
		boolean hover = active && isHoveredOrFocused();
		boolean on = selected.getAsBoolean();

		int bg;
		int border = 0;
		int fg;
		switch (style) {
			case PRIMARY -> {
				bg = !active ? 0x403BCBFF : hover ? Theme.ACCENT_HOVER : Theme.ACCENT;
				fg = active ? Theme.ON_ACCENT : Theme.TEXT_DISABLED;
			}
			case SEGMENT -> {
				bg = on ? Theme.ACCENT_SOFT : hover ? Theme.CONTROL_HOVER : Theme.CONTROL;
				border = on ? Theme.ACCENT : Theme.CONTROL_BORDER;
				fg = !active ? Theme.TEXT_DISABLED : on ? Theme.ACCENT_HOVER : Theme.TEXT;
			}
			default -> {
				bg = hover ? Theme.CONTROL_HOVER : Theme.CONTROL;
				border = isFocused() ? Theme.ACCENT : Theme.CONTROL_BORDER;
				fg = active ? Theme.TEXT : Theme.TEXT_DISABLED;
			}
		}

		Theme.round(g, x, y, w, h, bg);
		if (border != 0) Theme.border(g, x, y, w, h, border);
		if (icon != null) {
			icon.draw(g, x, y, w, h);
			return;
		}
		Font font = Minecraft.getInstance().font;
		Component label = getMessage();
		g.text(font, label, x + (w - font.width(label)) / 2, y + (h - 8) / 2, fg, style != Style.PRIMARY);
	}

	@Override
	protected void updateWidgetNarration(NarrationElementOutput output) {
		defaultButtonNarrationText(output);
	}
}
