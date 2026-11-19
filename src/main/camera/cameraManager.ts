import { EventEmitter } from 'node:events'
import type { AppSettings, CameraSlot, CameraStatus } from '@shared/types'
import { CameraConnection, type SenderFactory } from './cameraConnection'
import { httpGet } from './httpClient'

const defaultSenderFactory: SenderFactory = (ip) => (path, timeoutMs) => httpGet(ip, path, timeoutMs)

/** Owns the three camera connections (Cam 1–3), each with its own command queue. */
export class CameraManager extends EventEmitter {
  private readonly connections: CameraConnection[]

  constructor(settings: AppSettings, makeSender: SenderFactory = defaultSenderFactory) {
    super()
    this.connections = settings.cameras.map((config, i) => {
      const c = new CameraConnection(i as CameraSlot, config, makeSender)
      c.on('status', () => this.emit('statuses', this.statuses()))
      return c
    })
  }

  start(): void {
    for (const c of this.connections) c.start()
  }

  stop(): void {
    for (const c of this.connections) c.stop()
  }

  applySettings(settings: AppSettings): void {
    settings.cameras.forEach((config, i) => this.connections[i].setConfig(config))
  }

  statuses(): CameraStatus[] {
    return this.connections.map((c) => c.status)
  }

  camera(slot: number): CameraConnection | undefined {
    return Number.isInteger(slot) ? this.connections[slot] : undefined
  }

  /**
   * Safety hook: called when the window loses focus, hides, crashes or the app
   * quits. Sends pan/tilt, zoom and focus stops to every camera the app moved.
   */
  stopAllMotion(reason: string): void {
    for (const c of this.connections) c.stopMotion(reason)
  }
}
