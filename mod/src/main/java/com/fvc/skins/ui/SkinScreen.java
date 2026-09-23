package com.fvc.skins.ui;

import com.fvc.skins.RecentSkins;
import com.fvc.skins.SkinChanger;
import com.fvc.skins.SkinConfig;
import com.fvc.skins.SkinRepository;
import com.fvc.skins.SkinSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.PlayerFaceExtractor;
import net.minecraft.client.gui.components.PlayerSkinWidget;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.entity.player.PlayerSkin;
import org.jspecify.annotations.Nullable;
import org.lwjgl.PointerBuffer;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.util.tinyfd.TinyFileDialogs;

/**
 * Change your skin without leaving the game: a rotatable preview on the left, and on
 * the right a player-name/link search, a file picker (or drag and drop), the arm
 * width and your recently worn skins.
 */
public class SkinScreen extends Screen {
	/** A skin being previewed but not applied yet. */
	private record Candidate(byte[] png, String label, String hash, SkinRepository.Skin skin) {}

	private record Recent(RecentSkins.Entry entry, SkinRepository.Skin skin) {}

	private final Screen parent;
	private final boolean canChange;
	private final List<Recent> recents = new ArrayList<>();

	private @Nullable Candidate candidate;
	private boolean slim;
	private String query = "";
	private Component status;
	private int statusColor = Theme.TEXT_DIM;
	private boolean busy;
	private @Nullable String ownHash;

	private EditBox field;
	private FlatButton searchButton;
	private FlatButton classicButton;
	private FlatButton slimButton;
	private @Nullable FlatButton applyButton;
	private @Nullable FlatButton resetButton;
	private final List<FlatButton> sourceButtons = new ArrayList<>();

	// Layout, computed in init().
	private int left;
	private int contentWidth;
	private int top;
	private int bottom;
	private int previewWidth;
	private int panelX;
	private int panelWidth;
	private int fieldY;
	private int statusY;
	private final List<int[]> labels = new ArrayList<>();
	private final List<String> labelTexts = new ArrayList<>();

	public SkinScreen(Screen parent) {
		super(Lang.tr("fvcskins.screen.title"));
		this.parent = parent;
		this.canChange = SkinRepository.canChangeSkin();
		this.slim = SkinRepository.currentSkin().model() == PlayerModelType.SLIM;
		this.status = introStatus();
		loadRecents();
	}

	private Component introStatus() {
		SkinConfig config = SkinRepository.config();
		if (canChange) return Lang.tr(SkinRepository.isPremium() ? "fvcskins.status.intro_premium" : "fvcskins.status.intro");
		if (config.username() != null && !config.offline()) return Lang.tr("fvcskins.status.microsoft");
		return Lang.tr("fvcskins.status.no_launcher");
	}

	private void loadRecents() {
		recents.forEach(r -> SkinRepository.release(r.skin()));
		recents.clear();
		byte[] own = SkinRepository.ownBytes();
		ownHash = own != null ? RecentSkins.hash(own) : null;
		for (RecentSkins.Entry entry : RecentSkins.list()) {
			SkinRepository.Skin skin = SkinRepository.preview(entry.png(), entry.slim());
			if (skin != null) recents.add(new Recent(entry, skin));
		}
	}

	// ------------------------------------------------------------------ Layout

