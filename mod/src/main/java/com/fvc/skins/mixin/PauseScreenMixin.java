package com.fvc.skins.mixin;

import com.fvc.skins.ui.SkinHeadButton;
import net.minecraft.client.gui.layouts.LayoutElement;
import net.minecraft.client.gui.layouts.LinearLayout;
import net.minecraft.client.gui.screens.PauseScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

@Mixin(PauseScreen.class)
abstract class PauseScreenMixin {
	/**
	 * The pause menu's row of icon buttons (bugs, feedback, friends, reporting) is the only
	 * LinearLayout handed to the grid; the skin button joins the end of it.
	 */
	@ModifyArg(
			method = "createPauseMenu",
			at = @At(
					value = "INVOKE",
					target = "Lnet/minecraft/client/gui/layouts/GridLayout$RowHelper;addChild(Lnet/minecraft/client/gui/layouts/LayoutElement;ILnet/minecraft/client/gui/layouts/LayoutSettings;)Lnet/minecraft/client/gui/layouts/LayoutElement;"),
			index = 0)
	private LayoutElement fvcskins$addSkinButton(LayoutElement child) {
		if (child instanceof LinearLayout row) {
			row.addChild(new SkinHeadButton(0, 0, (PauseScreen) (Object) this));
		}
		return child;
	}
}
