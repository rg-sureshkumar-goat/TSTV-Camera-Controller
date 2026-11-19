import { useEffect, useState } from 'react'
import type { AppSettings, CameraConfig, CameraStatus, DiscoveryResult } from '@shared/types'
import { STATE_LABEL, stateClass } from './status'

interface Props {
  settings: AppSettings
  statuses: CameraStatus[]
  onClose: () => void
  onSaved: (settings: AppSettings) => void
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
function addressError(value: string): string | null {
  const v = value.trim()
  if (v === '') return null
  const m = IPV4.exec(v)
  if (m && m.slice(1).every((o) => Number(o) <= 255)) return null
  if (/^[A-Za-z0-9.-]+:\d{1,5}$/.test(v)) return null // host:port, used by the fake-camera test server
  return 'Not a valid IP address (example: 192.168.0.11)'
}

export function SettingsDialog({ settings, statuses, onClose, onSaved }: Props): React.JSX.Element {
  const [cameras, setCameras] = useState<CameraConfig[]>(settings.cameras.map((c) => ({ ...c })))
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const errors = cameras.map((c) => addressError(c.ip))
  const ips = cameras.map((c) => c.ip.trim()).filter(Boolean)
  const duplicate = ips.length !== new Set(ips).size
  const canSave = !saving && errors.every((e) => e === null) && !duplicate

  const update = (i: number, patch: Partial<CameraConfig>): void =>
    setCameras((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const search = async (): Promise<void> => {
    setSearching(true)
    setError(null)
    try {
      setDiscovery(await window.camApi.discover())
    } catch (e) {
      setError(`Search failed: ${(e as Error).message}`)
    } finally {
      setSearching(false)
    }
  }

  const useFound = (): void => {
    if (!discovery) return
    const show = discovery.cameras.filter((c) => c.isShowCamera).slice(0, 3)
    setCameras((cs) => cs.map((c, i) => (show[i] ? { ...c, ip: show[i].ip } : c)))
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      onSaved(await window.camApi.saveSettings({ cameras: cameras as AppSettings['cameras'] }))
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`)
      setSaving(false)
    }
  }

  const showCount = discovery?.cameras.filter((c) => c.isShowCamera).length ?? 0

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Settings">
        <div className="modal-head">
          <h2>Settings · Cameras</h2>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="muted">
          Enter each camera's IP address, or use <b>Find cameras</b> to search the camera network. Cam 1–3 are the
          three Panasonic AW-HE40s. Check each tile against the studio monitor and swap IPs here if the order is wrong.
        </p>

        <div className="cam-form">
          {cameras.map((c, i) => {
            const st = statuses[i]
            return (
              <div className="cam-row" key={i}>
                <label>
                  <span className="field-label">Name</span>
                  <input value={c.name} maxLength={40} onChange={(e) => update(i, { name: e.target.value })} />
                </label>
                <label>
                  <span className="field-label">IP address</span>
                  <input
                    className={errors[i] ? 'invalid' : ''}
                    value={c.ip}
                    placeholder="192.168.0.11"
                    spellCheck={false}
                    onChange={(e) => update(i, { ip: e.target.value })}
                  />
                  {errors[i] && <span className="field-error">{errors[i]}</span>}
                </label>
                <div className="cam-row-status">
                  {st && st.ip === c.ip.trim() ? (
                    <>
                      <span className={`dot ${stateClass(st.state)}`} /> {STATE_LABEL[st.state]}
                      {st.values.model ? ` · ${st.values.model}` : ''}
                    </>
                  ) : (
                    <span className="muted small">Status after saving</span>
                  )}
                </div>
              </div>
            )
          })}
          {duplicate && <div className="field-error">Two cameras have the same IP address.</div>}
        </div>

        <div className="discover">
          <button className="btn" onClick={() => void search()} disabled={searching}>
            {searching ? 'Searching… (about 10 seconds)' : 'Find cameras'}
          </button>
          <span className="muted small">Asks each address on this laptop's network for its camera model. Read-only: nothing moves.</span>
        </div>

        {discovery && (
          <div className="discover-results">
            <div className="muted small">Searched {discovery.scannedSubnets.join(', ') || 'no network (no usable address)'}</div>
            {discovery.cameras.length === 0 ? (
              <div>No Panasonic cameras found. Check the network warning on the main screen.</div>
            ) : (
              <table>
                <tbody>
                  {discovery.cameras.map((d) => (
                    <tr key={d.ip}>
                      <td>{d.ip}</td>
                      <td>{d.model}</td>
                      <td className={d.isShowCamera ? '' : 'muted'}>
                        {d.isShowCamera ? 'Studio PTZ camera' : 'Not a show camera, not used'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {showCount > 0 && (
              <button className="btn" onClick={useFound}>
                Use the {Math.min(showCount, 3)} studio camera{showCount === 1 ? '' : 's'} found (in IP order)
              </button>
            )}
          </div>
        )}

        {error && <div className="field-error">{error}</div>}

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void save()} disabled={!canSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
