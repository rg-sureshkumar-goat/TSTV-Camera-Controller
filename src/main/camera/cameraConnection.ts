import { EventEmitter } from 'node:events'
import type { CameraConfig, CameraSlot, CameraStatus, CameraValues } from '@shared/types'
import { CommandQueue, type Sender } from './commandQueue'
import {
  decodeAutoManual,
  decodeGain,
  decodeHexPosition,
  decodePower,
  decodePresetBlock,
  decodeShutter,
  decodeWhiteBalance,
  parseReply,
  valueAfter,
  type CameraCommand
} from './protocol'
import type { HttpReply } from './httpClient'

/** How often the app checks each camera is still there. */
export const HEARTBEAT_INTERVAL_MS = 1000
/** Missed heartbeats in a row before a camera is shown as offline (about 2–4 s after unplugging). */
export const FAILURES_BEFORE_OFFLINE = 2
/** How often image values are re-read, so the panel follows changes made on the RP50. */
export const VALUES_REFRESH_MS = 5000
/** How often the list of saved presets is re-read. */
export const PRESETS_REFRESH_MS = 30000

const ptz = (cmd: string): CameraCommand => ({ endpoint: 'aw_ptz', cmd })
const cam = (cmd: string): CameraCommand => ({ endpoint: 'aw_cam', cmd })

export type SenderFactory = (ip: string) => Sender

/**
 * Watches one camera: a heartbeat query every second, plus a slower read of
 * its current values. Sends only read-only queries (enforced by the queue).
 * Emits 'status' whenever anything shown on screen changes.
 */
export class CameraConnection extends EventEmitter {
  private queue: CommandQueue | null = null
  private timer: NodeJS.Timeout | null = null
  private running = false
  private failures = 0
  private lastValuesAt = 0
  private lastPresetsAt = 0
  private readingValues = false
  private generation = 0 // bumps when the IP changes, so late replies from the old IP are ignored
  private current: CameraStatus

  constructor(
    readonly slot: CameraSlot,
    private config: CameraConfig,
    private readonly makeSender: SenderFactory
  ) {
    super()
    this.current = this.freshStatus()
  }

  get status(): CameraStatus {
    return this.current
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.resetForConfig()
    void this.tick()
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.queue?.close()
    this.queue = null
  }

  setConfig(config: CameraConfig): void {
    const ipChanged = config.ip.trim() !== this.config.ip.trim()
    this.config = config
    if (ipChanged) {
      this.resetForConfig()
      if (this.running) {
        if (this.timer) clearTimeout(this.timer)
        void this.tick()
      }
    } else {
      this.update({ name: config.name })
    }
  }

  private freshStatus(): CameraStatus {
    const ip = this.config.ip.trim()
    return {
      slot: this.slot,
      name: this.config.name,
      ip,
      state: ip ? 'connecting' : 'not-set',
      message: ip ? 'Contacting camera…' : 'No IP address set. Open Settings to add one.',
      values: {}
    }
  }

  private resetForConfig(): void {
    this.generation++
    this.queue?.close()
    const ip = this.config.ip.trim()
    this.queue = ip ? new CommandQueue(this.makeSender(ip)) : null
    this.failures = 0
    this.lastValuesAt = 0
    this.lastPresetsAt = 0
    this.current = this.freshStatus()
    this.emit('status', this.current)
  }

  private update(patch: Partial<CameraStatus>): void {
    const next = { ...this.current, ...patch }
    if (JSON.stringify(next) === JSON.stringify(this.current)) return
    this.current = next
    this.emit('status', this.current)
  }

  private setValues(patch: Partial<CameraValues>): void {
    this.update({ values: { ...this.current.values, ...patch } })
  }

  private scheduleNext(): void {
    if (!this.running) return
    this.timer = setTimeout(() => void this.tick(), HEARTBEAT_INTERVAL_MS)
  }

