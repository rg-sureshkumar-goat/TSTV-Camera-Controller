import { useEffect, useState } from 'react'
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

  const current = statuses[selected]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Cam Controller <span className="brand-sub">TSTV</span>
        </div>
        <div className="topbar-right">
          <span className="checkpoint-note">Checkpoint 2 · read-only: no camera moves or changes</span>
          <button className="btn" onClick={() => setShowSettings(true)}>
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
          <CamTiles statuses={statuses} selected={selected} onSelect={setSelected} />
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
