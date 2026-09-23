package com.fvc.skins.mixin;

import com.fvc.skins.ui.SkinHeadButton;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
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
}
