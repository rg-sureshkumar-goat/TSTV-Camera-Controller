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
//   - a command arrives that the app must not send yet (NOT ALLOWED):
//     anything except queries, the Checkpoint 3 movement/lens commands and
//     the Checkpoint 4 image settings (with in-range values)
//   - two commands arrive less than 130 ms apart (TOO FAST)
//   - a camera keeps moving for more than 20 s without a stop (STILL MOVING)
// Moves and stops are printed, so you can watch every move end with a stop.

import http from 'node:http'
import readline from 'node:readline'

const CAMERAS = [
  {
    // Cam 1 = studio .13
    port: 8081,
    ptz: { '#O': 'p1', '#APC': 'aPCA3157E91', '#GZ': 'gz938', '#GF': 'gfE85', '#GI': 'giC4C0', '#D1': 'd10', '#D3': 'd30', '#S': 'eR2:S', '#PE00': 'pE00000000001F', '#PE01': 'pE010000500000', '#PE02': 'pE020000000000', '#UPVS': 'uPVS500' },
    cam: { QID: 'OID:AW-HE40', QSV: 'OSV:Ver.1.03', QGU: 'OGU:23', QAW: 'OAW:2', QRI: 'ORI:0BE', QBI: 'OBI:0AF', QRS: 'ORS:0', QSH: 'OSH:0', QTD: 'OTD:08', QAF: 'OAF:0', QTP: 'OTP:096', QDT: 'ODT:1' }
  },
  {
    // Cam 2 = studio .11
    port: 8082,
    ptz: { '#O': 'p1', '#APC': 'aPC7C387ECF', '#GZ': 'gz83E', '#GF': 'gfE4F', '#GI': 'giD980', '#D1': 'd10', '#D3': 'd30', '#S': 'eR2:S', '#PE00': 'pE00000000001F', '#PE01': 'pE010000000000', '#PE02': 'pE020000000000', '#UPVS': 'uPVS500' },
    cam: { QID: 'OID:AW-HE40', QSV: 'OSV:Ver.1.03', QGU: 'OGU:14', QAW: 'OAW:5', QRS: 'ORS:0', QSH: 'OSH:0', QTD: 'OTD:14', QAF: 'OAF:0', QTP: 'OTP:096', QDT: 'ODT:1' }
  },
  {
    // Cam 3 = studio .12
    port: 8083,
    ptz: { '#O': 'p1', '#APC': 'aPC8A0683DA', '#GZ': 'gz555', '#GF': 'gfF4C', '#GI': 'giC8A0', '#D1': 'd10', '#D3': 'd30', '#S': 'eR2:S', '#PE00': 'pE00000000021F', '#PE01': 'pE010000700000', '#PE02': 'pE020000000000', '#UPVS': 'uPVS500' },
    cam: { QID: 'OID:AW-HE40', QSV: 'OSV:Ver.1.22', QGU: 'OGU:17', QAW: 'OAW:5', QRS: 'ORS:0', QSH: 'OSH:B', QTD: 'OTD:11', QAF: 'OAF:0', QTP: 'OTP:096', QDT: 'ODT:1' }
  }
]

const isQuery = (endpoint, cmd) =>
  endpoint === 'aw_cam' ? /^(Q[A-Z]{1,3}|QS[ADEGJ]:[0-9A-F]{2})$/.test(cmd) : endpoint === 'aw_ptz' && cmd in CAMERAS[0].ptz