  private async tick(): Promise<void> {
    this.timer = null
    const queue = this.queue
    const gen = this.generation
    if (!this.running) return
    if (!queue) {
      this.scheduleNext()
      return
    }

    let reply: HttpReply | undefined
    try {
      reply = await queue.enqueue(ptz('#O'))
    } catch {
      reply = undefined
    }
    if (gen !== this.generation) return // IP changed while waiting; a new tick is already running

    if (!reply) {
      this.failures++
      if (this.failures >= FAILURES_BEFORE_OFFLINE && this.current.state !== 'offline') {
        queue.clearPending('Camera offline')
        this.update({
          state: 'offline',
          message: `No answer from ${this.config.ip}. Check the Ethernet cable and that this laptop is on the camera network.`
        })
      }
      this.scheduleNext()
      return
    }

    this.failures = 0
    this.handleHeartbeat(reply)

    if (this.current.state === 'connected') {
      const now = Date.now()
      if (!this.readingValues && now - this.lastValuesAt >= VALUES_REFRESH_MS) {
        void this.readValues(queue, gen, now - this.lastPresetsAt >= PRESETS_REFRESH_MS)
      }
    }
    this.scheduleNext()
  }

  private handleHeartbeat(reply: HttpReply): void {
    const lastSeen = Date.now()
    if (reply.status === 401) {
      this.update({
        state: 'login-required',
        lastSeen,
        message: 'This camera asks for a username and password (User auth is on). Control is not possible until it is turned off or a login is added.'
      })
      return
    }
    if (reply.status !== 200) {
      this.update({
        state: 'not-a-camera',
        lastSeen,
        message: `Something answered at ${this.config.ip} (HTTP ${reply.status}), but it is not a Panasonic camera.`
      })
      return
    }
    const parsed = parseReply(reply.body)
    const power = parsed.kind === 'ok' ? decodePower(parsed.text) : undefined
    const wasConnected = this.current.state === 'connected'
    if (!wasConnected) this.lastValuesAt = 0 // read everything straight away after (re)connecting
    this.update({
      state: 'connected',
      lastSeen,
      message: power === 'standby' ? 'Connected. Camera is in standby (powered down).' : 'Connected',
      values: { ...this.current.values, power: power ?? this.current.values.power }
    })
  }

  private async readValues(queue: CommandQueue, gen: number, includePresets: boolean): Promise<void> {
    this.readingValues = true
    this.lastValuesAt = Date.now()
    if (includePresets) this.lastPresetsAt = this.lastValuesAt
    const ask = async (command: CameraCommand): Promise<string | undefined> => {
      try {
        const r = await queue.enqueue(command)
        if (gen !== this.generation || r.status !== 200) return undefined
        const parsed = parseReply(r.body)
        return parsed.kind === 'ok' ? parsed.text : undefined
      } catch {
        return undefined
      }
    }
    try {
      const values: Partial<CameraValues> = {}
      if (!this.current.values.model) {
        const id = await ask(cam('QID'))
        const model = id ? valueAfter(id, 'OID:') : undefined
        if (model) values.model = model
        const sv = await ask(cam('QSV'))
        const firmware = sv ? valueAfter(sv, 'OSV:') : undefined
        if (firmware) values.firmware = firmware
      }
      const gu = await ask(cam('QGU'))
      if (gu) values.gainDb = decodeGain(gu)
      const aw = await ask(cam('QAW'))
      if (aw) values.whiteBalance = decodeWhiteBalance(aw)
      const sh = await ask(cam('QSH'))
      if (sh) values.shutter = decodeShutter(sh)
      const af = await ask(cam('QAF'))
      if (af) values.focusMode = decodeAutoManual(af, 'OAF:')
      const rs = await ask(cam('QRS'))
      if (rs) values.irisMode = decodeAutoManual(rs, 'ORS:')
      const gz = await ask(ptz('#GZ'))
      if (gz) values.zoomPos = decodeHexPosition(gz, 'gz')

      if (includePresets) {
        const blocks: number[] = []
        let complete = true
        for (const block of [0, 1, 2] as const) {
          const pe = await ask(ptz(`#PE0${block}`))
          const decoded = pe ? decodePresetBlock(pe, block) : undefined
          if (!decoded) {
            complete = false
            break
          }
          blocks.push(...decoded)
        }
        if (complete) values.presets = blocks
      }

      if (gen === this.generation && this.current.state === 'connected') this.setValues(values)
    } finally {
      this.readingValues = false
    }
  }
}
