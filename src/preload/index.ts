import { contextBridge, ipcRenderer } from 'electron'
import { CH, type FvcApi } from '@shared/ipc'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: FvcApi = {
  window: {
    minimize: () => ipcRenderer.send(CH.winMinimize),
    maximize: () => ipcRenderer.send(CH.winMaximize),
    close: () => ipcRenderer.send(CH.winClose),
    isMaximized: () => ipcRenderer.invoke(CH.winIsMaximized),
    onMaximizedChange: (cb) => subscribe(CH.winMaximizedChanged, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet),
    set: (patch) => ipcRenderer.invoke(CH.settingsSet, patch),
    reset: () => ipcRenderer.invoke(CH.settingsReset)
  },
  accounts: {
    list: () => ipcRenderer.invoke(CH.accountsList),
    getActive: () => ipcRenderer.invoke(CH.accountsGetActive),
    setActive: (id) => ipcRenderer.invoke(CH.accountsSetActive, id),
    addOffline: (username) => ipcRenderer.invoke(CH.accountsAddOffline, username),
    loginMicrosoft: () => ipcRenderer.invoke(CH.accountsLoginMs),
    refresh: (id) => ipcRenderer.invoke(CH.accountsRefresh, id),
    remove: (id) => ipcRenderer.invoke(CH.accountsRemove, id)
  },
  profiles: {
    list: () => ipcRenderer.invoke(CH.profilesList),
    create: (input) => ipcRenderer.invoke(CH.profilesCreate, input),
    update: (id, patch) => ipcRenderer.invoke(CH.profilesUpdate, id, patch),
    duplicate: (id) => ipcRenderer.invoke(CH.profilesDuplicate, id),
    remove: (id) => ipcRenderer.invoke(CH.profilesRemove, id),
    openFolder: (id) => ipcRenderer.invoke(CH.profilesOpenFolder, id),
    exportProfile: (id) => ipcRenderer.invoke(CH.profilesExport, id),
    importProfile: () => ipcRenderer.invoke(CH.profilesImport),
    repair: (id) => ipcRenderer.invoke(CH.profilesRepair, id),
    getSelected: () => ipcRenderer.invoke(CH.profilesGetSelected),
    setSelected: (id) => ipcRenderer.invoke(CH.profilesSetSelected, id)
  },
  content: {
    list: (pid, kind) => ipcRenderer.invoke(CH.contentList, pid, kind),
    toggle: (pid, kind, file, enabled) =>
      ipcRenderer.invoke(CH.contentToggle, pid, kind, file, enabled),
    remove: (pid, kind, file, keepConfig) =>
      ipcRenderer.invoke(CH.contentRemove, pid, kind, file, keepConfig),
    checkUpdates: (pid, kind) => ipcRenderer.invoke(CH.contentCheckUpdates, pid, kind),
    update: (pid, kind, file) => ipcRenderer.invoke(CH.contentUpdate, pid, kind, file),
    dependents: (pid, file) => ipcRenderer.invoke(CH.contentDependents, pid, file)
  },
  modrinth: {
    search: (params) => ipcRenderer.invoke(CH.mrSearch, params),
    project: (id) => ipcRenderer.invoke(CH.mrProject, id),
    versions: (id, gv, loader) => ipcRenderer.invoke(CH.mrVersions, id, gv, loader),
    install: (pid, kind, projectId, versionId) =>
      ipcRenderer.invoke(CH.mrInstall, pid, kind, projectId, versionId),
    featured: () => ipcRenderer.invoke(CH.mrFeatured)
  },
  versions: {
    minecraft: (snapshots) => ipcRenderer.invoke(CH.versionsMc, snapshots),
    loader: (loader, gv) => ipcRenderer.invoke(CH.versionsLoader, loader, gv)
  },
  java: {
    detect: () => ipcRenderer.invoke(CH.javaDetect),
    pickExecutable: () => ipcRenderer.invoke(CH.javaPick)
  },
  launch: {
    start: (pid) => ipcRenderer.invoke(CH.launchStart, pid),
    kill: () => ipcRenderer.invoke(CH.launchKill),
    getState: () => ipcRenderer.invoke(CH.launchGetState),
    onState: (cb) => subscribe(CH.launchState, cb),
    onLog: (cb) => subscribe(CH.launchLog, cb)
  },
  downloads: {
    list: () => ipcRenderer.invoke(CH.dlList),
    cancel: (id) => ipcRenderer.invoke(CH.dlCancel, id),
    retry: (id) => ipcRenderer.invoke(CH.dlRetry, id),
    pause: (id) => ipcRenderer.invoke(CH.dlPause, id),
    resume: (id) => ipcRenderer.invoke(CH.dlResume, id),
    clearFinished: () => ipcRenderer.invoke(CH.dlClearFinished),
    onUpdate: (cb) => subscribe(CH.dlUpdate, cb)
  },
  system: {
    totalRamMb: () => ipcRenderer.invoke(CH.sysTotalRam),
    openLogs: () => ipcRenderer.invoke(CH.sysOpenLogs),
    clearCache: () => ipcRenderer.invoke(CH.sysClearCache),
    openExternal: (url) => ipcRenderer.send(CH.sysOpenExternal, url),
    pickImage: () => ipcRenderer.invoke(CH.sysPickImage),
    appVersion: () => ipcRenderer.invoke(CH.sysAppVersion),
    platform: process.platform
  },
  news: {
    launcher: () => ipcRenderer.invoke(CH.newsLauncher)
  },
  modpacks: {
    install: (input) => ipcRenderer.invoke(CH.modpackInstall, input),
    onProgress: (cb) => subscribe(CH.modpackProgress, cb)
  },
  curseforge: {
    searchPacks: (params) => ipcRenderer.invoke(CH.cfSearch, params),
    install: (input) => ipcRenderer.invoke(CH.cfInstall, input),
    pickZip: () => ipcRenderer.invoke(CH.cfPickZip),
    installZip: (input) => ipcRenderer.invoke(CH.cfInstallZip, input),
    hasApiKey: () => ipcRenderer.invoke(CH.cfHasKey)
  },
  legal: {
    status: () => ipcRenderer.invoke(CH.legalStatus),
    accept: () => ipcRenderer.invoke(CH.legalAccept)
  },
  hwid: {
    status: () => ipcRenderer.invoke(CH.hwidStatus),
    autofix: () => ipcRenderer.invoke(CH.hwidAutofix),
    onFixProgress: (cb) => subscribe(CH.hwidFixProgress, cb),
    relaunch: () => ipcRenderer.send(CH.appRelaunch),
    exit: () => ipcRenderer.send(CH.appExit)
  },
  updater: {
    check: () => ipcRenderer.invoke(CH.updaterCheck),
    download: () => ipcRenderer.invoke(CH.updaterDownload),
    install: () => ipcRenderer.send(CH.updaterInstall),
    getState: () => ipcRenderer.invoke(CH.updaterGetState),
    onState: (cb) => subscribe(CH.updaterState, cb)
  },
  onNotification: (cb) => subscribe(CH.notify, cb),
  onProfilesChanged: (cb) => subscribe(CH.profilesChanged, cb),
  onAccountsChanged: (cb) => subscribe(CH.accountsChanged, cb)
}

contextBridge.exposeInMainWorld('fvc', api)
