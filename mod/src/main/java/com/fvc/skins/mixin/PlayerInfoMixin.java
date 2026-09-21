package com.fvc.skins.mixin;

import com.fvc.skins.SkinRepository;
import com.mojang.authlib.GameProfile;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.world.entity.player.PlayerSkin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(PlayerInfo.class)
abstract class PlayerInfoMixin {
	@Shadow
	public abstract GameProfile getProfile();

	@Inject(method = "getSkin", at = @At("RETURN"), cancellable = true)
	private void fvcskins$useFvcSkin(CallbackInfoReturnable<PlayerSkin> cir) {
		GameProfile profile = getProfile();
		// Players with a real Mojang skin (online-mode servers, SkinsRestorer, ...) keep it.
		if (profile.properties().containsKey("textures")) return;

		SkinRepository.Skin skin = SkinRepository.get(profile.name());
		if (skin == null) return;

		PlayerSkin vanilla = cir.getReturnValue();
		cir.setReturnValue(new PlayerSkin(skin.texture(), vanilla.cape(), vanilla.elytra(), skin.model(), false));
	}
}
