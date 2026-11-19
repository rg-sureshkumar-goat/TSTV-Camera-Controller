import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HttpReply } from './httpClient'
import { KEEPALIVE_TIMEOUT_MS, MotionController, speedValue, STOP_RETRY_MS } from './motionController'
import type { CameraCommand } from './protocol'

/** A fake camera link: records commands; `fail` makes sends fail (unplugged cable). */
function fakeCamera() {
  const sent: { cmd: string; priority: boolean }[] = []
  let fail = false
  const enqueue = vi.fn(async (c: CameraCommand, opts: { priority: boolean }): Promise<HttpReply> => {
    sent.push({ cmd: c.cmd, priority: opts.priority })
    await Promise.resolve()
    if (fail) throw new Error('no answer')
    return { status: 200, body: c.cmd.replace('#PTS', 'pTS').replace('#Z', 'zS').replace('#F', 'fS') }
  })
  return {
    sent,
    cmds: () => sent.map((s) => s.cmd),
    setFail: (f: boolean) => (fail = f),
    motion: new MotionController(enqueue)
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

afterEach(() => vi.useRealTimers())

describe('speed values', () => {
  it('maps deflection and speed level to 01–99 with 50 = stop', () => {
    expect(speedValue(0, 3)).toBe(50)
    expect(speedValue(0.05, 5)).toBe(50) // dead zone
    expect(speedValue(1, 5)).toBe(99)
    expect(speedValue(-1, 5)).toBe(1)
    expect(speedValue(1, 1)).toBe(58)
    expect(speedValue(-1, 3)).toBe(24)
    expect(speedValue(Number.NaN, 3)).toBe(50)
    expect(speedValue(9, 9)).toBe(99) // clamped
  })
})

describe('motion controller stop rules', () => {
  it('sends a move, then a stop on release; both as priority commands', async () => {
    const cam = fakeCamera()
    cam.motion.setPanTilt(1, 0, 5)
    await flush()
    cam.motion.setPanTilt(0, 0, 5) // not used by the app (it calls stop), but must behave the same
    cam.motion.stop('panTilt')
    await flush()
    expect(cam.cmds()).toEqual(['#PTS9950', '#PTS5050'])
    expect(cam.sent.every((s) => s.priority)).toBe(true)
    expect(cam.motion.moving).toBe(false)
    cam.motion.dispose()
  })

  it('does not send stops for an axis the app never moved (leaves RP50 moves alone)', async () => {
    const cam = fakeCamera()
    cam.motion.stopAll('window lost focus')
    cam.motion.stop('zoom')
    await flush()
    expect(cam.cmds()).toEqual([])
    cam.motion.dispose()
  })

  it('stopAll stops every axis that is moving', async () => {
    const cam = fakeCamera()
    cam.motion.setPanTilt(-1, 1, 3)
    cam.motion.setZoom(1, 3)
    cam.motion.setFocus(-1, 3)
    await flush()
    cam.motion.stopAll('window lost focus')
    await flush()
    expect(cam.cmds().slice(-3).sort()).toEqual(['#F50', '#PTS5050', '#Z50'])
    expect(cam.motion.moving).toBe(false)
    cam.motion.dispose()
  })

  it('merges fast joystick changes: only the latest position is sent after the one in flight', async () => {
    const cam = fakeCamera()
    cam.motion.setPanTilt(0.2, 0, 5)
    cam.motion.setPanTilt(0.4, 0, 5)
    cam.motion.setPanTilt(0.6, 0, 5)
    cam.motion.setPanTilt(1, 0, 5)
    await flush()
    expect(cam.cmds()).toEqual(['#PTS6050', '#PTS9950'])
    cam.motion.stop('panTilt')
    await flush()
    cam.motion.dispose()
  })

  it('a stop sent while a move is in flight still goes out, after the move', async () => {
    const cam = fakeCamera()
    cam.motion.setZoom(1, 5)
    cam.motion.stop('zoom') // released before the move's reply came back
    await flush()
    expect(cam.cmds()).toEqual(['#Z99', '#Z50'])
    expect(cam.motion.moving).toBe(false)
    cam.motion.dispose()
  })

  it('retries a stop until the camera confirms it (connection drop mid-move)', async () => {
    vi.useFakeTimers()
    const cam = fakeCamera()
    cam.motion.setPanTilt(1, 0, 3)
    await flush()
    cam.setFail(true) // cable pulled
    cam.motion.stopAll('connection lost')
    await flush()
    await vi.advanceTimersByTimeAsync(STOP_RETRY_MS * 3 + 50)
    const stopsWhileDown = cam.cmds().filter((c) => c === '#PTS5050').length
    expect(stopsWhileDown).toBeGreaterThanOrEqual(3)
    expect(cam.motion.moving).toBe(true) // not confirmed yet
    cam.setFail(false) // cable back
    await vi.advanceTimersByTimeAsync(STOP_RETRY_MS + 50)
    expect(cam.motion.moving).toBe(false)
    const total = cam.cmds().length
    await vi.advanceTimersByTimeAsync(STOP_RETRY_MS * 3)
    expect(cam.cmds().length).toBe(total) // retries end once confirmed
    cam.motion.dispose()
  })

  it('a move whose reply never came still gets a stop on release', async () => {
    const cam = fakeCamera()
    cam.setFail(true)
    cam.motion.setFocus(1, 2)
    await flush()
    cam.setFail(false)
    cam.motion.stop('focus')
    await flush()
    expect(cam.cmds()).toEqual(['#F66', '#F50'])
    cam.motion.dispose()
  })

  it('after a safety stop, a control still "held" by the window cannot restart the camera', async () => {
    const cam = fakeCamera()
    cam.motion.setPanTilt(1, 0, 3)
    await flush()
    cam.motion.stopAll('window lost focus')
    await flush()
    // The window missed the mouse-up and keeps re-confirming the old position:
    cam.motion.setPanTilt(1, 0, 3)
    cam.motion.setPanTilt(0.5, 0.5, 3)
    cam.motion.keepalive()
    await flush()
    expect(cam.cmds()).toEqual(['#PTS7650', '#PTS5050'])
    expect(cam.motion.isLocked('panTilt')).toBe(true)
    // Operator releases and presses again: works normally.
    cam.motion.stop('panTilt')
    cam.motion.setPanTilt(-1, 0, 3)
    await flush()
    expect(cam.cmds()).toEqual(['#PTS7650', '#PTS5050', '#PTS2450'])
    cam.motion.stop('panTilt')
    await flush()
    cam.motion.dispose()
  })

  it('dead-man switch: stops when the window stops confirming a held control', async () => {
    vi.useFakeTimers()
    const cam = fakeCamera()
    cam.motion.setPanTilt(0, 1, 3)
    await flush()
    // Held and confirmed for a while: keeps moving.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(200)
      cam.motion.keepalive()
    }
    expect(cam.cmds()).toEqual(['#PTS5076'])
    // Window hangs: no more confirmations.
    await vi.advanceTimersByTimeAsync(KEEPALIVE_TIMEOUT_MS + 200)
    expect(cam.cmds()).toEqual(['#PTS5076', '#PTS5050'])
    expect(cam.motion.moving).toBe(false)
    cam.motion.dispose()
  })
})
