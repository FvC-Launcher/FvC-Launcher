// ---------------------------------------------------------------------------
// EULA & Privacy Policy. Bump a version when its text changes — the
// first-launch dialog re-appears until the new version is accepted.
// ---------------------------------------------------------------------------

export const EULA_VERSION = '1.1'
export const PRIVACY_VERSION = '1.1'

export const EULA_TEXT = `# End User License Agreement (EULA)

**FvC Launcher — Version ${EULA_VERSION}**

This End User License Agreement ("Agreement") is a legal agreement between you and the FvC Launcher project ("we", "us") covering your use of the FvC Launcher desktop application ("the Launcher").

By checking "I have read and agree to the End User License Agreement" you accept this Agreement. If you do not agree, do not use the Launcher.

## 1. License

We grant you a personal, non-exclusive, non-transferable, revocable license to install and use the Launcher on devices you own or control, for personal, non-commercial use.

You may not:

- sell, rent or redistribute the Launcher as your own product;
- remove or misrepresent its branding or origin;
- use the Launcher to violate any third-party terms, including the Minecraft EULA;
- attempt to bypass, disable or tamper with the Launcher's integrity and access-control features.

## 2. Not affiliated

The Launcher is an independent project. It is **not** affiliated with, endorsed by, or sponsored by Mojang AB, Microsoft Corporation, Modrinth, or CurseForge. "Minecraft" is a trademark of Mojang AB.

## 3. Your game account

The Launcher supports signing in with a Microsoft account through Microsoft's official authentication flow. You are responsible for your account credentials and for owning a valid Minecraft: Java Edition license. Offline mode is provided for legitimate uses such as singleplayer and testing; you are responsible for complying with the Minecraft EULA when using it.

## 4. Third-party content and services

Mods, modpacks, resource packs and shader packs are created by third parties and downloaded from third-party services (primarily Modrinth). We do not control and are not responsible for third-party content, its licenses, or its behavior. The Launcher also connects to Mojang/Microsoft servers (game files, authentication), Adoptium (Java runtimes) and mcheads.org (avatar images).

## 5. Launcher integrity and access control (HWID)

On first launch the Launcher derives a hardware-based identifier ("HWID") from stable, non-personal characteristics of your device (see the Privacy Policy). The HWID is hashed and stored only on your device in a protected record. It exists solely to support launcher integrity verification and access-control features described in this Agreement, such as detecting corrupted installations. It is not designed to personally identify you and is never used for advertising.

## 6. Updates

The Launcher may check for updates when this feature is enabled in Settings. Updated versions of this Agreement or the Privacy Policy may be presented for acceptance before continued use.

## 7. No warranty

THE LAUNCHER IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. WE DO NOT WARRANT THAT IT WILL BE ERROR-FREE, THAT GAME OR MOD CONTENT WILL WORK, OR THAT THIRD-PARTY SERVICES WILL REMAIN AVAILABLE.

## 8. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF DATA, SAVES OR PROFILES, ARISING FROM THE USE OF THE LAUNCHER.

## 9. Termination

This license ends automatically if you breach this Agreement. You may end it at any time by uninstalling the Launcher and deleting its data directory.

## 10. Contact

Questions about this Agreement can be raised through the project's public repository or support channels listed on the About page.
`

export const PRIVACY_TEXT = `# Privacy Policy

**FvC Launcher — Version ${PRIVACY_VERSION}**

This policy explains what information FvC Launcher ("the Launcher") stores and transmits. The short version: **everything stays on your device; we operate no servers and collect no analytics.**

## 1. Data stored locally on your device

- **Settings** — launcher preferences (theme, RAM defaults, download options).
- **Profiles** — profile names, versions, loaders, play time, and the files inside each profile folder (mods, configs, saves, screenshots).
- **Accounts** — your Minecraft username and UUID. For Microsoft accounts, authentication tokens are stored **encrypted** using your operating system's secure storage (DPAPI on Windows, keyring on Linux). Your Microsoft password is never seen or stored by the Launcher.
- **Hardware identifier (HWID)** — a cryptographic hash derived from stable, non-personal device characteristics (such as an OS installation identifier and CPU model). Raw values are not stored — only hashes — inside a protected, integrity-checked record. It never leaves your device.
- **Legal acceptance** — which versions of the EULA and this policy you accepted, and when.

This data lives in the Launcher's application-data directory and is removed if you delete that directory or uninstall the Launcher.

## 2. Data transmitted to third parties

The Launcher only makes network requests needed to do its job:

- **Microsoft / Mojang** — official sign-in (OAuth) and downloading game files. Governed by Microsoft's privacy statement.
- **Modrinth** — searching and downloading mods, modpacks, resource packs and shaders. Search text you type is sent to the Modrinth API.
- **Fabric / Quilt / Forge / NeoForge** — downloading mod-loader files.
- **Adoptium** — downloading Java runtimes.
- **mcheads.org** — fetching your Minecraft head avatar using your public username (Microsoft accounts only).

Each request includes a standard launcher user-agent string. We add no tracking identifiers to these requests.

## 3. What we do NOT do

- No analytics, telemetry or usage tracking.
- No advertising and no sale of data.
- No transmission of your HWID, settings, profiles or file lists to us or anyone else.
- No storage of passwords.

## 4. Your controls

- **Sign out** — removing an account deletes its stored tokens immediately.
- **Clear cache** — Settings → Advanced removes cached API data and installers.
- **Full removal** — uninstalling the Launcher and deleting its data directory removes everything described above.

## 5. Children

The Launcher does not knowingly collect personal information from anyone, including children.

## 6. Changes

If this policy changes, the new version is shown for acceptance on the next launch before the Launcher can be used.
`
