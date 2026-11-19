import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, isValidCameraAddress, normalizeSettings, SettingsStore } from './settings'

describe('settings', () => {
  it('defaults to the three AW-HE40s from the probe', () => {
    expect(DEFAULT_SETTINGS.cameras.map((c) => c.ip)).toEqual(['192.168.0.11', '192.168.0.12', '192.168.0.13'])
  })

  it('validates addresses', () => {
    expect(isValidCameraAddress('192.168.0.11')).toBe(true)
    expect(isValidCameraAddress('')).toBe(true)
    expect(isValidCameraAddress('127.0.0.1:8081')).toBe(true)
    expect(isValidCameraAddress('192.168.0.256')).toBe(false)
    expect(isValidCameraAddress('camera one')).toBe(false)
  })

  it('repairs a damaged settings file', () => {
    expect(normalizeSettings({ cameras: [{ name: '', ip: 'bad ip' }] }).cameras[0]).toEqual(DEFAULT_SETTINGS.cameras[0])
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('saves and loads', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'camctrl-'))
    const store = new SettingsStore(dir)
    expect(store.load()).toEqual(DEFAULT_SETTINGS)
    const next = normalizeSettings({ cameras: [{ name: 'Wide', ip: '192.168.0.13' }, { name: 'Cam 2', ip: '192.168.0.12' }, { name: 'Cam 3', ip: '192.168.0.11' }] })
    store.save(next)
    expect(new SettingsStore(dir).load()).toEqual(next)
    expect(() => store.save({ cameras: [{ name: 'x', ip: 'nope' }, next.cameras[1], next.cameras[2]] })).toThrow()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