	@Override
	protected void init() {
		sourceButtons.clear();
		labels.clear();
		labelTexts.clear();

		contentWidth = Math.min(width - 16, 440);
		left = (width - contentWidth) / 2;
		top = 36;
		bottom = height - 34;
		previewWidth = Math.max(110, contentWidth * 38 / 100);
		panelX = left + previewWidth + 8;
		panelWidth = contentWidth - previewWidth - 8;

		// Preview
		int modelTop = top + 20;
		int modelHeight = Math.max(40, bottom - modelTop - 22);
		PlayerSkinWidget preview = new PlayerSkinWidget(previewWidth - 16, modelHeight, minecraft.getEntityModels(), this::previewSkin);
		preview.setPosition(left + 8, modelTop);
		addRenderableWidget(preview);

		// Controls
		int ix = panelX + 10;
		int iw = panelWidth - 20;
		int y = top + 10;

		addLabel("fvcskins.label.find", ix, y);
		y += 12;
		fieldY = y;
		int searchWidth = 52;
		field = new EditBox(font, ix + 6, y + 6, iw - searchWidth - 4 - 12, 10, Lang.tr("fvcskins.field"));
		field.setBordered(false);
		field.setMaxLength(512);
		field.setValue(query);
		field.setHint(Lang.tr("fvcskins.field.hint"));
		field.setResponder(value -> {
			query = value;
			updateButtons();
		});
		addRenderableWidget(field);
		searchButton = addRenderableWidget(new FlatButton(ix + iw - searchWidth, y, searchWidth, 20,
				Lang.tr("fvcskins.search"), FlatButton.Style.PRIMARY, this::search));
		y += 24;

		int half = (iw - 4) / 2;
		FlatButton browse = new FlatButton(ix, y, half, 18, Lang.tr("fvcskins.browse"), FlatButton.Style.SECONDARY, this::browse);
		browse.setTooltip(Tooltip.create(Lang.tr("fvcskins.browse.tooltip")));
		sourceButtons.add(addRenderableWidget(browse));
		FlatButton yours = new FlatButton(ix + half + 4, y, iw - half - 4, 18, Lang.tr("fvcskins.current"),
				FlatButton.Style.SECONDARY, this::showCurrent);
		sourceButtons.add(addRenderableWidget(yours));
		y += 18 + 10;

		addLabel("fvcskins.label.arms", ix, y);
		y += 12;
		classicButton = addRenderableWidget(new FlatButton(ix, y, half, 18, Lang.tr("fvcskins.classic"),
				FlatButton.Style.SEGMENT, () -> setSlim(false)).selected(() -> !slim));
		slimButton = addRenderableWidget(new FlatButton(ix + half + 4, y, iw - half - 4, 18, Lang.tr("fvcskins.slim"),
				FlatButton.Style.SEGMENT, () -> setSlim(true)).selected(() -> slim));
		y += 18 + 10;

		int head = 22;
		if (!recents.isEmpty() && y + 12 + head + 26 <= bottom) {
			addLabel("fvcskins.label.recent", ix, y);
			y += 12;
			int fit = Math.min(recents.size(), (iw + 4) / (head + 4));
			for (int i = 0; i < fit; i++) {
				Recent recent = recents.get(i);
				FlatButton button = new FlatButton(ix + i * (head + 4), y, head, head, Lang.tr("fvcskins.recent"),
						FlatButton.Style.SEGMENT, () -> pickRecent(recent))
						.selected(() -> recent.entry().hash().equals(shownHash()))
						.icon((g, bx, by, bw, bh) -> PlayerFaceExtractor.extractRenderState(g, recent.skin().texture().texturePath(),
								bx + 3, by + 3, bw - 6, true, false, -1));
				button.setTooltip(Tooltip.create(Lang.tr("fvcskins.recent.tooltip")));
				sourceButtons.add(addRenderableWidget(button));
			}
			y += head + 10;
		}
		statusY = y;

		// Footer
		int footerY = height - 28;
		if (canChange) {
			resetButton = addRenderableWidget(new FlatButton(left, footerY, 96, 20, Lang.tr("fvcskins.reset"),
					FlatButton.Style.SECONDARY, this::reset));
			resetButton.setTooltip(Tooltip.create(Lang.tr(SkinRepository.isPremium()
					? "fvcskins.reset.tooltip_premium"
					: "fvcskins.reset.tooltip")));
		}
		int applyWidth = 100;
		applyButton = addRenderableWidget(new FlatButton(left + contentWidth - applyWidth, footerY, applyWidth, 20,
				Lang.tr("fvcskins.apply"), FlatButton.Style.PRIMARY, this::apply));
		addRenderableWidget(new FlatButton(left + contentWidth - applyWidth - 4 - 72, footerY, 72, 20,
				Component.translatable("gui.done"), FlatButton.Style.SECONDARY, this::onClose));

		updateButtons();
	}

	private void addLabel(String key, int x, int y) {
		labels.add(new int[] {x, y});
		labelTexts.add(Lang.str(key));
	}

	private void updateButtons() {
		if (searchButton == null) return;
		searchButton.active = !busy && !query.isBlank();
		sourceButtons.forEach(b -> b.active = !busy);
		boolean hasTexture = candidate != null || SkinRepository.ownBytes() != null;
		classicButton.active = !busy && hasTexture;
		slimButton.active = !busy && hasTexture;
		if (applyButton != null) applyButton.active = canChange && !busy && hasChange();
		if (resetButton != null) resetButton.active = !busy && SkinRepository.canReset();
	}

	private boolean hasChange() {
		if (candidate != null) return !(candidate.hash().equals(ownHash) && slim == SkinRepository.ownSlim());
		return SkinRepository.ownBytes() != null && slim != SkinRepository.ownSlim();
	}

	private @Nullable String shownHash() {
		return candidate != null ? candidate.hash() : ownHash;
	}

	// ------------------------------------------------------------------ Preview