const SPEED = '(0[1-9]|[1-9][0-9])'
/** Checkpoint 3 movement/lens commands → [reply, state change]. */
function movementOrLens(camera, endpoint, cmd) {
  let m
  if (endpoint === 'aw_ptz' && (m = new RegExp(`^#PTS(${SPEED.slice(1, -1)})(${SPEED.slice(1, -1)})$`).exec(cmd))) {
    return [`pTS${m[1]}${m[2]}`, () => setMotion(camera, 'panTilt', m[1] + m[2] !== '5050', `pan ${m[1]} tilt ${m[2]}`)]
  }
  if (endpoint === 'aw_ptz' && (m = new RegExp(`^#Z${SPEED}$`).exec(cmd))) return [`zS${m[1]}`, () => setMotion(camera, 'zoom', m[1] !== '50', `speed ${m[1]}`)]
  if (endpoint === 'aw_ptz' && (m = new RegExp(`^#F${SPEED}$`).exec(cmd))) {
    if (camera.ptz['#D1'] === 'd11') return ['ER3:%23F', () => {}] // manual focus refused while auto focus is on
    return [`fS${m[1]}`, () => setMotion(camera, 'focus', m[1] !== '50', `speed ${m[1]}`)]
  }
  if (endpoint === 'aw_ptz' && (m = new RegExp(`^#I${SPEED}$`).exec(cmd))) {
    return [`iC${m[1]}`, () => {
      const raw = Math.round(0x555 + ((Number(m[1]) - 1) / 98) * (0xfff - 0x555))
      camera.ptz['#GI'] = `gi${raw.toString(16).toUpperCase()}${camera.ptz['#D3'] === 'd31' ? 1 : 0}`
      log(camera, `iris → ${m[1]}`)
    }]
  }
  if (endpoint === 'aw_ptz' && (m = /^#D1([01])$/.exec(cmd))) {
    return [`d1${m[1]}`, () => { camera.ptz['#D1'] = `d1${m[1]}`; camera.cam.QAF = `OAF:${m[1]}`; log(camera, `auto focus ${m[1] === '1' ? 'ON' : 'OFF'}`) }]
  }
  if (endpoint === 'aw_ptz' && (m = /^#D3([01])$/.exec(cmd))) {
    return [`d3${m[1]}`, () => {
      camera.ptz['#D3'] = `d3${m[1]}`
      camera.cam.QRS = `ORS:${m[1]}`
      camera.ptz['#GI'] = camera.ptz['#GI'].slice(0, 5) + m[1]
      log(camera, `auto iris ${m[1] === '1' ? 'ON' : 'OFF'}`)
    }]
  }
  if (endpoint === 'aw_cam' && cmd === 'OSE:69:1') return ['OSE:69:1', () => log(camera, 'one-push auto focus')]
  return imageSetting(camera, endpoint, cmd)
}

/** Checkpoint 4 image settings, with the same refusals as an AW-HE40. */
function imageSetting(camera, endpoint, cmd) {
  if (endpoint !== 'aw_cam') return null
  const c = camera.cam
  const wbAB = () => c.QAW === 'OAW:1' || c.QAW === 'OAW:2'
  let m
  if ((m = /^OGU:([0-9A-F]{2})$/.exec(cmd))) {
    const n = parseInt(m[1], 16)
    if (!(n === 0x80 || (n >= 8 && n <= 0x38 && (n - 8) % 3 === 0))) return null
    return [cmd, () => { c.QGU = cmd; log(camera, `gain → ${n === 0x80 ? 'auto' : n - 8 + ' dB'}`) }]
  }
  if ((m = /^OTP:([0-9A-F]{3})$/.exec(cmd))) return [cmd, () => { c.QTP = cmd; log(camera, `pedestal → ${(parseInt(m[1], 16) - 0x96) / 15}`) }]
  if ((m = /^(ORI|OBI):([0-9A-F]{3})$/.exec(cmd))) {
    if (!wbAB()) return [`ER3:${m[1]}`, () => log(camera, `${m[1]} refused (white balance not AWB A/B)`)]
    return [cmd, () => { c[m[1] === 'ORI' ? 'QRI' : 'QBI'] = cmd; log(camera, `${m[1] === 'ORI' ? 'R' : 'B'} gain → ${(parseInt(m[2], 16) - 0x96) / 5}`) }]
  }
  if ((m = /^OAW:([01245])$/.exec(cmd))) return [cmd, () => { c.QAW = cmd; log(camera, `white balance mode → ${m[1]}`) }]
  if (cmd === 'OWS') {
    if (!wbAB()) return ['ER3:OWS', () => log(camera, 'AWB refused (white balance not AWB A/B)')]
    return ['OWS', () => { c.QRI = 'ORI:096'; c.QBI = 'OBI:096'; log(camera, 'AWB run (R/B gain reset to 0)') }]
  }
  if (cmd === 'OAS') return ['OAS', () => log(camera, 'ABB run')]
  if (/^OSH:[035-9AB]$/.test(cmd)) return [cmd, () => { c.QSH = cmd; log(camera, `shutter → ${cmd.slice(4)}`) }]
  if (/^ODT:[012]$/.test(cmd)) return [cmd, () => { c.QDT = cmd; log(camera, `detail → ${cmd.slice(4)}`) }]
  return null
}

function log(camera, msg) {
  console.log(`${time()}  Cam ${camera.n}  ${msg}`)
}

function setMotion(camera, axis, moving, detail) {
  const was = camera.moving[axis]
  camera.moving[axis] = moving ? Date.now() : 0
  if (moving && !was) log(camera, `${axis.toUpperCase()} MOVING (${detail})`)
  else if (!moving && was) log(camera, `${axis.toUpperCase()} stopped after ${((Date.now() - was) / 1000).toFixed(1)} s`)
}

const time = () => new Date().toISOString().slice(11, 23)
let warnings = 0

CAMERAS.forEach((camera, i) => {
  camera.n = i + 1
  camera.moving = { panTilt: 0, zoom: 0, focus: 0 }
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
    let reply
    if (isQuery(endpoint, cmd)) {
      const table = endpoint === 'aw_ptz' ? camera.ptz : camera.cam
      const wbAB = camera.cam.QAW === 'OAW:1' || camera.cam.QAW === 'OAW:2'
      if ((cmd === 'QRI' || cmd === 'QBI') && !wbAB) reply = `ER3:${cmd}` // like the real AW-HE40 in preset modes
      else reply = table[cmd] ?? `ER1:${cmd}`
    } else {
      const action = movementOrLens(camera, endpoint, cmd)
      if (action) {
        reply = action[0]
        action[1]()
      } else {
        warnings++
        console.log(`${time()}  Cam ${i + 1}  !! NOT ALLOWED: ${endpoint} ${cmd}`)
        reply = `ER1:${cmd}`
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'close' }).end(reply)
  })
  camera.server.listen(camera.port, '127.0.0.1')
})

