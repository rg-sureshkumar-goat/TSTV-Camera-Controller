import { useEffect, useRef, useState } from 'react'
import type { CameraStatus, ImageAction, ImageValues, ShutterCode, WhiteBalanceMode } from '@shared/types'

const WB_LABELS: [WhiteBalanceMode, string][] = [
  ['0', 'ATW'],
  ['1', 'AWB A'],
  ['2', 'AWB B'],
  ['4', '3200K'],
  ['5', '5600K']
]
const SHUTTER_LABELS: [ShutterCode, string][] = [
  ['0', 'Off'],
  ['3', '1/100'],
  ['5', '1/250'],
  ['6', '1/500'],
  ['7', '1/1000'],
  ['8', '1/2000'],
  ['9', '1/4000'],
  ['A', '1/10000'],
  ['B', 'Synchro-Scan (LED screens)']
]
const DETAIL_LABELS = ['Off', 'Low', 'High']

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n))
const wbLabel = (m?: string): string => WB_LABELS.find(([c]) => c === m)?.[1] ?? (m === '9' ? 'VAR' : '—')
const shutterLabel = (c?: string): string => SHUTTER_LABELS.find(([k]) => k === c)?.[1] ?? (c ? `code ${c}` : '—')

/**
 * −/+ stepper. Clicks change the number on screen straight away; the camera
 * gets ONE command 400 ms after the last click (each setting change is written
 * to the camera's memory, so rapid clicks are merged).
 */
function Stepper({
  value,
  min,
  max,
  step,
  format,
  disabled,
  onCommit
}: {
  value: number | undefined
  min: number
  max: number
  step: number
  format: (n: number) => string
  disabled: boolean
  onCommit: (n: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<number | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), [])
  // Once the camera reports the value we sent, drop the draft.
  useEffect(() => {
    if (draft !== null && value === draft && !timer.current) setDraft(null)
  }, [value, draft])

  const shown = draft ?? value
  const change = (delta: number): void => {
    const base = shown ?? 0
    const next = Math.min(max, Math.max(min, base + delta))
    setDraft(next)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      onCommit(next)
    }, 400)
  }
  return (
    <div className="stepper">
      <button className="btn small" disabled={disabled || shown === undefined || shown <= min} onClick={() => change(-step)}>
        −
      </button>
      <span className={`stepper-value ${draft !== null ? 'pending' : ''}`}>{shown === undefined ? '—' : format(shown)}</span>
      <button className="btn small" disabled={disabled || shown === undefined || shown >= max} onClick={() => change(step)}>
        +
      </button>
    </div>
  )
}

function OriginalsSummary({ o }: { o: ImageValues }): React.JSX.Element {
  const parts = [
    `gain ${o.gainDb === 'auto' ? 'auto' : `${o.gainDb} dB`}`,
    `pedestal ${o.pedestal !== undefined ? signed(o.pedestal) : '—'}`,
    `white balance ${wbLabel(o.wbMode)}`,
    o.rGain !== undefined ? `R ${signed(o.rGain)} / B ${signed(o.bGain ?? 0)}` : null,
    `shutter ${shutterLabel(o.shutterCode)}`,
    `detail ${o.detail !== undefined ? DETAIL_LABELS[o.detail] : '—'}`
  ].filter(Boolean)
  return <span>{parts.join(' · ')}</span>
}

