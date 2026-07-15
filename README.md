# FvC Launcher

A modern, premium Minecraft launcher — isolated profiles, Modrinth integration with automatic
dependencies, Microsoft & offline accounts, and support for Fabric, Forge, NeoForge and Quilt.

Windows and Linux (Windows-first).

## Features

- **Profiles** — CurseForge-style isolated instances: each profile has its own mods, configs,
  resource packs, shader packs, saves, screenshots and logs. Create, duplicate, rename, favorite,
  export/import (`.fvcpack`), repair, open folder.
- **Mods / Resource Packs / Shaders** — live Modrinth search with compatibility filtering
  (Minecraft version + loader), one-click install with automatic required-dependency resolution,
  update detection via file hashes, enable/disable, dependency-aware removal.
- **Accounts** — Microsoft OAuth (msmc) with tokens encrypted via Electron `safeStorage` and
  automatic refresh; offline accounts with deterministic UUIDs. Multiple accounts, instant switching.
- **Launching** — verifies game files, installs the loader, downloads the right Java (Adoptium)
  automatically, streams the game log into a built-in console, tracks play time.
- **Downloads** — central download manager with concurrency, progress/speed/ETA, pause, resume,
  retry, cancel and speed limiting.
- **Design** — dark glass UI, Inter typography, animated sidebar/pages/dialogs (framer-motion),
  configurable accent color, corner radius, blur, animation speed, compact mode and background image.

## Development

```bash
npm install
npm run dev
```

> Note: launching from inside another Electron-based tool (e.g. VS Code terminals) can inherit
> environment variables that break the app: `ELECTRON_RUN_AS_NODE=1` (electron API undefined) and
> `CHROME_CRASHPAD_PIPE_NAME` (instant silent exit with code 0). Unset both if the window doesn't
> appear. A regular standalone terminal needs nothing special.

## Type checking

```bash
npm run typecheck
```

## Packaging

```bash
npm run dist:win     # Windows NSIS installer → dist/
npm run dist:linux   # Linux AppImage + deb → dist/
```

The app icon lives in `build/icon.png` (installer artwork, converted per-platform by
electron-builder) and `resources/icon.png` (window/taskbar icon).

## Architecture

- `src/main` — Electron main process: window/state, settings, accounts (msmc + safeStorage),
  profiles, Modrinth API, download queue, Java detection/provisioning, launch pipeline
  (minecraft-launcher-core; Fabric/Quilt via meta JSON profiles, Forge/NeoForge via installer jars).
- `src/preload` — typed `window.fvc` context bridge.
- `src/renderer` — React 18 + Zustand + framer-motion + lucide icons.
- `src/shared` — domain types and the IPC contract shared by all three.

Game data lives in the Electron `userData` dir: shared `meta/` (versions, libraries, assets, Java)
and isolated `instances/<profile-id>/` game directories.

Not affiliated with Mojang, Microsoft or Modrinth.
