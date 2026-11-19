// Image settings for the AW-HE40 (Checkpoint 4). Value tables: docs/CAMERA_PROTOCOL.md
// and Panasonic's HD Integrated Camera Interface Specifications V1.07E.

import type { ImageAction, ImageValues, ShutterCode, WhiteBalanceMode } from '@shared/types'
import { valueAfter, type CameraCommand } from './protocol'

const cam = (cmd: string): CameraCommand => ({ endpoint: 'aw_cam', cmd })
const hex = (n: number, width: number): string => n.toString(16).toUpperCase().padStart(width, '0')

/** Gain: 0–48 dB in 3 dB steps, or auto. Data = dB + 8 (08h–38h), 80h = auto. */
export const GAIN_STEPS_DB = Array.from({ length: 17 }, (_, i) => i * 3)
/** Master pedestal −10…+10. Data = setting × 15 + 96h (000h–12Ch). */
export const PEDESTAL_RANGE = { min: -10, max: 10 } as const
/** R/B gain −30…+30. Data = setting × 5 + 96h (000h–12Ch). Only adjustable in AWB A/B. */
export const RB_GAIN_RANGE = { min: -30, max: 30 } as const
/** White balance modes offered: ATW, AWB A, AWB B, 3200K, 5600K. (VAR needs a colour temperature, not in v1.) */
export const WB_MODES: WhiteBalanceMode[] = ['0', '1', '2', '4', '5']
/** Shutter codes: off, 1/100, 1/250 … 1/10000, Synchro-Scan. */
export const SHUTTER_CODES: ShutterCode[] = ['0', '3', '5', '6', '7', '8', '9', 'A', 'B']
/** Detail: off / low / high. */
export const DETAIL_VALUES = [0, 1, 2] as const

const inRange = (n: number, lo: number, hi: number): boolean => Number.isInteger(n) && n >= lo && n <= hi

/** Builds the camera command for an image action, or throws if the value is not allowed. */
export function imageCommand(action: Exclude<ImageAction, { kind: 'restoreOriginals' }>): CameraCommand {
  switch (action.kind) {
    case 'gain':
      if (action.value === 'auto') return cam('OGU:80')
      if (!GAIN_STEPS_DB.includes(action.value)) throw new Error(`Gain ${action.value} dB is not a 3 dB step from 0 to 48`)
      return cam(`OGU:${hex(action.value + 8, 2)}`)
    case 'pedestal':
      if (!inRange(action.value, PEDESTAL_RANGE.min, PEDESTAL_RANGE.max)) throw new Error('Pedestal must be −10…+10')
      return cam(`OTP:${hex(action.value * 15 + 0x96, 3)}`)
    case 'rGain':
    case 'bGain':
      if (!inRange(action.value, RB_GAIN_RANGE.min, RB_GAIN_RANGE.max)) throw new Error('R/B gain must be −30…+30')
      return cam(`${action.kind === 'rGain' ? 'ORI' : 'OBI'}:${hex(action.value * 5 + 0x96, 3)}`)
    case 'whiteBalance':
      if (!WB_MODES.includes(action.mode)) throw new Error('Unknown white balance mode')
      return cam(`OAW:${action.mode}`)
    case 'awb':
      return cam('OWS')
    case 'abb':
      return cam('OAS')
    case 'shutter':
      if (!SHUTTER_CODES.includes(action.code)) throw new Error('Unknown shutter setting')
      return cam(`OSH:${action.code}`)
    case 'detail':
      if (!(DETAIL_VALUES as readonly number[]).includes(action.value)) throw new Error('Detail must be off, low or high')
      return cam(`ODT:${action.value}`)
  }
}

/**
 * Safety gate check for image-setting commands: only the exact commands and
 * value ranges `imageCommand` can produce are allowed.
 */
export function isImageSettingCommand(command: CameraCommand): boolean {
  if (command.endpoint !== 'aw_cam') return false
  const c = command.cmd
  if (c === 'OWS' || c === 'OAS') return true
  let m: RegExpExecArray | null
  if ((m = /^OGU:([0-9A-F]{2})$/.exec(c))) {
    const n = parseInt(m[1], 16)
    return n === 0x80 || (n >= 0x08 && n <= 0x38 && (n - 0x08) % 3 === 0)
  }
  if ((m = /^(OTP|ORI|OBI):([0-9A-F]{3})$/.exec(c))) {
    const n = parseInt(m[2], 16)
    const step = m[1] === 'OTP' ? 15 : 5
    return n >= 0 && n <= 0x12c && (n - 0x96) % step === 0
  }
  if (/^OAW:[01245]$/.test(c)) return true
  if (/^OSH:[035-9AB]$/.test(c)) return true
  if (/^ODT:[012]$/.test(c)) return true
  return false
}

// ---------- decoding replies ----------

const hexValue = (reply: string, prefix: string, digits: number): number | undefined => {
  const v = valueAfter(reply, prefix)
  return v !== undefined && new RegExp(`^[0-9A-Fa-f]{${digits}}$`).test(v) ? parseInt(v, 16) : undefined
}

export function decodePedestal(reply: string): number | undefined {
  const n = hexValue(reply, 'OTP:', 3)
  return n === undefined ? undefined : Math.round((n - 0x96) / 15)
}

export function decodeRbGain(reply: string, prefix: 'ORI:' | 'OBI:'): number | undefined {
  const n = hexValue(reply, prefix, 3)
  return n === undefined ? undefined : Math.round((n - 0x96) / 5)
}

export function decodeWbMode(reply: string): WhiteBalanceMode | undefined {
  const v = valueAfter(reply, 'OAW:')
  if (v === '3') return '0' // both 0 and 3 mean ATW
  return v !== undefined && (WB_MODES as string[]).includes(v) ? (v as WhiteBalanceMode) : v === '9' ? '9' : undefined
}

export function decodeShutterCode(reply: string): string | undefined {
  const v = valueAfter(reply, 'OSH:')?.toUpperCase()
  return v !== undefined && /^[0-9A-F]$/.test(v) ? v : undefined
}

export function decodeDetail(reply: string): 0 | 1 | 2 | undefined {
  const v = valueAfter(reply, 'ODT:')
  return v === '0' || v === '1' || v === '2' ? (Number(v) as 0 | 1 | 2) : undefined
}

/** The values to put back on "Restore original settings", in a safe order (white balance mode before R/B gain). */
export function restoreActions(o: ImageValues): Exclude<ImageAction, { kind: 'restoreOriginals' }>[] {
  const out: Exclude<ImageAction, { kind: 'restoreOriginals' }>[] = []
  if (o.wbMode && o.wbMode !== '9') out.push({ kind: 'whiteBalance', mode: o.wbMode })
  if (o.wbMode === '1' || o.wbMode === '2') {
    if (o.rGain !== undefined) out.push({ kind: 'rGain', value: o.rGain })
    if (o.bGain !== undefined) out.push({ kind: 'bGain', value: o.bGain })
  }
  if (o.gainDb !== undefined) out.push({ kind: 'gain', value: o.gainDb })
  if (o.pedestal !== undefined) out.push({ kind: 'pedestal', value: o.pedestal })
  if (o.shutterCode !== undefined && (SHUTTER_CODES as string[]).includes(o.shutterCode)) {
    out.push({ kind: 'shutter', code: o.shutterCode as ShutterCode })
  }
  if (o.detail !== undefined) out.push({ kind: 'detail', value: o.detail })
  return out
}
