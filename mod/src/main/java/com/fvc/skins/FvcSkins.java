package com.fvc.skins;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class FvcSkins implements ClientModInitializer {
	public static final String MOD_ID = "fvcskins";
	public static final Logger LOGGER = LoggerFactory.getLogger("FvC Skins");

	@Override
	public void onInitializeClient() {
		SkinConfig config = SkinConfig.load(FabricLoader.getInstance().getConfigDir());
		SkinRepository.init(config);
		LOGGER.info("Loaded (own skin: {}, skin server: {})",
				config.skinFile() != null ? config.username() : "none",
				config.serverUrl() != null ? config.serverUrl() : "disabled");
	}
}
