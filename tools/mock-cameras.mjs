#!/usr/bin/env node
// Fake Panasonic cameras for testing Cam Controller away from the studio.
//
//   npm run mock-cameras
//
// Starts three fake AW-HE40s on 127.0.0.1:8081, :8082, :8083 that answer
// with the values from the 19 Nov 2026 studio probe, in the crew's order
// (Cam 1 = studio .13, Cam 2 = .11, Cam 3 = .12). In the app's Settings,
// set the IPs to 127.0.0.1:8081, 127.0.0.1:8082 and 127.0.0.1:8083.
//
// Type 1, 2 or 3 and press Enter to unplug or replug that camera
// (it stops answering, like a pulled cable). Ctrl+C quits.
//
// The fake cameras also act as a safety check. They warn when:
//   - a command that is not a read-only query arrives (WRITE COMMAND)
//   - two commands arrive less than 130 ms apart (TOO FAST)

import http from 'node:http'
import readline from 'node:readline'

const CAMERAS = [
  {
    // Cam 1 = studio .13
    port: 8081,
    ptz: { '#O': 'p1', '#APC': 'aPCA3157E91', '#GZ': 'gz938', '#GF': 'gfE85', '#GI': 'giC4C0', '#D1': 'd10', '#D3': 'd30', '#S': 'eR2:S', '#PE00': 'pE00000000001F', '#PE01': 'pE010000500000', '#PE02': 'pE020000000000', '#UPVS': 'uPVS500' },
    cam: { QID: 'OID:AW-HE40', QSV: 'OSV:Ver.1.03', QGU: 'OGU:23', QAW: 'OAW:2', QRI: 'ORI:0BE', QBI: 'OBI:0AF', QRS: 'ORS:0', QSH: 'OSH:0', QTD: 'OTD:08', QAF: 'OAF:0' }
  },
  {
    // Cam 2 = studio .11
    port: 8082,
    ptz: { '#O': 'p1', '#APC': 'aPC7C387ECF', '#GZ': 'gz83E', '#GF': 'gfE4F', '#GI': 'giD980', '#D1': 'd10', '#D3': 'd30', '#S': 'eR2:S', '#PE00': 'pE00000000001F', '#PE01': 'pE010000000000', '#PE02': 'pE020000000000', '#UPVS': 'uPVS500' },
    cam: { QID: 'OID:AW-HE40', QSV: 'OSV:Ver.1.03', QGU: 'OGU:14', QAW: 'OAW:5', QRS: 'ORS:0', QSH: 'OSH:0', QTD: 'OTD:14', QAF: 'OAF:0' }
  },
  {
    // Cam 3 = studio .12
    port: 8083,
    ptz: { '#O': 'p1', '#APC': 'aPC8A0683DA', '#GZ': 'gz555', '#GF': 'gfF4C', '#GI': 'giC8A0', '#D1': 'd10', '#D3': 'd30', '#S': 'eR2:S', '#PE00': 'pE00000000021F', '#PE01': 'pE010000700000', '#PE02': 'pE020000000000', '#UPVS': 'uPVS500' },
    cam: { QID: 'OID:AW-HE40', QSV: 'OSV:Ver.1.22', QGU: 'OGU:17', QAW: 'OAW:5', QRS: 'ORS:0', QSH: 'OSH:B', QTD: 'OTD:11', QAF: 'OAF:0' }
  }
]

const isQuery = (endpoint, cmd) =>
  endpoint === 'aw_cam' ? /^(Q[A-Z]{1,3}|QS[ADEGJ]:[0-9A-F]{2})$/.test(cmd) : endpoint === 'aw_ptz' && cmd in CAMERAS[0].ptz

const time = () => new Date().toISOString().slice(11, 23)
let warnings = 0

CAMERAS.forEach((camera, i) => {
  camera.plugged = true
  camera.lastAt = 0
  camera.count = 0
  camera.server = http.createServer((req, res) => {
    if (!camera.plugged) {
      req.socket.destroy() // behave like an unplugged cable: no answer at all
      return
    }
    const url = new URL(req.url, 'http://x')
    const m = /^\/cgi-bin\/(aw_ptz|aw_cam)$/.exec(url.pathname)
    if (!m) {
      res.writeHead(404).end('Not Found')
      return
    }
    const endpoint = m[1]
    const cmd = url.searchParams.get('cmd') ?? ''
    const now = Date.now()
    if (camera.lastAt && now - camera.lastAt < 125) {
      warnings++
      console.log(`${time()}  Cam ${i + 1}  !! TOO FAST: ${now - camera.lastAt} ms since previous command (minimum 130)`)
    }
    camera.lastAt = now
    camera.count++
    if (!isQuery(endpoint, cmd)) {
      warnings++
      console.log(`${time()}  Cam ${i + 1}  !! WRITE COMMAND RECEIVED: ${endpoint} ${cmd}`)
    }
    const table = endpoint === 'aw_ptz' ? camera.ptz : camera.cam
    const reply = table[cmd] ?? `ER1:${cmd}`
    res.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'close' }).end(reply)
  })
  camera.server.listen(camera.port, '127.0.0.1')
})

console.log('Fake cameras running (AW-HE40, values from the 19 Nov probe):')
CAMERAS.forEach((c, i) => console.log(`  Cam ${i + 1}: 127.0.0.1:${c.port}`))
console.log('Type 1, 2 or 3 + Enter to unplug/replug a camera. Ctrl+C to quit.\n')

setInterval(() => {
  const counts = CAMERAS.map((c, i) => `Cam ${i + 1}: ${c.plugged ? c.count + ' cmds' : 'UNPLUGGED'}`).join('  |  ')
  console.log(`${time()}  ${counts}  |  warnings: ${warnings}`)
  CAMERAS.forEach((c) => (c.count = 0))
}, 10000)

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const n = Number(line.trim())
  const camera = CAMERAS[n - 1]
  if (!camera) return
  camera.plugged = !camera.plugged
  console.log(`${time()}  Cam ${n} ${camera.plugged ? 'PLUGGED BACK IN' : 'UNPLUGGED'}`)
})
