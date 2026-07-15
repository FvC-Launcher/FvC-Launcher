import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'fs'
import { dirname } from 'path'

/** Minimal atomic JSON file store. */
export class JsonStore<T> {
  private data: T

  constructor(
    private filePath: string,
    private defaults: T
  ) {
    this.data = this.load()
  }

  private load(): T {
    try {
      if (existsSync(this.filePath)) {
        const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
        // Shallow-merge defaults so new fields appear after updates.
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          return { ...this.defaults, ...raw }
        }
        return raw as T
      }
    } catch (err) {
      console.error(`[store] failed to read ${this.filePath}:`, err)
    }
    return structuredClone(this.defaults)
  }

  get(): T {
    return this.data
  }

  set(value: T): void {
    this.data = value
    this.persist()
  }

  patch(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch }
    this.persist()
    return this.data
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = this.filePath + '.tmp'
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (err) {
      console.error(`[store] failed to write ${this.filePath}:`, err)
    }
  }
}
