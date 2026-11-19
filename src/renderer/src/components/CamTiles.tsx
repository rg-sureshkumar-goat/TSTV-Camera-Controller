import type { CameraSlot, CameraStatus } from '@shared/types'
import { STATE_LABEL, stateClass } from './status'

interface Props {
  statuses: CameraStatus[]
  selected: CameraSlot
  onSelect: (slot: CameraSlot) => void
}

export function CamTiles({ statuses, selected, onSelect }: Props): React.JSX.Element {
  return (
    <div className="tiles">
      {statuses.map((s) => (
        <button
          key={s.slot}
          className={`tile ${stateClass(s.state)} ${s.slot === selected ? 'selected' : ''}`}
          onClick={() => onSelect(s.slot)}
          title={s.message}
        >
          <div className="tile-top">
            <span className="tile-name">
              {s.name} <span className="tile-key">key {s.slot + 1}</span>
            </span>
            {s.slot === selected && <span className="tile-badge">Selected</span>}
          </div>
          <div className="tile-status">
            <span className={`dot ${stateClass(s.state)}`} />
            {STATE_LABEL[s.state]}
          </div>
          <div className="tile-meta">
            {s.ip || 'No IP'}
            {s.values.model ? ` · ${s.values.model}` : ''}
          </div>
          {s.state !== 'connected' && s.state !== 'connecting' && <div className="tile-msg">{s.message}</div>}
        </button>
      ))}
    </div>
  )
}
