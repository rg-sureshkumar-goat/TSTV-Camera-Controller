import { app, BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings, ImageAction, LensAction, NetworkStatus } from '@shared/types'
import { CameraManager } from './camera/cameraManager'
import { discoverCameras } from './discovery'
import { checkNetwork } from './network'
import { OriginalsStore } from './originalsStore'
import { SettingsStore } from './settings'

const NETWORK_CHECK_MS = 2000

let mainWindow: BrowserWindow | null = null
let manager: CameraManager
let store: SettingsStore
let settings: AppSettings
let network: NetworkStatus
let networkTimer: NodeJS.Timeout | null = null

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function refreshNetwork(): void {
  const next = checkNetwork(settings.cameras.map((c) => c.ip))
  if (JSON.stringify(next) !== JSON.stringify(network)) {
    network = next
    send('network:status', network)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Cam Controller',
    backgroundColor: '#14161a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // SAFETY: every move stops when the window loses focus, hides, minimizes, closes, crashes or hangs.
  mainWindow.on('blur', () => manager.stopAllMotion('window lost focus'))
  mainWindow.on('hide', () => manager.stopAllMotion('window hidden'))
  mainWindow.on('minimize', () => manager.stopAllMotion('window minimized'))
  mainWindow.on('close', () => manager.stopAllMotion('window closing'))
  mainWindow.webContents.on('render-process-gone', () => manager.stopAllMotion('window crashed'))
  mainWindow.on('unresponsive', () => manager.stopAllMotion('window not responding'))

  // The window only ever shows the app itself: no navigating away, and links open in the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Developer self-test against the fake cameras (CAMCTRL_SELFTEST=1). Never runs otherwise.
  if (process.env.CAMCTRL_SELFTEST === '1' || process.env.CAMCTRL_SELFTEST === 'image') {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void import('./devSelfTest').then(({ runSelfTest, runImageSelfTest }) =>
          (process.env.CAMCTRL_SELFTEST === 'image' ? runImageSelfTest : runSelfTest)(mainWindow!, (m) => console.log(`[selftest ${new Date().toISOString().slice(11, 23)}] ${m}`)).catch(
            (err) => console.log(`[selftest ${new Date().toISOString().slice(11, 23)}] FAILED: ${(err as Error).stack}`)
          )
        )
      }, 4000)
    })
  }

  // Developer check: CAMCTRL_SCREENSHOT=/path/shot.png saves a picture of the window, then quits.
  const shotPath = process.env.CAMCTRL_SCREENSHOT
  if (shotPath) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await mainWindow!.webContents.capturePage()
        fs.writeFileSync(shotPath, image.toPNG())
        app.quit()
      }, Number(process.env.CAMCTRL_SCREENSHOT_DELAY_MS ?? 6000))
    })
  }
}

/** Numbers from the window are untrusted: anything odd becomes 0 (= stop). */
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function registerIpc(): void {
  ipcMain.on('motion:panTilt', (_e, slot, pan, tilt, speed) => manager.camera(slot)?.panTilt(num(pan), num(tilt), num(speed)))
  ipcMain.on('motion:zoom', (_e, slot, direction, speed) => manager.camera(slot)?.zoom(num(direction), num(speed)))
  ipcMain.on('motion:focus', (_e, slot, direction, speed) => manager.camera(slot)?.focus(num(direction), num(speed)))
  ipcMain.on('motion:keepalive', (_e, slot) => manager.camera(slot)?.keepalive())
  ipcMain.on('motion:stop', (_e, slot) => {
    if (slot === undefined || slot === null) manager.stopAllMotion('stop button')
    else manager.camera(slot)?.stopMotion('released')
  })
  ipcMain.handle('lens:action', async (_e, slot, action: LensAction) => {
    const cam = manager.camera(slot)
    if (!cam) throw new Error('No such camera')
    const kinds = ['autoFocus', 'onePushFocus', 'autoIris', 'iris']
    if (!action || !kinds.includes(action.kind)) throw new Error('Unknown lens action')
    await cam.lens(action)
  })
  ipcMain.handle('image:action', async (_e, slot, action: ImageAction) => {
    const cam = manager.camera(slot)
    if (!cam) throw new Error('No such camera')
    await cam.image(action) // values are validated again in imageCommand and the safety gate
  })
  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:save', (_e, next: AppSettings) => {
    settings = store.save(next)
    manager.applySettings(settings)
    refreshNetwork()
    return settings
  })
  ipcMain.handle('cameras:statuses', () => manager.statuses())
  ipcMain.handle('cameras:discover', () => discoverCameras(settings.cameras.map((c) => c.ip)))
  ipcMain.handle('network:get', () => network)
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('org.tstv.camcontroller')
  const userData = process.env.CAMCTRL_USER_DATA
  if (userData) app.setPath('userData', userData) // lets tests use a throwaway settings folder
  store = new SettingsStore(app.getPath('userData'))
  settings = store.load()
  network = checkNetwork(settings.cameras.map((c) => c.ip))

  manager = new CameraManager(settings, new OriginalsStore(app.getPath('userData')))
  manager.on('statuses', (statuses) => send('cameras:statuses', statuses))

  registerIpc()
  createWindow()
  manager.start()
  networkTimer = setInterval(refreshNetwork, NETWORK_CHECK_MS)
})

app.on('before-quit', () => {
  manager?.stopAllMotion('app quitting')
  if (networkTimer) clearInterval(networkTimer)
  manager?.stop()
})

app.on('window-all-closed', () => app.quit())
