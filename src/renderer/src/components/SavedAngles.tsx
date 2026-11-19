import type { CameraStatus } from '@shared/types'

export function SavedAngles({ statuses }: { statuses: CameraStatus[] }): React.JSX.Element {
  return (
    <div className="panel angles">
      <div className="panel-title">
        Saved Camera Angles <span className="muted">· one column per camera · recall, store and naming arrive in Checkpoint 6</span>
      </div>
      <div className="angle-columns">
        {statuses.map((s) => {
          const presets = s.values.presets
          return (
            <div className="angle-column" key={s.slot}>
              <div className="angle-column-title">{s.name}</div>
              <div className="angle-list">
                {presets === undefined && <div className="muted small">Saved angles show here once the camera is connected.</div>}
                {presets?.length === 0 && <div className="muted small">No saved angles in this camera.</div>}
                {presets?.map((n) => (
                  <div className="angle-card disabled" key={n} title="Recall arrives in Checkpoint 6">
                    {s.name} · Angle {n}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
