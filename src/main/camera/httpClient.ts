import http from 'node:http'

export interface HttpReply {
  status: number
  body: string
}

export class CameraHttpError extends Error {
  constructor(
    message: string,
    readonly reason: 'timeout' | 'network'
  ) {
    super(message)
    this.name = 'CameraHttpError'
  }
}

/** Splits "192.168.0.11" or "127.0.0.1:8081" into host and port. */
export function splitHost(ipOrHost: string): { host: string; port: number } {
  const m = /^(.+):(\d{1,5})$/.exec(ipOrHost.trim())
  if (m) return { host: m[1], port: Number(m[2]) }
  return { host: ipOrHost.trim(), port: 80 }
}

/**
 * One HTTP GET. Panasonic cameras don't support Keep-Alive, so every request
 * uses a fresh connection (agent: false, Connection: close).
 */
export function httpGet(ipOrHost: string, path: string, timeoutMs: number): Promise<HttpReply> {
  const { host, port } = splitHost(ipOrHost)
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path, method: 'GET', agent: false, headers: { Connection: 'close' } },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (c: Buffer) => {
          size += c.length
          if (size <= 64 * 1024) chunks.push(c) // replies are tiny; ignore anything huge
        })
        res.on('end', () => {
          clearTimeout(timer)
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('latin1') })
        })
        res.on('error', (err) => {
          clearTimeout(timer)
          reject(new CameraHttpError(err.message, 'network'))
        })
      }
    )
    const timer = setTimeout(() => {
      req.destroy()
      reject(new CameraHttpError(`No answer within ${timeoutMs} ms`, 'timeout'))
    }, timeoutMs)
    req.on('error', (err) => {
      clearTimeout(timer)
      reject(new CameraHttpError(err.message, 'network'))
    })
    req.end()
  })
}
