import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, CameraSlot, CameraStatus, NetworkStatus } from '@shared/types'
import { CameraDisplay } from './components/CameraDisplay'
import { CamTiles } from './components/CamTiles'
import { ControlPanel } from './components/ControlPanel'
import { NetworkBanner } from './components/NetworkBanner'
import { SavedAngles } from './components/SavedAngles'
import { SettingsDialog } from './components/SettingsDialog'
import { UpNext } from './components/UpNext'

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [statuses, setStatuses] = useState<CameraStatus[]>([])
  const [network, setNetwork] = useState<NetworkStatus | null>(null)
  const [selected, setSelected] = useState<CameraSlot>(0)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const api = window.camApi
    void api.getSettings().then(setSettings)
    void api.getStatuses().then(setStatuses)
    void api.getNetworkStatus().then(setNetwork)
    const offStatuses = api.onStatuses(setStatuses)
    const offNetwork = api.onNetworkStatus(setNetwork)
    return () => {
      offStatuses()
      offNetwork()
    }
  }, [])

  // Switching camera stops anything still moving on the camera we leave.
  const select = useCallback(
    (slot: CameraSlot) => {
      setSelected((prev) => {
        if (prev !== slot) window.camApi.stopMotion(prev)
        return slot
      })
    },
    []
  )

  // Keyboard: 1, 2, 3 select Cam 1–3 (not while typing in Settings).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (showSettings || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === '1' || e.key === '2' || e.key === '3') select((Number(e.key) - 1) as CameraSlot)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select, showSettings])

  // SAFETY (second layer; the main process does the same): stop everything when
  // the window loses focus or is hidden.
  useEffect(() => {
    const stop = (): void => window.camApi.stopMotion()
    const onVisibility = (): void => {
      if (document.hidden) stop()
    }
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const current = statuses[selected]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Cam Controller <span className="brand-sub">TSTV</span>
        </div>
        <div className="topbar-right">
          <span className="checkpoint-note">Checkpoint 4 · movement, lens and image · keys 1 2 3 select a camera</span>
          <button
            className="btn"
            onClick={() => {
              window.camApi.stopMotion()
              setShowSettings(true)
            }}
          >
            Settings
          </button>
        </div>
      </header>

      {network && network.problem !== 'ok' && <NetworkBanner network={network} platform={window.camApi.platform} />}

      <main className="layout">
        <section className="zone-display">
          <CameraDisplay status={current} />
        </section>
        <section className="zone-panel">
          <ControlPanel status={current} />
        </section>
        <section className="zone-tiles">
          <CamTiles statuses={statuses} selected={selected} onSelect={select} />
        </section>
        <section className="zone-angles">
          <SavedAngles statuses={statuses} />
        </section>
        <aside className="zone-upnext">
          <UpNext />
        </aside>
      </main>

      {showSettings && settings && (
        <SettingsDialog
          settings={settings}
          statuses={statuses}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => {
            setSettings(s)
            setShowSettings(false)
          }}
        />
      )}
    </div>
  )
}
