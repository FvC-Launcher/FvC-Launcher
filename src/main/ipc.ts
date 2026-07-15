import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { totalmem } from 'os'
import { rmSync } from 'fs'
import { CH } from '@shared/ipc'
import { notify } from './broadcast'
import { paths } from './paths'
import { settingsService } from './services/settings'
import { accountsService } from './services/accounts'
import { profilesService } from './services/profiles'
import { contentService } from './services/content'
import { modrinthService } from './services/modrinth'
import { versionsService } from './services/versions'
import { javaService } from './services/java'
import { launchService } from './services/launch'
import { downloadsService } from './services/downloads'
import { newsService } from './services/news'
import { modpacksService } from './services/modpacks'
import { legalService } from './services/legal'
import { hwidService } from './services/hwid'
import { updaterService } from './services/updater'

export function registerIpc(): void {
  // Window controls
  ipcMain.on(CH.winMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on(CH.winMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(CH.winClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle(CH.winIsMaximized, (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })

  // Settings
  ipcMain.handle(CH.settingsGet, () => settingsService.get())
  ipcMain.handle(CH.settingsSet, (_e, patch) => settingsService.set(patch))
  ipcMain.handle(CH.settingsReset, () => settingsService.reset())

  // Accounts
  ipcMain.handle(CH.accountsList, () => accountsService.list())
  ipcMain.handle(CH.accountsGetActive, () => accountsService.getActiveId())
  ipcMain.handle(CH.accountsSetActive, (_e, id) => accountsService.setActive(id))
  ipcMain.handle(CH.accountsAddOffline, (_e, username) => accountsService.addOffline(username))
  ipcMain.handle(CH.accountsLoginMs, () => accountsService.loginMicrosoft())
  ipcMain.handle(CH.accountsRefresh, (_e, id) => accountsService.refresh(id))
  ipcMain.handle(CH.accountsRemove, (_e, id) => accountsService.remove(id))

  // Profiles
  ipcMain.handle(CH.profilesList, () => profilesService.list())
  ipcMain.handle(CH.profilesCreate, (_e, input) => {
    const profile = profilesService.create(input)
    // Fabric mods almost always need Fabric API — install it automatically.
    if (profile.loader === 'fabric') {
      void modrinthService
        .install(profile.id, 'mod', 'fabric-api')
        .then(() =>
          notify({
            type: 'success',
            title: 'Fabric API installed',
            body: `Added automatically to ${profile.name}.`
          })
        )
        .catch((err) =>
          notify({
            type: 'warning',
            title: 'Could not add Fabric API',
            body: err instanceof Error ? err.message : String(err)
          })
        )
    }
    return profile
  })
  ipcMain.handle(CH.profilesUpdate, (_e, id, patch) => profilesService.update(id, patch))
  ipcMain.handle(CH.profilesDuplicate, (_e, id) => profilesService.duplicate(id))
  ipcMain.handle(CH.profilesRemove, (_e, id) => profilesService.remove(id))
  ipcMain.handle(CH.profilesOpenFolder, (_e, id) => profilesService.openFolder(id))
  ipcMain.handle(CH.profilesExport, (_e, id) => profilesService.export(id))
  ipcMain.handle(CH.profilesImport, () => profilesService.import())
  ipcMain.handle(CH.profilesRepair, (_e, id) => profilesService.repair(id))
  ipcMain.handle(CH.profilesGetSelected, () => profilesService.getSelectedId())
  ipcMain.handle(CH.profilesSetSelected, (_e, id) => profilesService.setSelected(id))

  // Installed content
  ipcMain.handle(CH.contentList, (_e, pid, kind) => contentService.list(pid, kind))
  ipcMain.handle(CH.contentToggle, (_e, pid, kind, file, enabled) =>
    contentService.toggle(pid, kind, file, enabled)
  )
  ipcMain.handle(CH.contentRemove, (_e, pid, kind, file, keepConfig) =>
    contentService.remove(pid, kind, file, keepConfig)
  )
  ipcMain.handle(CH.contentCheckUpdates, (_e, pid, kind) => contentService.checkUpdates(pid, kind))
  ipcMain.handle(CH.contentUpdate, (_e, pid, kind, file) => contentService.update(pid, kind, file))
  ipcMain.handle(CH.contentDependents, (_e, pid, file) => contentService.dependents(pid, file))

  // Modrinth
  ipcMain.handle(CH.mrSearch, (_e, params) => modrinthService.search(params))
  ipcMain.handle(CH.mrProject, (_e, id) => modrinthService.project(id))
  ipcMain.handle(CH.mrVersions, (_e, id, gv, loader) => modrinthService.versions(id, gv, loader))
  ipcMain.handle(CH.mrInstall, (_e, pid, kind, projectId, versionId) =>
    modrinthService.install(pid, kind, projectId, versionId)
  )
  ipcMain.handle(CH.mrFeatured, () => modrinthService.featured())

  // Versions
  ipcMain.handle(CH.versionsMc, (_e, snapshots) => versionsService.minecraft(snapshots))
  ipcMain.handle(CH.versionsLoader, (_e, loader, gv) => versionsService.loader(loader, gv))

  // Java
  ipcMain.handle(CH.javaDetect, () => javaService.detect())
  ipcMain.handle(CH.javaPick, () => javaService.pickExecutable())

  // Launch
  ipcMain.handle(CH.launchStart, (_e, pid) => launchService.start(pid))
  ipcMain.handle(CH.launchKill, () => launchService.kill())
  ipcMain.handle(CH.launchGetState, () => launchService.getState())

  // Downloads
  ipcMain.handle(CH.dlList, () => downloadsService.list())
  ipcMain.handle(CH.dlCancel, (_e, id) => downloadsService.cancel(id))
  ipcMain.handle(CH.dlRetry, (_e, id) => downloadsService.retry(id))
  ipcMain.handle(CH.dlPause, (_e, id) => downloadsService.pause(id))
  ipcMain.handle(CH.dlResume, (_e, id) => downloadsService.resume(id))
  ipcMain.handle(CH.dlClearFinished, () => downloadsService.clearFinished())

  // System
  ipcMain.handle(CH.sysTotalRam, () => Math.floor(totalmem() / 1024 / 1024))
  ipcMain.handle(CH.sysOpenLogs, () => shell.openPath(paths.logs))
  ipcMain.handle(CH.sysClearCache, () => {
    rmSync(paths.cache, { recursive: true, force: true })
  })
  ipcMain.on(CH.sysOpenExternal, (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
  ipcMain.handle(CH.sysPickImage, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return 'fvc-file:///' + result.filePaths[0].replace(/\\/g, '/')
  })
  ipcMain.handle(CH.sysAppVersion, () => app.getVersion())

  // News
  ipcMain.handle(CH.newsLauncher, () => newsService.launcher())

  // Modpacks
  ipcMain.handle(CH.modpackInstall, (_e, input) => modpacksService.install(input))

  // Legal
  ipcMain.handle(CH.legalStatus, () => legalService.status())
  ipcMain.handle(CH.legalAccept, () => legalService.accept())

  // Updater
  ipcMain.handle(CH.updaterCheck, () => updaterService.check())
  ipcMain.handle(CH.updaterDownload, () => updaterService.download())
  ipcMain.on(CH.updaterInstall, () => updaterService.install())
  ipcMain.handle(CH.updaterGetState, () => updaterService.getState())

  // HWID + app lifecycle
  ipcMain.handle(CH.hwidStatus, () => hwidService.status())
  ipcMain.handle(CH.hwidAutofix, () => hwidService.autofix())
  ipcMain.on(CH.appRelaunch, () => {
    app.relaunch()
    app.exit(0)
  })
  ipcMain.on(CH.appExit, () => app.exit(0))
}