	private PlayerSkin previewSkin() {
		PlayerModelType model = slim ? PlayerModelType.SLIM : PlayerModelType.WIDE;
		if (candidate != null) return PlayerSkin.insecure(candidate.skin().texture(), null, null, model);
		PlayerSkin current = SkinRepository.currentSkin();
		// Arm width only changes for a skin we have the texture of; the default skin keeps its own.
		if (SkinRepository.ownBytes() == null) return current;
		return new PlayerSkin(current.body(), current.cape(), current.elytra(), model, current.secure());
	}

	private void setCandidate(SkinSource.Found found) {
		SkinRepository.Skin skin = SkinRepository.preview(found.png(), found.slim());
		if (skin == null) {
			setStatus(Lang.tr("fvcskins.status.unreadable"), Theme.ERROR);
			return;
		}
		clearCandidate();
		candidate = new Candidate(found.png(), found.label(), RecentSkins.hash(found.png()), skin);
		slim = found.slim();
		setStatus(canChange
				? Lang.tr("fvcskins.status.previewing", found.label())
				: Lang.tr("fvcskins.status.previewing_only", found.label()), Theme.TEXT_DIM);
	}

	private void clearCandidate() {
		if (candidate != null) SkinRepository.release(candidate.skin());
		candidate = null;
	}

	private void setSlim(boolean value) {
		slim = value;
		updateButtons();
	}

	private void setStatus(Component message, int color) {
		status = message;
		statusColor = color;
		updateButtons();
	}

	// ------------------------------------------------------------------ Sources

	private void search() {
		if (busy || query.isBlank()) return;
		busy = true;
		setStatus(Lang.tr(SkinSource.isLink(query) ? "fvcskins.status.downloading" : "fvcskins.status.looking_up"), Theme.TEXT_DIM);
		SkinSource.resolve(query).whenComplete((found, error) -> minecraft.execute(() -> {
			busy = false;
			if (!isOpen()) return;
			if (error != null) setStatus(Component.literal(SkinSource.message(error)), Theme.ERROR);
			else setCandidate(found);
		}));
	}

	private void browse() {
		if (busy) return;
		busy = true;
		setStatus(Lang.tr("fvcskins.status.picking"), Theme.TEXT_DIM);
		// tinyfd blocks until the dialog closes, so keep it off the render thread.
		Thread thread = new Thread(() -> {
			String picked;
			try (MemoryStack stack = MemoryStack.stackPush()) {
				PointerBuffer filters = stack.mallocPointer(1);
				filters.put(stack.UTF8("*.png"));
				filters.flip();
				picked = TinyFileDialogs.tinyfd_openFileDialog(
						Lang.str("fvcskins.browse.title"), null, filters, "PNG skin", false);
			} catch (Throwable t) {
				picked = null;
			}
			String path = picked;
			minecraft.execute(() -> {
				busy = false;
				if (!isOpen()) return;
				if (path == null) {
					setStatus(introStatus(), Theme.TEXT_DIM);
					return;
				}
				loadFile(Path.of(path));
			});
		}, "FvC Skins file picker");
		thread.setDaemon(true);
		thread.start();
	}

