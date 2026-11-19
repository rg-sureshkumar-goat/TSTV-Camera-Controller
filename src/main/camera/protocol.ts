import { isImageSettingCommand } from './imageSettings'
// Panasonic "HD Integrated Camera Interface" (aw_ptz / aw_cam over HTTP).
// Command meanings and value tables: docs/CAMERA_PROTOCOL.md.

export type Endpoint = 'aw_ptz' | 'aw_cam'

export interface CameraCommand {
  endpoint: Endpoint
  /** Command text without URL encoding, e.g. "#O" or "QID". */
  cmd: string
}

/**
 * SAFETY GATE. Every command goes through `assertAllowed`. Allowed are:
 *  - read-only queries (always),
 *  - the movement and lens commands below (from Checkpoint 3), and
 *  - image settings with in-range values (Checkpoint 4, see imageSettings.ts).
 * Everything else is refused: presets recall/store/delete (Checkpoint 6),
 * scene files, the OSD menu, power, absolute positioning, and any command not
 * listed. Widen this list only in the checkpoint that needs it.
 */
const TWO_DIGIT_SPEED = '(0[1-9]|[1-9][0-9])' // 01–99; 50 = stop
const MOVEMENT_AND_LENS: { endpoint: Endpoint; pattern: RegExp; what: string }[] = [
  { endpoint: 'aw_ptz', pattern: new RegExp(`^#PTS${TWO_DIGIT_SPEED}${TWO_DIGIT_SPEED}$`), what: 'pan/tilt speed (5050 = stop)' },
  { endpoint: 'aw_ptz', pattern: new RegExp(`^#Z${TWO_DIGIT_SPEED}$`), what: 'zoom speed (50 = stop)' },
  { endpoint: 'aw_ptz', pattern: new RegExp(`^#F${TWO_DIGIT_SPEED}$`), what: 'focus speed (50 = stop)' },
  { endpoint: 'aw_ptz', pattern: new RegExp(`^#I${TWO_DIGIT_SPEED}$`), what: 'iris position 01 (closed) – 99 (open)' },
  { endpoint: 'aw_ptz', pattern: /^#D1[01]$/, what: 'auto focus off/on' },
  { endpoint: 'aw_ptz', pattern: /^#D3[01]$/, what: 'auto iris off/on' },
  { endpoint: 'aw_cam', pattern: /^OSE:69:1$/, what: 'one-push auto focus' }
]

export function isMovementOrLens(command: CameraCommand): boolean {
  return MOVEMENT_AND_LENS.some((m) => m.endpoint === command.endpoint && m.pattern.test(command.cmd))
}

/** aw_ptz queries: commands "with no value" in Panasonic's spec. */
const PTZ_QUERIES = new Set([
  '#O', // power
  '#APC', // pan/tilt position
  '#GZ', // zoom position
  '#GF', // focus position
  '#GI', // iris position + auto/manual
  '#D1', // auto focus on/off
  '#D3', // auto iris on/off
  '#S', // last preset recalled
  '#PE00', // presets 1–40 in use
  '#PE01', // presets 41–80 in use
  '#PE02', // presets 81–100 in use
  '#UPVS', // preset speed
  '#LPI', // lens info (zoom, focus, iris)
  '#RER' // error info
])

/**
 * aw_cam queries: "Q" + 1–3 letters with no data (QID, QGU…), or one of the
 * sub-item query families with a 2-digit item code (QSD:48, QSE:69…).
 */
const CAM_QUERY = /^(Q[A-Z]{1,3}|QS[ADEGJ]:[0-9A-F]{2})$/

export function isReadOnly(command: CameraCommand): boolean {
  if (command.endpoint === 'aw_ptz') return PTZ_QUERIES.has(command.cmd)
  return CAM_QUERY.test(command.cmd)
}

export class BlockedCommandError extends Error {
  constructor(command: CameraCommand) {
    super(`Blocked ${command.endpoint} command "${command.cmd}": not a query or an allowed movement/lens command.`)
    this.name = 'BlockedCommandError'
  }
}

export function assertAllowed(command: CameraCommand): void {
  if (isReadOnly(command) || isMovementOrLens(command) || isImageSettingCommand(command)) return
  throw new BlockedCommandError(command)
}

/** Stop commands: pan/tilt, zoom and focus speed back to 50. */
export const STOP_PAN_TILT: CameraCommand = { endpoint: 'aw_ptz', cmd: '#PTS5050' }
export const STOP_ZOOM: CameraCommand = { endpoint: 'aw_ptz', cmd: '#Z50' }
export const STOP_FOCUS: CameraCommand = { endpoint: 'aw_ptz', cmd: '#F50' }

/** Path + query for a command. `#` must be sent as %23. */
export function commandPath(command: CameraCommand): string {
  return `/cgi-bin/${command.endpoint}?cmd=${encodeURIComponent(command.cmd)}&res=1`
}

export type ParsedReply =
  | { kind: 'ok'; text: string }
  | { kind: 'error'; code: 1 | 2 | 3; text: string }

/**
 * Error replies: "ER1:QBS" (unsupported), "ER2:..."/"eR2:S" (busy or standby),
 * "ER3:..." (value out of range / not allowed in the current mode).
 */
export function parseReply(body: string): ParsedReply {
  const text = body.trim()
  const m = /^[eE]R([123])(:|$)/.exec(text)
  if (m) return { kind: 'error', code: Number(m[1]) as 1 | 2 | 3, text }
  return { kind: 'ok', text }
}

/** Strip a reply prefix: valueAfter("OGU:14", "OGU:") → "14". Undefined if the prefix doesn't match. */
export function valueAfter(reply: string, prefix: string): string | undefined {
  return reply.startsWith(prefix) ? reply.slice(prefix.length) : undefined
}

// ---------- Decoders (AW-HE40 values; see docs/CAMERA_PROTOCOL.md) ----------

export function decodePower(reply: string): 'on' | 'standby' | 'powering-on' | undefined {
  const v = valueAfter(reply, 'p')
  if (v === '1') return 'on'
  if (v === '0') return 'standby'
  if (v === '3') return 'powering-on'
  return undefined
}

/** OGU:08 = 0 dB, 3 dB steps up to 38 = 48 dB; 80 = auto. dB = hex − 8. */
export function decodeGain(reply: string): number | 'auto' | undefined {
  const v = valueAfter(reply, 'OGU:')
  if (v === undefined || !/^[0-9A-Fa-f]{2}$/.test(v)) return undefined
  const n = parseInt(v, 16)
  if (n === 0x80) return 'auto'
  if (n < 0x08 || n > 0x38) return undefined
  return n - 0x08
}

const WHITE_BALANCE: Record<string, string> = {
  '0': 'ATW (auto tracking)',
  '1': 'AWB A',
  '2': 'AWB B',
  '3': 'ATW (auto tracking)',
  '4': 'Preset 3200K',
  '5': 'Preset 5600K',
  '9': 'VAR'
}
export function decodeWhiteBalance(reply: string): string | undefined {
  const v = valueAfter(reply, 'OAW:')
  return v === undefined ? undefined : (WHITE_BALANCE[v] ?? `Unknown (${v})`)
}

const SHUTTER: Record<string, string> = {
  '0': 'Off',
  '3': '1/100',
  '5': '1/250',
  '6': '1/500',
  '7': '1/1000',
  '8': '1/2000',
  '9': '1/4000',
  A: '1/10000',
  B: 'Synchro-Scan (flicker-free)'
}
export function decodeShutter(reply: string): string | undefined {
  const v = valueAfter(reply, 'OSH:')
  return v === undefined ? undefined : (SHUTTER[v.toUpperCase()] ?? `Unknown (${v})`)
}

export function decodeAutoManual(reply: string, prefix: string): 'auto' | 'manual' | undefined {
  const v = valueAfter(reply, prefix)
  if (v === '1') return 'auto'
  if (v === '0') return 'manual'
  return undefined
}

/** gz83E → 0x83E. "gz---" (standby) → undefined. */
export function decodeHexPosition(reply: string, prefix: string): number | undefined {
  const v = valueAfter(reply, prefix)
  if (v === undefined || !/^[0-9A-Fa-f]{3}$/.test(v)) return undefined
  return parseInt(v, 16)
}

/** #GI → "gi" + 3 hex iris position (555 closed – FFF open) + 0/1 (manual/auto). Returns 1–99 like #I. */
export function decodeIrisPosition(reply: string): number | undefined {
  const v = valueAfter(reply, 'gi')
  if (v === undefined || !/^[0-9A-Fa-f]{3}[01]?$/.test(v)) return undefined
  const raw = parseInt(v.slice(0, 3), 16)
  if (raw < 0x555 || raw > 0xfff) return undefined
  return Math.round(((raw - 0x555) / (0xfff - 0x555)) * 98) + 1
}

/**
 * #PE00 → "pE00" + 10 hex digits = bitmap of 40 presets, lowest bit = lowest preset number.
 * block 0 = presets 1–40, block 1 = 41–80, block 2 = 81–100.
 * Returns preset numbers (1-based).
 */
export function decodePresetBlock(reply: string, block: 0 | 1 | 2): number[] | undefined {
  const v = valueAfter(reply, `pE0${block}`)
  if (v === undefined || !/^[0-9A-Fa-f]{10}$/.test(v)) return undefined
  const bits = BigInt('0x' + v)
  const first = block * 40 + 1
  const count = block === 2 ? 20 : 40
  const presets: number[] = []
  for (let i = 0; i < count; i++) {
    if ((bits >> BigInt(i)) & 1n) presets.push(first + i)
  }
  return presets
}

/** Models that are not studio PTZ cameras and must not be added as Cam 1–3 by auto-discover. */
const NOT_SHOW_CAMERAS = new Set(['AW-HE2'])
export function isShowCameraModel(model: string): boolean {
  return model.startsWith('AW-') && !NOT_SHOW_CAMERAS.has(model)
}
