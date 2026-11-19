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

/** OAW codes: 0 ATW, 1 AWB A, 2 AWB B, 4 3200K, 5 5600K, 9 VAR. */
export type WhiteBalanceMode = '0' | '1' | '2' | '4' | '5' | '9'
/** OSH codes: 0 off, 3 1/100, 5 1/250, 6 1/500, 7 1/1000, 8 1/2000, 9 1/4000, A 1/10000, B Synchro-Scan. */
export type ShutterCode = '0' | '3' | '5' | '6' | '7' | '8' | '9' | 'A' | 'B'

/** Image settings read back from the camera (Checkpoint 4). Undefined = unknown or not available. */
export interface ImageValues {
  gainDb?: number | 'auto' // QGU
  pedestal?: number // QTP, −10…+10
  wbMode?: WhiteBalanceMode // QAW
  rGain?: number // QRI, −30…+30 (only in AWB A/B)
  bGain?: number // QBI
  shutterCode?: string // QSH
  detail?: 0 | 1 | 2 // QDT: off / low / high
}

export type ImageAction =
  | { kind: 'gain'; value: number | 'auto' }
  | { kind: 'pedestal'; value: number }
  | { kind: 'rGain'; value: number }
  | { kind: 'bGain'; value: number }
  | { kind: 'whiteBalance'; mode: WhiteBalanceMode }
  | { kind: 'awb' }
  | { kind: 'abb' }
  | { kind: 'shutter'; code: ShutterCode }
  | { kind: 'detail'; value: 0 | 1 | 2 }
  | { kind: 'restoreOriginals' }

/** Current values read back from the camera with query commands (read-only). */
export interface CameraValues {
  image?: ImageValues
  /** False when the camera refuses the R/B pedestal query (AW-HE40: not available over IP). */
  rbPedestalSupported?: boolean
  model?: string // QID, e.g. "AW-HE40"
  firmware?: string // QSV
  power?: 'on' | 'standby' | 'powering-on' // #O
  gainDb?: number | 'auto' // QGU
  whiteBalance?: string // QAW, decoded
  shutter?: string // QSH, decoded
  focusMode?: 'auto' | 'manual' // QAF
  irisMode?: 'auto' | 'manual' // QRS
  zoomPos?: number // #GZ, 0x555 (wide) – 0xFFF (tele)
  irisPos?: number // #GI, converted to 1 (closed) – 99 (open), same scale as the iris control
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
  /** Image settings saved the first time this app saw this camera, for "Restore original settings". */
  originals?: { values: ImageValues; savedAt: string }
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

export type LensAction =
  | { kind: 'autoFocus'; on: boolean }
  | { kind: 'onePushFocus' }
  | { kind: 'autoIris'; on: boolean }
  | { kind: 'iris'; position: number } // 1 (closed) – 99 (open)

/** The API the preload script exposes to the window as `window.camApi`. */
export interface CamApi {
  /** Pan/tilt from the joystick: −1…1 each (right/up positive), speed level 1–5. (0, 0) stops. */
  panTilt(slot: CameraSlot, pan: number, tilt: number, speed: number): void
  /** Zoom: −1 wide, 0 stop, 1 tele. */
  zoom(slot: CameraSlot, direction: number, speed: number): void
  /** Manual focus: −1 near, 0 stop, 1 far. */
  focus(slot: CameraSlot, direction: number, speed: number): void
  /** Sent every ~200 ms while a movement control is held (dead-man switch). */
  keepalive(slot: CameraSlot): void
  /** Stop every move on one camera, or on all cameras when slot is omitted. */
  stopMotion(slot?: CameraSlot): void
  lens(slot: CameraSlot, action: LensAction): Promise<void>
  /** Change an image setting (Checkpoint 4). Resolves after the camera accepts it. */
  image(slot: CameraSlot, action: ImageAction): Promise<void>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<AppSettings>
  discover(): Promise<DiscoveryResult>
  getStatuses(): Promise<CameraStatus[]>
  getNetworkStatus(): Promise<NetworkStatus>
  onStatuses(listener: (statuses: CameraStatus[]) => void): () => void
  onNetworkStatus(listener: (status: NetworkStatus) => void): () => void
  platform: 'darwin' | 'win32' | 'linux' | string
}
