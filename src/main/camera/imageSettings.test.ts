import { describe, expect, it } from 'vitest'
import {
  decodeDetail,
  decodePedestal,
  decodeRbGain,
  decodeWbMode,
  imageCommand,
  isImageSettingCommand,
  restoreActions
} from './imageSettings'
import { assertAllowed, BlockedCommandError } from './protocol'

describe('image setting commands (AW-HE40 value tables)', () => {
  it('encodes values exactly as Panasonic specifies', () => {
    expect(imageCommand({ kind: 'gain', value: 0 }).cmd).toBe('OGU:08')
    expect(imageCommand({ kind: 'gain', value: 12 }).cmd).toBe('OGU:14')
    expect(imageCommand({ kind: 'gain', value: 27 }).cmd).toBe('OGU:23')
    expect(imageCommand({ kind: 'gain', value: 48 }).cmd).toBe('OGU:38')
    expect(imageCommand({ kind: 'gain', value: 'auto' }).cmd).toBe('OGU:80')
    expect(imageCommand({ kind: 'pedestal', value: 0 }).cmd).toBe('OTP:096')
    expect(imageCommand({ kind: 'pedestal', value: -10 }).cmd).toBe('OTP:000')
    expect(imageCommand({ kind: 'pedestal', value: 10 }).cmd).toBe('OTP:12C')
    expect(imageCommand({ kind: 'rGain', value: 8 }).cmd).toBe('ORI:0BE')
    expect(imageCommand({ kind: 'bGain', value: 5 }).cmd).toBe('OBI:0AF')
    expect(imageCommand({ kind: 'bGain', value: -30 }).cmd).toBe('OBI:000')
    expect(imageCommand({ kind: 'whiteBalance', mode: '2' }).cmd).toBe('OAW:2')
    expect(imageCommand({ kind: 'shutter', code: 'B' }).cmd).toBe('OSH:B')
    expect(imageCommand({ kind: 'detail', value: 2 }).cmd).toBe('ODT:2')
    expect(imageCommand({ kind: 'awb' }).cmd).toBe('OWS')
    expect(imageCommand({ kind: 'abb' }).cmd).toBe('OAS')
  })

  it('refuses out-of-range values before anything is sent', () => {
    expect(() => imageCommand({ kind: 'gain', value: 13 })).toThrow()
    expect(() => imageCommand({ kind: 'gain', value: 51 })).toThrow()
    expect(() => imageCommand({ kind: 'pedestal', value: 11 })).toThrow()
    expect(() => imageCommand({ kind: 'rGain', value: 31 })).toThrow()
    expect(() => imageCommand({ kind: 'rGain', value: 1.5 })).toThrow()
    expect(() => imageCommand({ kind: 'whiteBalance', mode: '9' })).toThrow()
    expect(() => imageCommand({ kind: 'shutter', code: 'C' as never })).toThrow()
    expect(() => imageCommand({ kind: 'detail', value: 3 as never })).toThrow()
  })

  it('decodes replies (probe values from 19 Nov 2026)', () => {
    expect(decodeRbGain('ORI:0BE', 'ORI:')).toBe(8)
    expect(decodeRbGain('OBI:0AF', 'OBI:')).toBe(5)
    expect(decodePedestal('OTP:096')).toBe(0)
    expect(decodePedestal('OTP:000')).toBe(-10)
    expect(decodeWbMode('OAW:5')).toBe('5')
    expect(decodeWbMode('OAW:3')).toBe('0') // ATW
    expect(decodeDetail('ODT:1')).toBe(1)
  })

  it('safety gate allows exactly the image commands the app can build', () => {
    for (const cmd of ['OGU:08', 'OGU:38', 'OGU:80', 'OTP:096', 'OTP:12C', 'ORI:000', 'OBI:12C', 'OAW:1', 'OWS', 'OAS', 'OSH:B', 'ODT:0']) {
      expect(isImageSettingCommand({ endpoint: 'aw_cam', cmd }), cmd).toBe(true)
      expect(() => assertAllowed({ endpoint: 'aw_cam', cmd })).not.toThrow()
    }
    for (const cmd of ['OGU:09', 'OGU:39', 'OGU:90', 'OTP:12D', 'OTP:097', 'ORI:097', 'ORI:131', 'OAW:9', 'OAW:3', 'OSH:4', 'OSH:C', 'ODT:3', 'XSF:1', 'OSD:48:00', 'OSE:71:1', 'OUS:1', 'ORP:096']) {
      expect(isImageSettingCommand({ endpoint: 'aw_cam', cmd }), cmd).toBe(false)
      expect(() => assertAllowed({ endpoint: 'aw_cam', cmd }), cmd).toThrow(BlockedCommandError)
    }
  })

  it('restore order puts white balance mode before R/B gain', () => {
    const steps = restoreActions({ gainDb: 27, pedestal: -1, wbMode: '2', rGain: 8, bGain: 5, shutterCode: '0', detail: 1 })
    expect(steps.map((s) => s.kind)).toEqual(['whiteBalance', 'rGain', 'bGain', 'gain', 'pedestal', 'shutter', 'detail'])
    const preset = restoreActions({ gainDb: 12, pedestal: 0, wbMode: '5', shutterCode: 'B', detail: 2 })
    expect(preset.map((s) => s.kind)).toEqual(['whiteBalance', 'gain', 'pedestal', 'shutter', 'detail'])
  })
})
