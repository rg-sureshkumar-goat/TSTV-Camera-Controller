import { useEffect, useRef, useState } from 'react'
import type { CameraStatus, LensAction } from '@shared/types'
import { HoldButton, Joystick, Toggle } from './controls'
import { STATE_LABEL } from './status'

const SPEED_LABELS = ['', 'Very slow', 'Slow', 'Medium', 'Fast', 'Very fast']

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
  const [speed, setSpeed] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [irisDraft, setIrisDraft] = useState<number | null>(null)
  const irisTimer = useRef<number | null>(null)

  const api = window.camApi
  const slot = status?.slot ?? 0
  const v = status?.values ?? {}
  const live = status?.state === 'connected'
  const autoFocus = v.focusMode === undefined ? undefined : v.focusMode === 'auto'
  const autoIris = v.irisMode === undefined ? undefined : v.irisMode === 'auto'

  // Switching cameras clears messages and any half-dragged iris value.
  useEffect(() => {
    setError(null)
    setIrisDraft(null)
  }, [slot])

  const lens = async (action: LensAction): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await api.lens(slot, action)
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(false)
    }
  }

  // Iris: send while dragging, but at most every 200 ms; always send the final value on release.
  const irisPending = useRef<number | null>(null)
  const sendIris = (position: number, final: boolean): void => {
    setIrisDraft(position)
    irisPending.current = position
    if (irisTimer.current && !final) return
    if (irisTimer.current) window.clearTimeout(irisTimer.current)
    const p = irisPending.current
    irisPending.current = null
    void lens({ kind: 'iris', position: p })
    irisTimer.current = window.setTimeout(() => {
      irisTimer.current = null
      if (irisPending.current !== null) sendIris(irisPending.current, true)
    }, 200)
  }

  const gain = v.gainDb === undefined ? undefined : v.gainDb === 'auto' ? 'Auto' : `${v.gainDb} dB`
  const zoomPct = v.zoomPos === undefined ? undefined : Math.round(((v.zoomPos - 0x555) / (0xfff - 0x555)) * 100)
  const irisShown = irisDraft ?? v.irisPos ?? 50

  return (
    <div className="panel control">
      <div className="panel-title row-between">
        <span>
          Camera Control Panel <span className="muted">· {status?.name ?? '—'}</span>
        </span>
        <button className="btn small danger" onClick={() => api.stopMotion()} title="Stop pan, tilt, zoom and focus on every camera">
          Stop all
        </button>
      </div>

      {!live && <div className="notice">{status ? `${status.name}: ${STATE_LABEL[status.state]}. Controls are off until it reconnects.` : 'No camera'}</div>}

      {/* key={slot}: switching camera rebuilds the controls, which releases (and stops) anything held on the old camera */}
      <div className="controls-grid" key={slot}>
        <div className="control-col">
          <div className="group-title">Pan / tilt</div>
          <Joystick
            disabled={!live}
            onMove={(pan, tilt) => api.panTilt(slot, pan, tilt, speed)}
            onStop={() => api.panTilt(slot, 0, 0, speed)}
          />
          <div className="group-title">Speed</div>
          <div className="segmented speed" role="radiogroup" aria-label="Speed">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={speed === n ? 'on' : ''} onClick={() => setSpeed(n)} title={SPEED_LABELS[n]}>
                {n}
              </button>
            ))}
          </div>
          <div className="muted small center">{SPEED_LABELS[speed]} · pan, tilt, zoom and focus</div>
        </div>

        <div className="control-col">
          <div className="group-title">
            Zoom {zoomPct !== undefined && <span className="muted small">· {zoomPct}% toward tele</span>}
          </div>
          <div className="btn-pair">
            <HoldButton label="− Wide" disabled={!live} onStart={() => api.zoom(slot, -1, speed)} onStop={() => api.zoom(slot, 0, speed)} />
            <HoldButton label="Tele +" disabled={!live} onStart={() => api.zoom(slot, 1, speed)} onStop={() => api.zoom(slot, 0, speed)} />
          </div>

          <div className="group-title">Focus</div>
          <Toggle label="Auto focus" value={autoFocus} disabled={!live || busy} onChange={(on) => void lens({ kind: 'autoFocus', on })} />
          <div className="btn-pair">
            <HoldButton
              label="◀ Near"
              disabled={!live || autoFocus !== false}
              title={autoFocus ? 'Turn auto focus off to focus by hand' : undefined}
              onStart={() => api.focus(slot, -1, speed)}
              onStop={() => api.focus(slot, 0, speed)}
            />
            <HoldButton
              label="Far ▶"
              disabled={!live || autoFocus !== false}
              title={autoFocus ? 'Turn auto focus off to focus by hand' : undefined}
              onStart={() => api.focus(slot, 1, speed)}
              onStop={() => api.focus(slot, 0, speed)}
            />
          </div>
          <button
            className="btn full"
            disabled={!live || busy || autoFocus !== false}
            title="Focus once on what is in the middle of the shot, then hold that focus"
            onClick={() => void lens({ kind: 'onePushFocus' })}
          >
            One-push auto focus
          </button>

          <div className="group-title">Iris (brightness)</div>
          <Toggle label="Auto iris" value={autoIris} disabled={!live || busy} onChange={(on) => void lens({ kind: 'autoIris', on })} />
          <div className="iris-row">
            <span className="muted small">Close</span>
            <input
              type="range"
              min={1}
              max={99}
              value={irisShown}
              disabled={!live || autoIris !== false}
              onChange={(e) => sendIris(Number(e.target.value), false)}
              onPointerUp={(e) => sendIris(Number((e.target as HTMLInputElement).value), true)}
              aria-label="Iris"
            />
            <span className="muted small">Open</span>
            <span className="iris-value">{irisShown}</span>
          </div>
        </div>
      </div>

      {error && <div className="field-error">{error}</div>}

      <div className="group-title values-title">
        Current values <span className="muted small">(read from the camera{live ? '' : ', last known'})</span>
      </div>
      <div className={`values ${live ? '' : 'stale'}`}>
        <Row label="Model" value={v.model} />
        <Row label="Gain" value={gain} />
        <Row label="White balance" value={v.whiteBalance} />
        <Row label="Shutter" value={v.shutter} />
        <Row label="Focus" value={cap(v.focusMode)} />
        <Row label="Iris" value={v.irisMode ? `${cap(v.irisMode)}${v.irisPos ? ` · ${v.irisPos}` : ''}` : undefined} />
      </div>
      <div className="muted small">Image settings (gain, colour, shutter, detail) become adjustable in Checkpoint 4.</div>
    </div>
  )
}