export function ImagePanel({ status }: { status?: CameraStatus }): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const slot = status?.slot ?? 0
  const live = status?.state === 'connected'
  const img = status?.values.image ?? {}
  const rbAdjustable = img.wbMode === '1' || img.wbMode === '2'
  const gainAuto = img.gainDb === 'auto'

  useEffect(() => {
    setError(null)
    setConfirmRestore(false)
  }, [slot])

  const act = async (action: ImageAction, label: string): Promise<void> => {
    setBusy(label)
    setError(null)
    try {
      await window.camApi.image(slot, action)
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="image-panel">
      <div className="image-row">
        <span className="image-label">Gain</span>
        <Stepper
          value={typeof img.gainDb === 'number' ? img.gainDb : undefined}
          min={0}
          max={48}
          step={3}
          format={(n) => `${n} dB`}
          disabled={!live || gainAuto}
          onCommit={(n) => void act({ kind: 'gain', value: n }, 'gain')}
        />
        <div className="segmented">
          <button className={gainAuto ? 'on' : ''} disabled={!live || gainAuto} onClick={() => void act({ kind: 'gain', value: 'auto' }, 'gain')}>
            Auto
          </button>
          <button
            className={!gainAuto && img.gainDb !== undefined ? 'on' : ''}
            disabled={!live || !gainAuto}
            onClick={() => void act({ kind: 'gain', value: 0 }, 'gain')}
            title="Switch to manual gain (starts at 0 dB)"
          >
            Manual
          </button>
        </div>
      </div>

      <div className="image-row">
        <span className="image-label">Pedestal (black level)</span>
        <Stepper
          value={img.pedestal}
          min={-10}
          max={10}
          step={1}
          format={signed}
          disabled={!live}
          onCommit={(n) => void act({ kind: 'pedestal', value: n }, 'pedestal')}
        />
      </div>

      <div className="image-row wrap">
        <span className="image-label">White balance</span>
        <div className="segmented">
          {WB_LABELS.map(([code, label]) => (
            <button
              key={code}
              className={img.wbMode === code ? 'on' : ''}
              disabled={!live || busy !== null}
              onClick={() => void act({ kind: 'whiteBalance', mode: code }, 'wb')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="image-row">
        <span className="image-label" />
        <button
          className="btn small"
          disabled={!live || !rbAdjustable || busy !== null}
          title={rbAdjustable ? 'Point the camera at something white, then run' : 'Choose AWB A or AWB B first'}
          onClick={() => void act({ kind: 'awb' }, 'awb')}
        >
          {busy === 'awb' ? 'Running AWB…' : 'Run auto white balance (AWB)'}
        </button>
        <button className="btn small" disabled={!live || busy !== null} onClick={() => void act({ kind: 'abb' }, 'abb')}>
          {busy === 'abb' ? 'Running ABB…' : 'Run auto black balance (ABB)'}
        </button>
      </div>

      <div className="image-row">
        <span className="image-label">R gain (red, highlights)</span>
        <Stepper
          value={img.rGain}
          min={-30}
          max={30}
          step={1}
          format={signed}
          disabled={!live || !rbAdjustable}
          onCommit={(n) => void act({ kind: 'rGain', value: n }, 'rGain')}
        />
        <span className="image-label short">B gain</span>
        <Stepper
          value={img.bGain}
          min={-30}
          max={30}
          step={1}
          format={signed}
          disabled={!live || !rbAdjustable}
          onCommit={(n) => void act({ kind: 'bGain', value: n }, 'bGain')}
        />
      </div>
      {!rbAdjustable && img.wbMode !== undefined && (
        <div className="muted small indent">R/B gain can be adjusted only when white balance is AWB A or AWB B.</div>
      )}

      <div className="image-row">
        <span className="image-label">R/B pedestal (shadows)</span>
        <span className="muted small">
          {status?.values.rbPedestalSupported === false
            ? `Not available on this camera${status.values.model ? ` (${status.values.model})` : ''}.`
            : 'Checking…'}
        </span>
      </div>

      <div className="image-row">
        <span className="image-label">Shutter</span>
        <select
          value={img.shutterCode ?? ''}
          disabled={!live || busy !== null}
          onChange={(e) => void act({ kind: 'shutter', code: e.target.value as ShutterCode }, 'shutter')}
        >
          {img.shutterCode === undefined && <option value="">—</option>}
          {SHUTTER_LABELS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="image-row">
        <span className="image-label">Detail (sharpening)</span>
        <div className="segmented">
          {DETAIL_LABELS.map((label, n) => (
            <button
              key={label}
              className={img.detail === n ? 'on' : ''}
              disabled={!live || busy !== null}
              onClick={() => void act({ kind: 'detail', value: n as 0 | 1 | 2 }, 'detail')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="field-error">{error}</div>}

      <div className="restore">
        {status?.originals ? (
          <>
            <div className="muted small">
              Original settings, saved {new Date(status.originals.savedAt).toLocaleString()}: <OriginalsSummary o={status.originals.values} />
            </div>
            {confirmRestore ? (
              <div className="confirm-row">
                <span>Put {status.name} back to these settings?</span>
                <button
                  className="btn small primary"
                  disabled={!live || busy !== null}
                  onClick={() => {
                    setConfirmRestore(false)
                    void act({ kind: 'restoreOriginals' }, 'restore')
                  }}
                >
                  Yes, restore
                </button>
                <button className="btn small" onClick={() => setConfirmRestore(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn small" disabled={!live || busy !== null} onClick={() => setConfirmRestore(true)}>
                {busy === 'restore' ? 'Restoring…' : 'Restore original settings…'}
              </button>
            )}
          </>
        ) : (
          <div className="muted small">Original settings are saved the first time the camera's values are read.</div>
        )}
      </div>
    </div>
  )
}
