import { EventEmitter } from 'node:events'
import type { CameraConfig, CameraSlot, CameraStatus, CameraValues, ImageAction, ImageValues, LensAction } from '@shared/types'
import type { SavedOriginals } from '../originalsStore'
import {
  decodeDetail,
  decodePedestal,
  decodeRbGain,
  decodeShutterCode,
  decodeWbMode,
  imageCommand,
  restoreActions
} from './imageSettings'
import { CommandQueue, type Sender } from './commandQueue'
import { MotionController } from './motionController'
import {
  decodeAutoManual,
  decodeGain,
  decodeHexPosition,
  decodeIrisPosition,
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

/** Where each camera's original image settings are kept (see OriginalsStore). */
export interface OriginalsAccess {
  get(ip: string): SavedOriginals | undefined
  saveIfMissing(ip: string, values: ImageValues): SavedOriginals
}

const noOriginals: OriginalsAccess = {
  get: () => undefined,
  saveIfMissing: (_ip, values) => ({ values, savedAt: new Date().toISOString() })
}

/**
 * Watches one camera: a heartbeat query every second, plus a slower read of
 * its current values. Sends only read-only queries (enforced by the queue).
 * Emits 'status' whenever anything shown on screen changes.
 */
export class CameraConnection extends EventEmitter {
  private queue: CommandQueue | null = null
  private motion: MotionController | null = null
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
    private readonly makeSender: SenderFactory,
    private readonly originals: OriginalsAccess = noOriginals
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
    this.motion?.stopAll('app closing') // queued as priority, so it is still sent after close()
    this.queue?.close()
    this.motion?.dispose()
    this.queue = null
    this.motion = null
  }

  // ---------- movement and lens (Checkpoint 3) ----------

  // ---------- image settings (Checkpoint 4) ----------

  async image(action: ImageAction, readBack = true): Promise<void> {
    if (action.kind === 'restoreOriginals') {
      const saved = this.originals.get(this.config.ip.trim())
      if (!saved) throw new Error(`No original settings saved for ${this.config.name} yet.`)
      const failures: string[] = []
      for (const step of restoreActions(saved.values)) {
        try {
          await this.image(step, false)
        } catch (err) {
          failures.push((err as Error).message)
        }
      }
      if (this.queue) await this.readImageValues(this.queue, this.generation, true)
      if (failures.length) throw new Error(`Restored, except: ${failures.join('; ')}`)
      return
    }
    const queue = this.queue
    if (!queue || this.current.state !== 'connected') throw new Error(`${this.config.name} is not connected.`)
    const command = imageCommand(action)
    if (!command) throw new Error('Unknown image setting')
    const reply = await queue.enqueue(command, { priority: true })
    const parsed = reply.status === 200 ? parseReply(reply.body) : undefined
    // Read the values straight back, so the panel shows what the camera really has.
    if (readBack) await this.readImageValues(queue, this.generation, true)
    if (!parsed || parsed.kind === 'error') {
      const what = {
        gain: 'gain', pedestal: 'pedestal', rGain: 'R gain', bGain: 'B gain', whiteBalance: 'white balance',
        awb: 'auto white balance', abb: 'auto black balance', shutter: 'shutter', detail: 'detail'
      }[action.kind]
      let why = `camera replied ${reply.status} ${reply.body}`
      if (parsed?.kind === 'error' && parsed.code === 3) {
        why =
          action.kind === 'awb'
            ? 'white balance failed (point the camera at something white, and set white balance to AWB A or B)'
            : action.kind === 'abb'
              ? 'black balance failed'
              : action.kind === 'rGain' || action.kind === 'bGain'
                ? 'R/B gain can only be changed when white balance is AWB A or AWB B'
                : 'not possible in the camera’s current mode (for example Full Auto)'
      } else if (parsed?.kind === 'error' && parsed.code === 2) why = 'camera is busy or in standby; try again'
      else if (parsed?.kind === 'error' && parsed.code === 1) why = 'this camera does not support it'
      throw new Error(`${this.config.name} ${what}: ${why}`)
    }
  }

  private get canMove(): boolean {
    return this.running && this.current.state === 'connected' && !!this.motion
  }

  panTilt(pan: number, tilt: number, speed: number): void {
    if (pan === 0 && tilt === 0) this.motion?.stop('panTilt')
    else if (this.canMove) this.motion!.setPanTilt(pan, tilt, speed)
    else if (process.env.CAMCTRL_DEBUG_MOTION === '1') console.log(`[${this.config.name}] ignored pan/tilt: camera ${this.current.state}`)
  }

  zoom(direction: number, speed: number): void {
    if (direction === 0) this.motion?.stop('zoom')
    else if (this.canMove) this.motion!.setZoom(direction, speed)
  }

  focus(direction: number, speed: number): void {
    if (direction === 0) this.motion?.stop('focus')
    else if (this.canMove) this.motion!.setFocus(direction, speed)
  }

  keepalive(): void {
    this.motion?.keepalive()
  }

  stopMotion(reason: string): void {
    this.motion?.stopAll(reason)
  }

  async lens(action: LensAction): Promise<void> {
    const queue = this.queue
    if (!queue || this.current.state !== 'connected') throw new Error(`${this.config.name} is not connected.`)
    let command: CameraCommand
    if (action.kind === 'autoFocus') command = ptz(action.on ? '#D11' : '#D10')
    else if (action.kind === 'autoIris') command = ptz(action.on ? '#D31' : '#D30')
    else if (action.kind === 'onePushFocus') command = cam('OSE:69:1')
    else {
      const p = Math.min(99, Math.max(1, Math.round(action.position)))
      command = ptz(`#I${String(p).padStart(2, '0')}`)
    }
    const reply = await queue.enqueue(command, { priority: true })
    this.lastValuesAt = 0 // re-read the camera's values on the next heartbeat
    const parsed = reply.status === 200 ? parseReply(reply.body) : undefined
    if (!parsed || parsed.kind === 'error') {
      const why = parsed?.kind === 'error' && parsed.code === 3 ? 'not allowed in the camera’s current mode' : `camera replied ${reply.status} ${reply.body}`
      throw new Error(`${this.config.name}: ${why}`)
    }
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
    // Stop the old camera before letting go of it. Stops are priority jobs, so close() still sends them.
    this.motion?.stopAll('camera IP changed')
    this.queue?.close()
    this.motion?.dispose()
    const ip = this.config.ip.trim()
    this.queue = ip ? new CommandQueue(this.makeSender(ip)) : null
    const queue = this.queue
    this.motion = queue
      ? new MotionController(
          (command, opts) => queue.enqueue(command, opts),
          (msg) => console.log(`[${this.config.name} ${ip}] ${msg}`)
        )
      : null
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
        queue.clearPending('Camera offline') // drops queries only; stops are kept
        this.motion?.stopAll('connection lost') // retried until the camera confirms it
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
      if (this.current.values.rbPedestalSupported === undefined) {
        // R/B pedestal (QRP): Panasonic lists it for HE120/HE130 only. Ask once; ER1 = not available.
        try {
          const r = await queue.enqueue(cam('QRP'))
          const parsed = parseReply(r.body)
          values.rbPedestalSupported = r.status === 200 && parsed.kind === 'ok'
        } catch {
          // ask again next time
        }
      }
      const af = await ask(cam('QAF'))
      if (af) values.focusMode = decodeAutoManual(af, 'OAF:')
      const rs = await ask(cam('QRS'))
      if (rs) values.irisMode = decodeAutoManual(rs, 'ORS:')
      const gz = await ask(ptz('#GZ'))
      if (gz) values.zoomPos = decodeHexPosition(gz, 'gz')
      const gi = await ask(ptz('#GI'))
      if (gi) values.irisPos = decodeIrisPosition(gi)

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
      await this.readImageValues(queue, gen, false)
    } finally {
      this.readingValues = false
    }
  }

  /** Reads gain, pedestal, white balance, R/B gain, shutter and detail. */
  private async readImageValues(queue: CommandQueue, gen: number, priority: boolean): Promise<void> {
    const ask = async (cmd: string): Promise<string | undefined> => {
      try {
        const r = await queue.enqueue(cam(cmd), { priority })
        if (gen !== this.generation || r.status !== 200) return undefined
        const parsed = parseReply(r.body)
        return parsed.kind === 'ok' ? parsed.text : undefined
      } catch {
        return undefined
      }
    }
    const gu = await ask('QGU')
    const tp = await ask('QTP')
    const aw = await ask('QAW')
    const ri = await ask('QRI')
    const bi = await ask('QBI')
    const sh = await ask('QSH')
    const dt = await ask('QDT')
    if (gen !== this.generation || this.current.state !== 'connected') return
    const image: ImageValues = {
      gainDb: gu ? decodeGain(gu) : undefined,
      pedestal: tp ? decodePedestal(tp) : undefined,
      wbMode: aw ? decodeWbMode(aw) : undefined,
      rGain: ri ? decodeRbGain(ri, 'ORI:') : undefined,
      bGain: bi ? decodeRbGain(bi, 'OBI:') : undefined,
      shutterCode: sh ? decodeShutterCode(sh) : undefined,
      detail: dt ? decodeDetail(dt) : undefined
    }
    this.setValues({
      image,
      gainDb: image.gainDb,
      whiteBalance: aw ? decodeWhiteBalance(aw) : undefined,
      shutter: sh ? decodeShutter(sh) : undefined
    })
    // First complete read of this camera ever: remember it as the original settings.
    const complete =
      image.gainDb !== undefined &&
      image.pedestal !== undefined &&
      image.wbMode !== undefined &&
      image.shutterCode !== undefined &&
      image.detail !== undefined &&
      (!(image.wbMode === '1' || image.wbMode === '2') || (image.rGain !== undefined && image.bGain !== undefined))
    const ip = this.config.ip.trim()
    const saved = complete ? this.originals.saveIfMissing(ip, image) : this.originals.get(ip)
    if (saved) this.update({ originals: saved })
  }
}
