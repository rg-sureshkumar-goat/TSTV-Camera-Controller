import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings, CameraConfig } from '@shared/types'
import { isIPv4 } from './network'

/** Defaults from the Checkpoint 1 probe (docs/PROBE_RESULTS.md): the three AW-HE40s, in IP order. */
export const DEFAULT_SETTINGS: AppSettings = {
  cameras: [
    { name: 'Cam 1', ip: '192.168.0.11' },
    { name: 'Cam 2', ip: '192.168.0.12' },
    { name: 'Cam 3', ip: '192.168.0.13' }
  ]
}

/** Accepts "", an IPv4 address, or "host:port" (for the fake-camera test server). */
export function isValidCameraAddress(value: string): boolean {
  const v = value.trim()
  if (v === '') return true
  if (isIPv4(v)) return true
  const m = /^([A-Za-z0-9.-]+):(\d{1,5})$/.exec(v)
  return !!m && Number(m[2]) > 0 && Number(m[2]) < 65536
}

export function normalizeSettings(input: unknown): AppSettings {
  const cams = (input as { cameras?: unknown })?.cameras
  const list = Array.isArray(cams) ? cams : []
  const cameras = [0, 1, 2].map((i): CameraConfig => {
    const c = (list[i] ?? {}) as Partial<CameraConfig>
    const fallback = DEFAULT_SETTINGS.cameras[i]
    const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 40) : fallback.name
    const ip = typeof c.ip === 'string' && isValidCameraAddress(c.ip) ? c.ip.trim() : fallback.ip
    return { name, ip }
  }) as AppSettings['cameras']
  return { cameras }
}

export class SettingsStore {
  private readonly file: string

  constructor(dir: string) {
    this.file = path.join(dir, 'settings.json')
  }

  load(): AppSettings {
    try {
      return normalizeSettings(JSON.parse(fs.readFileSync(this.file, 'utf8')))
    } catch {
      return structuredClone(DEFAULT_SETTINGS)
    }
  }

  save(settings: AppSettings): AppSettings {
    for (const c of settings.cameras) {
      if (!isValidCameraAddress(c.ip)) throw new Error(`"${c.ip}" is not a valid IP address.`)
    }
    const clean = normalizeSettings(settings)
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), 'utf8')
    fs.renameSync(tmp, this.file) // atomic replace, so a crash never leaves a half-written file
    return clean
  }
}
