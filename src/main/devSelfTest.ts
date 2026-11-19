import type { BrowserWindow } from 'electron'

/**
 * Developer self-test (only runs when CAMCTRL_SELFTEST=1, against the fake
 * cameras from `npm run mock-cameras`). Drives the real window with real
 * mouse/keyboard events and logs each step, so the fake cameras' log shows
 * whether every move was followed by a stop.
 */
/** Image-settings self-test (CAMCTRL_SELFTEST=image): change, refusals, then restore originals on Cam 1. */
export async function runImageSelfTest(win: BrowserWindow, log: (msg: string) => void): Promise<void> {
  const wc = win.webContents
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const image = (action: object): Promise<string> =>
    wc.executeJavaScript(
      `window.camApi.image(0, ${JSON.stringify(action)}).then(() => 'ok', (e) => 'error: ' + e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))`
    )
  const values = (): Promise<string> =>
    wc.executeJavaScript(`window.camApi.getStatuses().then((s) => JSON.stringify(s[0].values.image) + ' originals=' + (s[0].originals ? 'saved' : 'none'))`)
  await sleep(3000)
  log(`Cam 1 at start: ${await values()}`)
  for (const [label, action] of [
    ['gain 30 dB', { kind: 'gain', value: 30 }],
    ['pedestal +2', { kind: 'pedestal', value: 2 }],
    ['R gain +10 (AWB B mode)', { kind: 'rGain', value: 10 }],
    ['white balance 5600K', { kind: 'whiteBalance', mode: '5' }],
    ['R gain +3 in 5600K (should be refused)', { kind: 'rGain', value: 3 }],
    ['AWB in 5600K (should be refused)', { kind: 'awb' }],
    ['white balance AWB A', { kind: 'whiteBalance', mode: '1' }],
    ['run AWB', { kind: 'awb' }],
    ['run ABB', { kind: 'abb' }],
    ['shutter Synchro-Scan', { kind: 'shutter', code: 'B' }],
    ['detail High', { kind: 'detail', value: 2 }],
    ['gain 13 dB (not a 3 dB step, should be refused)', { kind: 'gain', value: 13 }]
  ] as const) {
    log(`${label} → ${await image(action)}`)
  }
  log(`Cam 1 after changes: ${await values()}`)
  log(`restore originals → ${await image({ kind: 'restoreOriginals' })}`)
  log(`Cam 1 after restore: ${await values()}`)
  // Show the Image tab for the screenshot.
  await wc.executeJavaScript(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent === 'Image').click()`)
  await sleep(500)
  log('IMAGE SELF-TEST DONE')
}

export async function runSelfTest(win: BrowserWindow, log: (msg: string) => void): Promise<void> {
  const wc = win.webContents
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const rect = async (selectorOrText: string): Promise<{ x: number; y: number; w: number; h: number }> =>
    wc.executeJavaScript(`(() => {
      const s = ${JSON.stringify(selectorOrText)}
      let el = null
      try { el = document.querySelector(s) } catch {}
      if (!el) el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === s)
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height }
    })()`)
  let pressed = false
  const mouse = (type: 'mouseDown' | 'mouseUp' | 'mouseMove', x: number, y: number): void => {
    if (type === 'mouseDown') {
      // A real mouse always moves over a control before pressing it.
      wc.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) })
      pressed = true
    }
    if (type === 'mouseUp') pressed = false
    wc.sendInputEvent({
      type,
      x: Math.round(x),
      y: Math.round(y),
      button: 'left',
      clickCount: 1,
      modifiers: pressed ? ['leftbuttondown'] : []
    })
  }
  /** Press at (x0, y0) and drag gradually to (x1, y1), like a real hand. */
  const pressAndDrag = async (x0: number, y0: number, x1: number, y1: number): Promise<void> => {
    mouse('mouseDown', x0, y0)
    for (let i = 1; i <= 6; i++) {
      await sleep(30)
      mouse('mouseMove', x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6)
    }
  }
  const toggleCable = (cam: number): Promise<unknown> => fetch(`http://127.0.0.1:8090/toggle?cam=${cam}`).then((r) => r.text())

  wc.on('console-message', (e) => log(`renderer: ${(e as unknown as { message: string }).message}`))
  win.focus()
  await sleep(500)

  log('STEP 1: joystick right + up for 1.5 s on Cam 1, then release')
  let j = await rect('.joystick')
  let cx = j.x + j.w / 2
  let cy = j.y + j.h / 2
  mouse('mouseDown', cx, cy)
  for (let i = 1; i <= 6; i++) {
    mouse('mouseMove', cx + (j.w / 2) * 0.15 * i, cy - (j.h / 2) * 0.08 * i)
    await sleep(40)
  }
  await sleep(1500)
  mouse('mouseUp', cx + j.w * 0.45, cy - j.h * 0.24)
  await sleep(1200)

  log('STEP 2: hold Tele + for 1 s, release')
  const tele = await rect('Tele +')
  mouse('mouseDown', tele.x + tele.w / 2, tele.y + tele.h / 2)
  await sleep(1000)
  mouse('mouseUp', tele.x + tele.w / 2, tele.y + tele.h / 2)
  await sleep(1200)

  log('STEP 3: joystick held, then the window loses focus (no release)')
  await pressAndDrag(cx, cy, cx - j.w * 0.4, cy)
  await sleep(1000)
  win.emit('blur')
  await sleep(1200)
  mouse('mouseUp', cx - j.w * 0.4, cy)
  await sleep(800)

  log('STEP 4: joystick held on Cam 1, press key 2 (switch to Cam 2) while still holding')
  await pressAndDrag(cx, cy, cx, cy + j.h * 0.4)
  await sleep(1000)
  wc.sendInputEvent({ type: 'keyDown', keyCode: '2' })
  wc.sendInputEvent({ type: 'char', keyCode: '2' })
  wc.sendInputEvent({ type: 'keyUp', keyCode: '2' })
  await sleep(1500)
  mouse('mouseUp', cx, cy + j.h * 0.4)
  await sleep(1000)

  log('STEP 5: Cam 2 selected: hold Far focus for 0.8 s, release')
  const far = await rect('Far ▶')
  mouse('mouseDown', far.x + far.w / 2, far.y + far.h / 2)
  await sleep(800)
  mouse('mouseUp', far.x + far.w / 2, far.y + far.h / 2)
  await sleep(1000)

  log('STEP 6: Cam 2 joystick held, cable pulled mid-move, released, cable back after 5 s')
  j = await rect('.joystick')
  cx = j.x + j.w / 2
  cy = j.y + j.h / 2
  await pressAndDrag(cx, cy, cx + j.w * 0.3, cy)
  await sleep(800)
  await toggleCable(2)
  await sleep(1500)
  mouse('mouseUp', cx + j.w * 0.3, cy)
  await sleep(5000)
  await toggleCable(2)
  await sleep(6000)

  log('STEP 7: switch back to Cam 1 with key 1; iris and auto focus are left alone')
  wc.sendInputEvent({ type: 'keyDown', keyCode: '1' })
  wc.sendInputEvent({ type: 'char', keyCode: '1' })
  wc.sendInputEvent({ type: 'keyUp', keyCode: '1' })
  await sleep(1500)
  log('STEP 8: Cam 1 lens: auto focus on, near/far refused while on, off, one-push, iris 30, auto iris on then off')
  const lens = (action: object): Promise<string> =>
    wc.executeJavaScript(`window.camApi.lens(0, ${JSON.stringify(action)}).then(() => 'ok', (e) => 'error: ' + e.message)`)
  log(`auto focus on → ${await lens({ kind: 'autoFocus', on: true })}`)
  await sleep(1500)
  const nearDisabled = await wc.executeJavaScript(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Near')).disabled`
  )
  log(`Near button disabled while auto focus is on: ${nearDisabled}`)
  log(`auto focus off → ${await lens({ kind: 'autoFocus', on: false })}`)
  log(`one-push focus → ${await lens({ kind: 'onePushFocus' })}`)
  log(`iris 30 → ${await lens({ kind: 'iris', position: 30 })}`)
  log(`auto iris on → ${await lens({ kind: 'autoIris', on: true })}`)
  log(`auto iris off → ${await lens({ kind: 'autoIris', on: false })}`)
  await sleep(1500)
  log('SELF-TEST DONE')
}
