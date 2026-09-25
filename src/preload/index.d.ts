import type { FvcApi, SplashApi } from '@shared/ipc'

declare global {
  interface Window {
    fvc: FvcApi
    /** Only in the startup update window (preload/splash.ts). */
    fvcSplash: SplashApi
  }
}

export {}
