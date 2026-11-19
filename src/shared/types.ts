// Types shared by the main process (camera + network code) and the window (renderer).

export type CameraSlot = 0 | 1 | 2 // Cam 1, Cam 2, Cam 3

export interface CameraConfig {
  /** Label shown on the tile, e.g. "Cam 1". */
  name: string
  /** Camera address, e.g. "192.168.0.11". "host:port" is allowed (used by the fake-camera test server). */
  ip: string
}

export interface AppSettings {
  cameras: [CameraConfig, CameraConfig, CameraConfig]
}

export type ConnectionState =
  | 'not-set' // no IP entered
  | 'connecting' // first contact, or recovering after going offline
  | 'connected'
  | 'offline' // no answer
  | 'login-required' // camera answered HTTP 401 (User auth turned on)
  | 'not-a-camera' // something answered, but not a Panasonic camera

/** Current values read back from the camera with query commands (read-only). */
export interface CameraValues {
  model?: string // QID, e.g. "AW-HE40"
  firmware?: string // QSV
  power?: 'on' | 'standby' | 'powering-on' // #O
  gainDb?: number | 'auto' // QGU
  whiteBalance?: string // QAW, decoded
  shutter?: string // QSH, decoded
  focusMode?: 'auto' | 'manual' // QAF
  irisMode?: 'auto' | 'manual' // QRS
  zoomPos?: number // #GZ, 0x555 (wide) – 0xFFF (tele)
  presets?: number[] // #PE00/#PE01/#PE02, preset numbers 1–100 in use
}

export interface CameraStatus {
  slot: CameraSlot
  name: string
  ip: string
  state: ConnectionState
  /** Plain-English detail for the tile / tooltip. */
  message: string
  values: CameraValues
  /** Milliseconds since epoch of the last good answer. */
  lastSeen?: number
}

export type NetworkProblem =
  | 'ok'
  | 'self-assigned' // an adapter has 169.254.x.x and nothing is on the camera subnet
  | 'not-on-camera-network' // no adapter on the cameras' subnet
  | 'no-network' // no usable IPv4 address at all

export interface NetworkStatus {
  problem: NetworkProblem
  /** The cameras' subnet, e.g. "192.168.0". Undefined if no camera IP is set. */
  cameraSubnet?: string
  /** This laptop's IPv4 addresses (excluding loopback). */
  addresses: { iface: string; address: string }[]
  /** Suggested manual IP for the fix, e.g. "192.168.0.250". */
  suggestedIp?: string
}

export interface DiscoveredCamera {
  ip: string
  model: string
  /** False for models that are not studio PTZ cameras (e.g. the AW-HE2). */
  isShowCamera: boolean
}

export interface DiscoveryResult {
  scannedSubnets: string[]
  cameras: DiscoveredCamera[]
}

/** The API the preload script exposes to the window as `window.camApi`. */
export interface CamApi {
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<AppSettings>
  discover(): Promise<DiscoveryResult>
  getStatuses(): Promise<CameraStatus[]>
  getNetworkStatus(): Promise<NetworkStatus>
  onStatuses(listener: (statuses: CameraStatus[]) => void): () => void
  onNetworkStatus(listener: (status: NetworkStatus) => void): () => void
  platform: 'darwin' | 'win32' | 'linux' | string
}
