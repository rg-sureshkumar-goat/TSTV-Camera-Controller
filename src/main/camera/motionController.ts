import type { HttpReply } from './httpClient'
import { STOP_FOCUS, STOP_PAN_TILT, STOP_ZOOM, parseReply, type CameraCommand } from './protocol'

export type Axis = 'panTilt' | 'zoom' | 'focus'

/** If the window stops confirming a held control for this long, every move stops (dead-man switch). */
export const KEEPALIVE_TIMEOUT_MS = 700
/** While a stop hasn't been confirmed by the camera, retry this often. */
export const STOP_RETRY_MS = 400

/** Speed level 1–5 (operator's Speed control) → furthest step from 50 the app will send. */
export const SPEED_LEVEL_MAX_OFFSET = [0, 8, 16, 26, 38, 49] as const

const STOPS: Record<Axis, CameraCommand> = { panTilt: STOP_PAN_TILT, zoom: STOP_ZOOM, focus: STOP_FOCUS }
const STOP_VALUE: Record<Axis, string> = { panTilt: '5050', zoom: '50', focus: '50' }
const PREFIX: Record<Axis, string> = { panTilt: '#PTS', zoom: '#Z', focus: '#F' }

export type Enqueue = (command: CameraCommand, opts: { priority: boolean }) => Promise<HttpReply>

const two = (n: number): string => String(n).padStart(2, '0')
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** Converts a joystick/button deflection (−1…1) and speed level (1–5) into a 2-digit speed value (01–99, 50 = stop). */
export function speedValue(deflection: number, level: number): number {
  const d = clamp(Number.isFinite(deflection) ? deflection : 0, -1, 1)
  const max = SPEED_LEVEL_MAX_OFFSET[clamp(Math.round(level) || 1, 1, 5)]
  if (Math.abs(d) < 0.08) return 50 // dead zone around the centre
  const offset = Math.max(1, Math.round(Math.abs(d) * max))
  return 50 + Math.sign(d) * offset
}

interface AxisState {
  desired: string // value we want the camera to have
  inFlight: boolean // a move for this axis is being sent
  mayBeMoving: boolean // true from the moment a move is queued until a stop is confirmed
  moveSeq: number // bumps each time a move is queued
  stopPendingFor: number | null // moveSeq that the stop in flight covers
  stopTimer: NodeJS.Timeout | null
}

const freshAxis = (desired: string): AxisState => ({
  desired,
  inFlight: false,
  mayBeMoving: false,
  moveSeq: 0,
  stopPendingFor: null,
  stopTimer: null
})

/**
 * Sends pan/tilt, zoom and focus moves for ONE camera and makes sure they stop.
 *
 * Stop rules (docs/PROJECT_BRIEF.md safety rules):
 *  - stop on release (the window calls stop / sends 50)
 *  - stop when the window loses focus, hides, crashes or the app quits (CameraManager.stopAllMotion)
 *  - stop when a connection drops: the stop is retried until the camera confirms it
 *  - dead-man switch: if the window stops confirming a held control, everything stops
 *
 * Moves and stops are priority commands, so they never wait behind status queries.
 * Fast joystick changes are merged: only the latest position is sent.
 */
export class MotionController {
  private readonly axes: Record<Axis, AxisState> = {
    panTilt: freshAxis('5050'),
    zoom: freshAxis('50'),
    focus: freshAxis('50')
  }
  private lastKeepalive = 0
  /**
   * After a safety stop (window blur, camera switch, Stop all, connection lost,
   * dead-man) each axis is LOCKED: moves are ignored until the window sends a
   * release (a plain stop for that axis). A control the window wrongly thinks
   * is still held can therefore never restart the camera.
   */
  private readonly locked = new Set<Axis>()
  private watchdog: NodeJS.Timeout | null = null
  private disposed = false

