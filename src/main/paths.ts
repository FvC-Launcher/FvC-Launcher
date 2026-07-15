import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

/**
 * Data layout (inside Electron userData):
 *   settings.json / accounts.json / profiles.json / window-state.json
 *   meta/            shared minecraft root (versions, libraries, assets)
 *   meta/java/       managed java runtimes
 *   instances/<id>/  per-profile isolated game directory
 *   cache/           modrinth + icon cache
 *   logs/            launcher logs
 */
export const paths = {
  get userData() {
    return app.getPath('userData')
  },
  get meta() {
    return join(this.userData, 'meta')
  },
  get javaDir() {
    return join(this.meta, 'java')
  },
  get instances() {
    return join(this.userData, 'instances')
  },
  get cache() {
    return join(this.userData, 'cache')
  },
  get logs() {
    return join(this.userData, 'logs')
  },
  instance(profileId: string) {
    return join(this.instances, profileId)
  },
  file(name: string) {
    return join(this.userData, name)
  }
}

export function ensureDirs(): void {
  for (const dir of [paths.meta, paths.javaDir, paths.instances, paths.cache, paths.logs]) {
    mkdirSync(dir, { recursive: true })
  }
}
