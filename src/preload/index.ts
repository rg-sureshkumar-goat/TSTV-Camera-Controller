import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppSettings, CamApi, CameraStatus, NetworkStatus } from '@shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// The only bridge between the window and the camera code. The window can't
// send raw camera commands; it can only call these named actions.
const api: CamApi = {
  panTilt: (slot, pan, tilt, speed) => ipcRenderer.send('motion:panTilt', slot, pan, tilt, speed),
  zoom: (slot, direction, speed) => ipcRenderer.send('motion:zoom', slot, direction, speed),
  focus: (slot, direction, speed) => ipcRenderer.send('motion:focus', slot, direction, speed),
  keepalive: (slot) => ipcRenderer.send('motion:keepalive', slot),
  stopMotion: (slot) => ipcRenderer.send('motion:stop', slot),
  lens: (slot, action) => ipcRenderer.invoke('lens:action', slot, action),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  discover: () => ipcRenderer.invoke('cameras:discover'),
  getStatuses: () => ipcRenderer.invoke('cameras:statuses'),
  getNetworkStatus: () => ipcRenderer.invoke('network:get'),
  onStatuses: (listener) => subscribe<CameraStatus[]>('cameras:statuses', listener),
  onNetworkStatus: (listener) => subscribe<NetworkStatus>('network:status', listener),
  platform: process.platform
}

contextBridge.exposeInMainWorld('camApi', api)
