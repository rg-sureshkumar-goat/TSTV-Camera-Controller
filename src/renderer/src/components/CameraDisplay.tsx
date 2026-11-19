import type { CameraStatus } from '@shared/types'

export function CameraDisplay({ status }: { status?: CameraStatus }): React.JSX.Element {
  return (
    <div className="panel display">
      <div className="panel-title">
        Camera Display <span className="muted">· {status?.name ?? '—'}</span>
      </div>
      <div className="display-placeholder">
        <div className="display-cam">{status?.name ?? 'No camera'}</div>
        <div className="muted">The live picture of the selected camera appears here in Checkpoint 5.</div>
      </div>
    </div>
  )
}
