import { describe, expect, it } from 'vitest'
import { CommandQueue, MIN_COMMAND_GAP_MS } from './commandQueue'
import { BlockedCommandError } from './protocol'

function setup(responseMs = 5) {
  const sends: { path: string; at: number }[] = []
  let inFlight = 0
  let maxInFlight = 0
  const start = Date.now()
  const queue = new CommandQueue(async (path) => {
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    sends.push({ path, at: Date.now() - start })
    await new Promise((r) => setTimeout(r, responseMs))
    inFlight--
    return { status: 200, body: 'ok' }
  })
  return { queue, sends, maxInFlight: () => maxInFlight }
}

describe('per-camera command queue', () => {
  it(`waits at least ${MIN_COMMAND_GAP_MS} ms after each reply and sends one at a time`, async () => {
    const responseMs = 40
    const { queue, sends, maxInFlight } = setup(responseMs)
    await Promise.all(['#O', '#GZ', '#GF', '#GI', '#D1'].map((cmd) => queue.enqueue({ endpoint: 'aw_ptz', cmd })))
    expect(sends).toHaveLength(5)
    for (let i = 1; i < sends.length; i++) {
      // gap measured from the previous reply: send-to-send ≥ reply time + 130 ms (minus timer jitter)
      expect(sends[i].at - sends[i - 1].at).toBeGreaterThanOrEqual(responseMs + MIN_COMMAND_GAP_MS - 3)
    }
    expect(maxInFlight()).toBe(1)
  })

  it('keeps commands in order', async () => {
    const { queue, sends } = setup()
    await Promise.all(['QID', 'QSV', 'QGU'].map((cmd) => queue.enqueue({ endpoint: 'aw_cam', cmd })))
    expect(sends.map((s) => s.path)).toEqual([
      '/cgi-bin/aw_cam?cmd=QID&res=1',
      '/cgi-bin/aw_cam?cmd=QSV&res=1',
      '/cgi-bin/aw_cam?cmd=QGU&res=1'
    ])
  })

  it('refuses commands outside the safety gate, without sending anything', async () => {
    const { queue, sends } = setup()
    expect(() => queue.enqueue({ endpoint: 'aw_ptz', cmd: '#M05' })).toThrow(BlockedCommandError)
    expect(() => queue.enqueue({ endpoint: 'aw_ptz', cmd: '#R00' })).toThrow(BlockedCommandError)
    expect(() => queue.enqueue({ endpoint: 'aw_cam', cmd: 'OGU:08' })).toThrow(BlockedCommandError)
    await new Promise((r) => setTimeout(r, 20))
    expect(sends).toHaveLength(0)
  })

  it('priority commands jump ahead of waiting queries', async () => {
    const { queue, sends } = setup()
    const a = queue.enqueue({ endpoint: 'aw_ptz', cmd: '#O' })
    const b = queue.enqueue({ endpoint: 'aw_ptz', cmd: '#GZ' })
    const c = queue.enqueue({ endpoint: 'aw_ptz', cmd: '#GF' }, { priority: true })
    await Promise.all([a, b, c])
    expect(sends.map((s) => s.path.match(/%23(\w+)/)![1])).toEqual(['O', 'GF', 'GZ'])
  })

  it('clearPending rejects waiting queries', async () => {
    const { queue } = setup(50)
    const first = queue.enqueue({ endpoint: 'aw_ptz', cmd: '#O' })
    const second = queue.enqueue({ endpoint: 'aw_ptz', cmd: '#GZ' })
    queue.clearPending('offline')
    await expect(second).rejects.toThrow('offline')
    await expect(first).resolves.toBeTruthy()
  })
})
