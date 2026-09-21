package com.fvc.skins.mixin;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.renderer.texture.SkinTextureDownloader;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(SkinTextureDownloader.class)
public interface SkinTextureDownloaderAccessor {
	/** Vanilla's 64x32 to 64x64 upgrade and transparency cleanup; throws on any other size. */
	@Invoker("processLegacySkin")
	static NativeImage fvcskins$processLegacySkin(NativeImage image, String url) {
		throw new AssertionError();
	}
}
