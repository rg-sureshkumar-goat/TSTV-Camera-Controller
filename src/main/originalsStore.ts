import fs from 'node:fs'
import path from 'node:path'
import type { ImageValues } from '@shared/types'

export interface SavedOriginals {
  values: ImageValues
  savedAt: string
}

/**
 * Remembers each camera's image settings the FIRST time this app reads them
 * (keyed by IP), so "Restore original settings" can put a camera back the way
 * the crew had it before anyone touched it from this app. Never overwritten
 * automatically; the file is image-originals.json in the app's settings folder.
 */
export class OriginalsStore {
  private readonly file: string
  private data: Record<string, SavedOriginals>

  constructor(dir: string) {
    this.file = path.join(dir, 'image-originals.json')
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    } catch {
      this.data = {}
    }
  }

  get(ip: string): SavedOriginals | undefined {
    return this.data[ip]
  }

  /** Saves only if nothing is stored for this IP yet. Returns what is stored. */
  saveIfMissing(ip: string, values: ImageValues): SavedOriginals {
    const existing = this.data[ip]
    if (existing) return existing
    const entry = { values, savedAt: new Date().toISOString() }
    this.data[ip] = entry
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      fs.renameSync(tmp, this.file)
    } catch (err) {
      console.log(`Could not save original image settings: ${(err as Error).message}`)
    }
    return entry
  }
}