  constructor(
    private readonly enqueueRaw: Enqueue,
    private readonly onLog: (message: string) => void = () => {},
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Queue a command; a refused command becomes a rejected promise instead of a throw. */
  private enqueue(command: CameraCommand, opts: { priority: boolean }): Promise<HttpReply> {
    try {
      return this.enqueueRaw(command, opts)
    } catch (err) {
      return Promise.reject(err)
    }
  }

  /** True while any axis might still be moving (a move was sent and no stop has been confirmed). */
  get moving(): boolean {
    return Object.values(this.axes).some((a) => a.mayBeMoving || this.isMoveValue(a))
  }

  /** pan, tilt: −1 (left/down) … 1 (right/up). */
  setPanTilt(pan: number, tilt: number, speedLevel: number): void {
    const v = `${two(speedValue(pan, speedLevel))}${two(speedValue(tilt, speedLevel))}`
    this.set('panTilt', v)
  }

  /** direction: −1 = wide, 0 = stop, 1 = tele. */
  setZoom(direction: number, speedLevel: number): void {
    this.set('zoom', two(speedValue(direction, speedLevel)))
  }

  /** direction: −1 = near, 0 = stop, 1 = far. */
  setFocus(direction: number, speedLevel: number): void {
    this.set('focus', two(speedValue(direction, speedLevel)))
  }

  /** The window is still holding a control. */
  keepalive(): void {
    this.lastKeepalive = this.now()
  }

  /** The operator released this control: stop it, and unlock it for the next press. */
  stop(axis: Axis): void {
    this.locked.delete(axis)
    this.set(axis, STOP_VALUE[axis])
  }

  /** Safety stop of every axis. Axes that were moving stay locked until released (see `locked`). */
  stopAll(reason: string): void {
    let any = false
    for (const axis of Object.keys(this.axes) as Axis[]) {
      const a = this.axes[axis]
      if (a.mayBeMoving || a.desired !== STOP_VALUE[axis]) {
        any = true
        this.locked.add(axis)
        this.set(axis, STOP_VALUE[axis])
      }
    }
    if (any) this.onLog(`Stop all (${reason})`)
  }

  /** True if this axis is locked after a safety stop (the window must release the control first). */
  isLocked(axis: Axis): boolean {
    return this.locked.has(axis)
  }

  dispose(): void {
    this.disposed = true
    if (this.watchdog) clearInterval(this.watchdog)
    for (const a of Object.values(this.axes)) if (a.stopTimer) clearTimeout(a.stopTimer)
  }

  private isMoveValue(a: AxisState): boolean {
    return !/^(50|5050)$/.test(a.desired)
  }

  private set(axis: Axis, value: string): void {
    if (this.disposed) return
    const a = this.axes[axis]
    const isStop = value === STOP_VALUE[axis]
    if (!isStop && this.locked.has(axis)) {
      this.debug(`ignored ${axis} ${value}: locked after a safety stop (release the control first)`)
      return
    }
    if (!isStop) {
      this.keepalive()
      this.ensureWatchdog()
    }
    if (value === a.desired && !isStop) return // already heading there
    a.desired = value
    if (isStop) {
      // Skip if a stop covering the latest move is already on its way.
      if ((a.mayBeMoving || a.inFlight) && a.stopPendingFor !== a.moveSeq) this.sendStop(axis)
      return
    }
    this.flush(axis)
  }

  /** Send the latest desired move for an axis, one at a time. */
  private flush(axis: Axis): void {
    const a = this.axes[axis]
    if (a.inFlight || !this.isMoveValue(a)) return
    const value = a.desired
    this.debug(`send ${PREFIX[axis]}${value}`)
    a.inFlight = true
    a.mayBeMoving = true
    a.moveSeq++
    this.enqueue({ endpoint: 'aw_ptz', cmd: `${PREFIX[axis]}${value}` }, { priority: true })
      .catch(() => undefined)
      .finally(() => {
        a.inFlight = false
        if (a.desired !== value && this.isMoveValue(a)) this.flush(axis) // operator moved on meanwhile
      })
  }

  /** Send a stop and keep retrying until the camera confirms it. */
  private sendStop(axis: Axis): void {
    const a = this.axes[axis]
    if (a.stopTimer) {
      clearTimeout(a.stopTimer)
      a.stopTimer = null
    }
    // The queue sends priority jobs in order, so a confirmed stop comes after every move queued before it.
    const covers = a.moveSeq
    a.stopPendingFor = covers
    this.debug(`send stop ${axis}`)
    this.enqueue(STOPS[axis], { priority: true })
      .then((reply) => {
        const ok = reply.status === 200 && parseReply(reply.body).kind === 'ok'
        if (!ok) throw new Error(`stop not confirmed: HTTP ${reply.status} ${reply.body}`)
        if (a.stopPendingFor === covers) a.stopPendingFor = null
        if (a.desired === STOP_VALUE[axis] && a.moveSeq === covers) a.mayBeMoving = false
      })
      .catch((err: unknown) => {
        if (a.stopPendingFor === covers) a.stopPendingFor = null
        if (this.disposed || a.desired !== STOP_VALUE[axis]) return
        this.onLog(`Stop ${axis} not confirmed (${(err as Error).message}); retrying`)
        a.stopTimer = setTimeout(() => {
          a.stopTimer = null
          if (a.desired === STOP_VALUE[axis] && a.mayBeMoving) this.sendStop(axis)
        }, STOP_RETRY_MS)
      })
  }

  private debug(message: string): void {
    if (process.env.CAMCTRL_DEBUG_MOTION === '1') this.onLog(message)
  }

  private ensureWatchdog(): void {
    if (this.watchdog) return
    this.watchdog = setInterval(() => {
      const anyMove = Object.values(this.axes).some((a) => this.isMoveValue(a))
      if (!anyMove) {
        if (!this.moving && this.watchdog) {
          clearInterval(this.watchdog)
          this.watchdog = null
        }
        return
      }
      if (this.now() - this.lastKeepalive > KEEPALIVE_TIMEOUT_MS) this.stopAll('window stopped confirming the held control')
    }, 100)
  }
}