console.log('Fake cameras running (AW-HE40, values from the 19 Nov probe):')
CAMERAS.forEach((c, i) => console.log(`  Cam ${i + 1}: 127.0.0.1:${c.port}`))
console.log('Type 1, 2 or 3 + Enter to unplug/replug a camera. Ctrl+C to quit.\n')

setInterval(() => {
  for (const c of CAMERAS) {
    for (const [axis, since] of Object.entries(c.moving)) {
      if (since && Date.now() - since > 20000 && !c.warnedMoving?.[axis]) {
        warnings++
        c.warnedMoving = { ...c.warnedMoving, [axis]: true }
        log(c, `!! STILL MOVING: ${axis} has moved for over 20 s without a stop`)
      }
      if (!since && c.warnedMoving?.[axis]) c.warnedMoving[axis] = false
    }
  }
}, 1000)

setInterval(() => {
  const counts = CAMERAS.map((c, i) => `Cam ${i + 1}: ${c.plugged ? c.count + ' cmds' : 'UNPLUGGED'}`).join('  |  ')
  console.log(`${time()}  ${counts}  |  warnings: ${warnings}`)
  CAMERAS.forEach((c) => (c.count = 0))
}, 10000)

// Control port for automated tests: GET http://127.0.0.1:8090/toggle?cam=1 unplugs/replugs Cam 1.
http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const camera = CAMERAS[Number(url.searchParams.get('cam')) - 1]
    if (url.pathname !== '/toggle' || !camera) return res.writeHead(404).end()
    camera.plugged = !camera.plugged
    console.log(`${time()}  Cam ${camera.n} ${camera.plugged ? 'PLUGGED BACK IN' : 'UNPLUGGED'}`)
    res.end(camera.plugged ? 'plugged' : 'unplugged')
  })
  .listen(8090, '127.0.0.1')

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const n = Number(line.trim())
  const camera = CAMERAS[n - 1]
  if (!camera) return
  camera.plugged = !camera.plugged
  console.log(`${time()}  Cam ${n} ${camera.plugged ? 'PLUGGED BACK IN' : 'UNPLUGGED'}`)
})
