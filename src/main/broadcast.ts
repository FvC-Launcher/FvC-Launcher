import { BrowserWindow } from 'electron'
import { CH } from '@shared/ipc'
import type { NotificationPayload } from '@shared/types'

/** Send an event to every renderer window. */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

export function notify(n: NotificationPayload): void {
  broadcast(CH.notify, n)
}
