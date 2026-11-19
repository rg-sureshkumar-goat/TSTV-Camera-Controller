import { assertAllowed, commandPath, type CameraCommand } from './protocol'
import type { HttpReply } from './httpClient'

/** Panasonic: leave at least 130 ms between commands to the same camera. */
export const MIN_COMMAND_GAP_MS = 130
export const COMMAND_TIMEOUT_MS = 1500

export type Sender = (path: string, timeoutMs: number) => Promise<HttpReply>

interface Job {
  command: CameraCommand
  priority: boolean
  resolve: (reply: HttpReply) => void
  reject: (err: unknown) => void
}

/**
 * One queue per camera. Sends one command at a time, and waits at least
 * MIN_COMMAND_GAP_MS after each reply before sending the next. Counting from
 * the reply (not from the send) guarantees the camera itself sees a 130 ms
 * gap, even when connection setup delays one request more than another.
 *
 * Priority jobs (stop commands, from Checkpoint 3) jump ahead of everything
 * waiting. Every command passes the read-only safety gate before it is queued.
 */
export class CommandQueue {
  private jobs: Job[] = []
  private running = false
  private lastDoneAt = -Infinity
  private closed = false

  constructor(
    private readonly send: Sender,
    private readonly gapMs = MIN_COMMAND_GAP_MS,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {}

  /** Number of commands waiting (not counting the one in flight). */
  get pending(): number {
    return this.jobs.length
  }

  enqueue(command: CameraCommand, opts: { priority?: boolean } = {}): Promise<HttpReply> {
    assertAllowed(command) // throws BlockedCommandError for write commands before Checkpoint 3
    if (this.closed) return Promise.reject(new Error('Command queue closed'))
    return new Promise<HttpReply>((resolve, reject) => {
      const job: Job = { command, priority: !!opts.priority, resolve, reject }
      if (job.priority) {
        const firstNormal = this.jobs.findIndex((j) => !j.priority)
        this.jobs.splice(firstNormal === -1 ? this.jobs.length : firstNormal, 0, job)
      } else {
        this.jobs.push(job)
      }
      void this.pump()
    })
  }

  /** Drop waiting (non-priority) queries, e.g. when the camera goes offline. */
  clearPending(reason = 'Cleared'): void {
    const keep: Job[] = []
    for (const job of this.jobs) {
      if (job.priority) keep.push(job)
      else job.reject(new Error(reason))
    }
    this.jobs = keep
  }

  close(): void {
    this.closed = true
    this.clearPending('Command queue closed')
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.jobs.length > 0) {
        const wait = this.lastDoneAt + this.gapMs - this.now()
        if (wait > 0) await this.sleep(wait)
        const job = this.jobs.shift()
        if (!job) break
        try {
          job.resolve(await this.send(commandPath(job.command), COMMAND_TIMEOUT_MS))
        } catch (err) {
          job.reject(err)
        } finally {
          this.lastDoneAt = this.now()
        }
      }
    } finally {
      this.running = false
    }
  }
}