	@Override
	public void onFilesDrop(List<Path> files) {
		if (busy) return;
		files.stream()
				.filter(f -> f.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".png") && Files.isRegularFile(f))
				.findFirst()
				.ifPresentOrElse(this::loadFile,
						() -> setStatus(Lang.tr("fvcskins.status.drop_png"), Theme.ERROR));
	}

	private void loadFile(Path file) {
		try {
			setCandidate(SkinSource.fromFile(file));
		} catch (SkinSource.SkinException e) {
			setStatus(Component.literal(e.getMessage()), Theme.ERROR);
		}
	}

	private void showCurrent() {
		clearCandidate();
		slim = SkinRepository.currentSkin().model() == PlayerModelType.SLIM;
		setStatus(Lang.tr(SkinRepository.ownBytes() != null ? "fvcskins.status.current" : "fvcskins.status.current_default"),
				Theme.TEXT_DIM);
	}

	private void pickRecent(Recent recent) {
		if (recent.entry().hash().equals(ownHash) && candidate == null) {
			showCurrent();
			return;
		}
		setCandidate(new SkinSource.Found(recent.entry().png(), recent.entry().slim(),
				Lang.str("fvcskins.recent.label")));
	}

	// ------------------------------------------------------------------ Apply

	private void apply() {
		byte[] png = candidate != null ? candidate.png() : SkinRepository.ownBytes();
		if (busy || !canChange || png == null) return;
		run(SkinChanger.apply(png, slim), "fvcskins.status.applying", result -> Lang.tr(result.premium()
				? "fvcskins.status.applied_premium"
				: result.shared() ? "fvcskins.status.applied" : "fvcskins.status.applied_local"));
	}

	private void reset() {
		if (busy || !canChange) return;
		run(SkinChanger.reset(), "fvcskins.status.resetting", result -> Lang.tr(result.premium()
				? "fvcskins.status.reset_premium"
				: "fvcskins.status.reset"));
	}

	private void run(java.util.concurrent.CompletableFuture<SkinChanger.Result> task, String pendingKey,
			java.util.function.Function<SkinChanger.Result, Component> done) {
		busy = true;
		setStatus(Lang.tr(pendingKey), Theme.TEXT_DIM);
		task.whenComplete((result, error) -> minecraft.execute(() -> {
			busy = false;
			// The change itself is already saved; only the screen state is left to update.
			if (!isOpen()) return;
			if (error != null) {
				setStatus(Component.literal(SkinSource.message(error)), Theme.ERROR);
				return;
			}
			clearCandidate();
			loadRecents();
			slim = SkinRepository.currentSkin().model() == PlayerModelType.SLIM;
			Component message = done.apply(result);
			int color = result.shared() ? Theme.SUCCESS : Theme.WARNING;
			rebuildWidgets();
			setStatus(message, color);
		}));
	}

	// ------------------------------------------------------------------ Input & lifecycle

	@Override
	public boolean keyPressed(KeyEvent event) {
		if (field != null && field.isFocused() && event.isConfirmation()) {
			search();
			return true;
		}
		return super.keyPressed(event);
	}

	private boolean isOpen() {
		return minecraft.gui.screen() == this;
	}

	@Override
	public void onClose() {
		minecraft.gui.setScreen(parent);
	}

	@Override
	public void removed() {
		clearCandidate();
		recents.forEach(r -> SkinRepository.release(r.skin()));
		recents.clear();
	}

	// ------------------------------------------------------------------ Drawing

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float a) {
		// Header
		g.centeredText(font, title, width / 2, 10, Theme.TEXT);
		String name = minecraft.getUser().getName();
		Component subtitle = !canChange
				? Lang.tr("fvcskins.subtitle.readonly", name)
				: SkinRepository.isPremium() ? Lang.tr("fvcskins.subtitle.premium", name) : Lang.tr("fvcskins.subtitle", name);
		g.centeredText(font, subtitle, width / 2, 22, Theme.TEXT_MUTED);

		// Preview card: gradient stage, floor shadow, caption
		Theme.round(g, left, top, previewWidth, bottom - top, Theme.PANEL_BORDER);
		g.fillGradient(left + 1, top + 1, left + previewWidth - 1, bottom - 1, 0xE01A2233, 0xE00A0D13);
		int cx = left + previewWidth / 2;
		int floor = bottom - 24;
		for (int i = 0; i < 4; i++) {
			int half = (previewWidth / 3) - i * 7;
			g.fill(cx - half, floor - 2 + i, cx + half, floor - 1 + i, 0x16000000 + (i * 0x06000000));
		}
		String tag = Lang.str(candidate != null ? "fvcskins.tag.preview" : "fvcskins.tag.current");
		int tagWidth = font.width(tag) + 10;
		Theme.round(g, left + 6, top + 6, tagWidth, 12, candidate != null ? Theme.ACCENT_SOFT : 0x30FFFFFF);
		g.text(font, tag, left + 11, top + 8, candidate != null ? Theme.ACCENT_HOVER : Theme.TEXT_DIM, false);
		String caption = candidate != null ? candidate.label() : Lang.str("fvcskins.drag");
		g.centeredText(font, font.plainSubstrByWidth(caption, previewWidth - 12), cx, bottom - 14, Theme.TEXT_MUTED);

		// Controls card
		Theme.panel(g, panelX, top, panelWidth, bottom - top);
		for (int i = 0; i < labels.size(); i++) {
			Theme.label(g, font, labelTexts.get(i), labels.get(i)[0], labels.get(i)[1]);
		}
		int fieldWidth = panelWidth - 20 - 52 - 4;
		Theme.round(g, panelX + 10, fieldY, fieldWidth, 20, Theme.FIELD);
		Theme.border(g, panelX + 10, fieldY, fieldWidth, 20, field.isFocused() ? Theme.ACCENT : Theme.CONTROL_BORDER);

		if (busy) {
			String dots = ".".repeat((int) (System.currentTimeMillis() / 300 % 4));
			if (statusY + 9 <= bottom - 6) g.text(font, status.getString() + dots, panelX + 10, statusY, statusColor, false);
		} else {
			int lineY = statusY;
			for (FormattedCharSequence line : font.split(status, panelWidth - 20)) {
				if (lineY + 9 > bottom - 6) break;
				g.text(font, line, panelX + 10, lineY, statusColor, false);
				lineY += 10;
			}
		}

		super.extractRenderState(g, mouseX, mouseY, a);
	}
}
