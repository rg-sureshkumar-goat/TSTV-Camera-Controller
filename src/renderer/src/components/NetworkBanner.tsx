import { useState } from 'react'
import type { NetworkStatus } from '@shared/types'

function ManualIpSteps({ ip, platform }: { ip: string; platform: string }): React.JSX.Element {
  if (platform === 'win32') {
    return (
      <ol>
        <li>Open <b>Settings → Network &amp; internet → Ethernet</b> (the USB-C adapter).</li>
        <li>Next to <b>IP assignment</b>, click <b>Edit</b> and choose <b>Manual</b>.</li>
        <li>Turn on <b>IPv4</b>. IP address: <code>{ip}</code>. Subnet mask: <code>255.255.255.0</code> (if it asks for a prefix length, enter <code>24</code>). Leave Gateway empty.</li>
        <li>Click <b>Save</b>. This warning disappears within a few seconds.</li>
      </ol>
    )
  }
  return (
    <ol>
      <li>Open <b>System Settings → Network</b> and click the USB/Ethernet adapter.</li>
      <li>Click <b>Details…</b>, then <b>TCP/IP</b>.</li>
      <li>Configure IPv4: <b>Manually</b>. IP Address: <code>{ip}</code>. Subnet Mask: <code>255.255.255.0</code>. Leave Router empty.</li>
      <li>Click <b>OK</b>. This warning disappears within a few seconds.</li>
    </ol>
  )
}

export function NetworkBanner({ network, platform }: { network: NetworkStatus; platform: string }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const subnet = network.cameraSubnet ? `${network.cameraSubnet}.x` : 'the camera network'
  const ip = network.suggestedIp ?? '192.168.0.250'

  let title: string
  let body: string
  if (network.problem === 'self-assigned') {
    title = 'This laptop has no address on the camera network'
    body = `Your Ethernet adapter gave itself a 169.254.x.x address. That means the studio network didn't hand out an address, so the laptop can't reach the cameras on ${subnet}. Give the adapter a manual IP:`
  } else if (network.problem === 'no-network') {
    title = 'No network connection'
    body = `Plug the USB-C Ethernet adapter into a free port on the same switch as the RP50. If it's plugged in and this stays, give the adapter a manual IP:`
  } else {
    title = `This laptop isn't on the camera network (${subnet})`
    body = `Plug the USB-C Ethernet adapter into a free port on the same switch as the RP50. If it's plugged in and this stays, give the adapter a manual IP:`
  }

  return (
    <div className="banner warn" role="alert">
      <div className="banner-head">
        <b>⚠ {title}</b>
        <button className="btn small" onClick={() => setOpen(!open)}>
          {open ? 'Hide steps' : 'How to fix'}
        </button>
      </div>
      {open && (
        <div className="banner-body">
          <p>{body}</p>
          <ManualIpSteps ip={ip} platform={platform} />
          <p className="muted small">
            This laptop's addresses: {network.addresses.length ? network.addresses.map((a) => `${a.address} (${a.iface})`).join(', ') : 'none'}
          </p>
        </div>
      )}
    </div>
  )
}
