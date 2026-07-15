import type { FvcApi } from '@shared/ipc'

declare global {
  interface Window {
    fvc: FvcApi
  }
}

export {}
