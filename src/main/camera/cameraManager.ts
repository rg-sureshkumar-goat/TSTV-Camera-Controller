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

  /**
   * Safety hook: called when the window loses focus, is hidden, or the app quits.
   * Checkpoint 2 sends no movement, so there is nothing to stop yet.
   * Checkpoint 3 sends pan/tilt, zoom and focus stop commands to every camera from here.
   */
  stopAllMotion(_reason: string): void {
    // Intentionally empty until Checkpoint 3 adds movement.
  }
}
