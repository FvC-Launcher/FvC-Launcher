package com.fvc.skins.mixin;

import com.fvc.skins.ui.SkinHeadButton;
import com.fvc.skins.ui.TitleLogo;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.LogoRenderer;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(TitleScreen.class)
abstract class TitleScreenMixin extends Screen {
	private TitleScreenMixin(Component title) {
		super(title);
	}

	/** Right of the Singleplayer button, where vanilla's own layout leaves room. */
	@Inject(method = "init", at = @At("TAIL"))
	private void fvcskins$addSkinButton(CallbackInfo ci) {
		addRenderableWidget(new SkinHeadButton(width / 2 + 104, height / 4 + 48, this));
	}

	/** The FvC Launcher wordmark instead of "Minecraft / Java Edition", on the main menu only. */
	@Redirect(
			method = "extractRenderState",
			at = @At(
					value = "INVOKE",
					target = "Lnet/minecraft/client/gui/components/LogoRenderer;extractRenderState(Lnet/minecraft/client/gui/GuiGraphicsExtractor;IF)V"))
	private void fvcskins$drawLogo(LogoRenderer logo, GuiGraphicsExtractor graphics, int screenWidth, float alpha) {
		if (!TitleLogo.draw(graphics, screenWidth, alpha)) logo.extractRenderState(graphics, screenWidth, alpha);
	}
}
