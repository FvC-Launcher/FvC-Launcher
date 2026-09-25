import { contextBridge, ipcRenderer } from 'electron'
import { CH, type SplashApi } from '@shared/ipc'
import type { SplashState } from '@shared/types'

const api: SplashApi = {
  getState: () => ipcRenderer.invoke(CH.splashGetState),
  onState: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, state: SplashState): void => cb(state)
    ipcRenderer.on(CH.splashState, listener)
    return () => ipcRenderer.removeListener(CH.splashState, listener)
  },
  retry: () => ipcRenderer.send(CH.splashRetry),
  skip: () => ipcRenderer.send(CH.splashSkip)
}

contextBridge.exposeInMainWorld('fvcSplash', api)
