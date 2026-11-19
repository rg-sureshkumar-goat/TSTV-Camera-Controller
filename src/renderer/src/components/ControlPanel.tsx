import type { CameraStatus } from '@shared/types'
import { STATE_LABEL } from './status'

function Row({ label, value }: { label: string; value?: string }): React.JSX.Element {
  return (
    <div className="value-row">
      <span className="value-label">{label}</span>
      <span className="value">{value ?? '—'}</span>
    </div>
  )
}

const cap = (s?: string): string | undefined => (s ? s[0].toUpperCase() + s.slice(1) : undefined)

export function ControlPanel({ status }: { status?: CameraStatus }): React.JSX.Element {
  const v = status?.values ?? {}
  const live = status?.state === 'connected'
  const gain = v.gainDb === undefined ? undefined : v.gainDb === 'auto' ? 'Auto' : `${v.gainDb} dB`
  const zoom =
    v.zoomPos === undefined ? undefined : `${Math.round(((v.zoomPos - 0x555) / (0xfff - 0x555)) * 100)}% toward tele`
  return (
    <div className="panel control">
      <div className="panel-title">
        Camera Control Panel <span className="muted">· {status?.name ?? '—'}</span>
      </div>
      <div className="control-groups">
        <div className="control-group placeholder">
          <div className="group-title">Movement & lens</div>
          <div className="muted small">Pan/tilt, zoom, focus, iris and speed controls arrive in Checkpoint 3.</div>
        </div>
        <div className="control-group placeholder">
          <div className="group-title">Image</div>
          <div className="muted small">Gain, pedestal, colour, white/black balance, shutter and detail arrive in Checkpoint 4.</div>
        </div>
      </div>
      <div className="group-title">
        Current values <span className="muted small">(read from the camera{live ? '' : ', last known'})</span>
      </div>
      <div className={`values ${live ? '' : 'stale'}`}>
        <Row label="Status" value={status ? STATE_LABEL[status.state] : undefined} />
        <Row label="Model" value={v.model} />
        <Row label="Firmware" value={v.firmware} />
        <Row label="Power" value={v.power === 'on' ? 'On' : v.power === 'standby' ? 'Standby' : cap(v.power)} />
        <Row label="Gain" value={gain} />
        <Row label="White balance" value={v.whiteBalance} />
        <Row label="Shutter" value={v.shutter} />
        <Row label="Focus" value={cap(v.focusMode)} />
        <Row label="Iris" value={cap(v.irisMode)} />
        <Row label="Zoom" value={zoom} />
      </div>
    </div>
  )
}
