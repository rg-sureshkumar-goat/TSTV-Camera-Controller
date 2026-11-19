import { describe, expect, it } from 'vitest'
import {
  assertAllowed,
  BlockedCommandError,
  commandPath,
  decodeGain,
  decodePresetBlock,
  decodeShutter,
  decodeWhiteBalance,
  isReadOnly,
  isShowCameraModel,
  parseReply
} from './protocol'

describe('safety gate', () => {
  it('allows the query commands the app uses', () => {
    for (const cmd of ['#O', '#APC', '#GZ', '#GF', '#GI', '#D1', '#D3', '#S', '#PE00', '#PE01', '#PE02', '#UPVS', '#LPI']) {
      expect(isReadOnly({ endpoint: 'aw_ptz', cmd })).toBe(true)
    }
    for (const cmd of ['QID', 'QSV', 'QGU', 'QAW', 'QRI', 'QBI', 'QRS', 'QSH', 'QTD', 'QTP', 'QDT', 'QAF', 'QSD:48']) {
      expect(isReadOnly({ endpoint: 'aw_cam', cmd })).toBe(true)
    }
  })

  it('allows the Checkpoint 3 movement and lens commands', () => {
    const moves = [
      { endpoint: 'aw_ptz', cmd: '#PTS5050' },
      { endpoint: 'aw_ptz', cmd: '#PTS0199' },
      { endpoint: 'aw_ptz', cmd: '#Z50' },
      { endpoint: 'aw_ptz', cmd: '#Z01' },
      { endpoint: 'aw_ptz', cmd: '#F99' },
      { endpoint: 'aw_ptz', cmd: '#I50' },
      { endpoint: 'aw_ptz', cmd: '#D11' },
      { endpoint: 'aw_ptz', cmd: '#D30' },
      { endpoint: 'aw_cam', cmd: 'OSE:69:1' }
    ] as const
    for (const c of moves) expect(() => assertAllowed(c), `${c.endpoint} ${c.cmd}`).not.toThrow()
  })

  it('blocks presets, scene files, OSD menu, power, absolute moves and malformed values', () => {
    const writes = [
      { endpoint: 'aw_ptz', cmd: '#PTS0050' },
      { endpoint: 'aw_ptz', cmd: '#PTS100' },
      { endpoint: 'aw_ptz', cmd: '#Z00' },
      { endpoint: 'aw_ptz', cmd: '#Z5' },
      { endpoint: 'aw_ptz', cmd: '#F100' },
      { endpoint: 'aw_ptz', cmd: '#D12' },
      { endpoint: 'aw_ptz', cmd: '#AXZFFF' },
      { endpoint: 'aw_ptz', cmd: '#R00' },
      { endpoint: 'aw_ptz', cmd: '#M05' },
      { endpoint: 'aw_ptz', cmd: '#C05' },
      { endpoint: 'aw_ptz', cmd: '#O0' },
      { endpoint: 'aw_ptz', cmd: '#APC80008000' },
      { endpoint: 'aw_ptz', cmd: '#UPVS250' },
      { endpoint: 'aw_ptz', cmd: '#RZL1' },
      { endpoint: 'aw_cam', cmd: 'XSF:1' },
      { endpoint: 'aw_cam', cmd: 'OUS:1' },
      { endpoint: 'aw_cam', cmd: 'OGU:09' },
      { endpoint: 'aw_cam', cmd: 'QGU:08' },
      { endpoint: 'aw_cam', cmd: 'Q' }
    ] as const
    for (const c of writes) {
      expect(isReadOnly(c), `${c.endpoint} ${c.cmd}`).toBe(false)
      expect(() => assertAllowed(c), `${c.endpoint} ${c.cmd}`).toThrow(BlockedCommandError)
    }
  })
})

describe('URLs and replies', () => {
  it('encodes # as %23', () => {
    expect(commandPath({ endpoint: 'aw_ptz', cmd: '#PE00' })).toBe('/cgi-bin/aw_ptz?cmd=%23PE00&res=1')
    expect(commandPath({ endpoint: 'aw_cam', cmd: 'QID' })).toBe('/cgi-bin/aw_cam?cmd=QID&res=1')
  })

  it('recognises error replies, including the lowercase ptz form', () => {
    expect(parseReply('ER1:QBS')).toEqual({ kind: 'error', code: 1, text: 'ER1:QBS' })
    expect(parseReply('eR2:S')).toEqual({ kind: 'error', code: 2, text: 'eR2:S' })
    expect(parseReply('ER3:%23P')).toMatchObject({ kind: 'error', code: 3 })
    expect(parseReply('OID:AW-HE40\r\n')).toEqual({ kind: 'ok', text: 'OID:AW-HE40' })
  })
})

describe('decoders match the 19 Nov 2026 probe (docs/PROBE_RESULTS.md)', () => {
  it('gain', () => {
    expect(decodeGain('OGU:14')).toBe(12)
    expect(decodeGain('OGU:17')).toBe(15)
    expect(decodeGain('OGU:23')).toBe(27)
    expect(decodeGain('OGU:08')).toBe(0)
    expect(decodeGain('OGU:80')).toBe('auto')
    expect(decodeGain('ER1')).toBeUndefined()
  })

  it('white balance and shutter', () => {
    expect(decodeWhiteBalance('OAW:5')).toBe('Preset 5600K')
    expect(decodeWhiteBalance('OAW:2')).toBe('AWB B')
    expect(decodeShutter('OSH:0')).toBe('Off')
    expect(decodeShutter('OSH:B')).toBe('Synchro-Scan (flicker-free)')
  })

  it('preset bitmaps', () => {
    expect(decodePresetBlock('pE00000000001F', 0)).toEqual([1, 2, 3, 4, 5])
    expect(decodePresetBlock('pE00000000021F', 0)).toEqual([1, 2, 3, 4, 5, 10])
    expect(decodePresetBlock('pE010000700000', 1)).toEqual([61, 62, 63])
    expect(decodePresetBlock('pE010000500000', 1)).toEqual([61, 63])
    expect(decodePresetBlock('pE020000000000', 2)).toEqual([])
    expect(decodePresetBlock('ER3:%23P', 0)).toBeUndefined()
  })

  it('show-camera models', () => {
    expect(isShowCameraModel('AW-HE40')).toBe(true)
    expect(isShowCameraModel('AW-HE2')).toBe(false)
  })
})
