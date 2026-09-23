package com.fvc.skins.ui;

import com.fvc.skins.SkinRepository;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.components.PlayerFaceExtractor;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.InputWithModifiers;
import net.minecraft.util.ARGB;

/** A vanilla-style 20x20 button showing your own head; opens the skin screen. */
public class SkinHeadButton extends AbstractButton {
	private final Screen parent;

	public SkinHeadButton(int x, int y, Screen parent) {
		super(x, y, 20, 20, Lang.tr("fvcskins.button"));
		this.parent = parent;
		setTooltip(Tooltip.create(getMessage()));
	}

	@Override
	public void onPress(InputWithModifiers input) {
		Minecraft.getInstance().gui.setScreen(new SkinScreen(parent));
	}

	@Override
	protected void extractContents(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		extractDefaultSprite(g);
		int size = 12;
		PlayerFaceExtractor.extractRenderState(g, SkinRepository.currentSkin(), getX() + (getWidth() - size) / 2,
				getY() + (getHeight() - size) / 2, size, ARGB.white(alpha));
	}

	@Override
	protected void updateWidgetNarration(NarrationElementOutput output) {
		defaultButtonNarrationText(output);
	}
}
