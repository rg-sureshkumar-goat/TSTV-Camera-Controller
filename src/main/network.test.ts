import { describe, expect, it } from 'vitest'
import type os from 'node:os'
import { analyzeNetwork } from './network'

type Ifaces = ReturnType<typeof os.networkInterfaces>
const v4 = (address: string) => ({
  address,
  family: 'IPv4' as const,
  internal: false,
  netmask: '255.255.255.0',
  mac: '00:00:00:00:00:00',
  cidr: `${address}/24`
})
const cams = ['192.168.0.11', '192.168.0.12', '192.168.0.13']

describe('network check', () => {
  it('ok when an adapter is on the camera subnet', () => {
    const r = analyzeNetwork({ en8: [v4('192.168.0.250')], en0: [v4('10.20.30.40')] } as Ifaces, cams)
    expect(r.problem).toBe('ok')
  })

  it('self-assigned 169.254 address → manual IP warning with a suggested address', () => {
    const r = analyzeNetwork({ en8: [v4('169.254.12.34')], en0: [v4('10.20.30.40')] } as Ifaces, cams)
    expect(r.problem).toBe('self-assigned')
    expect(r.cameraSubnet).toBe('192.168.0')
    expect(r.suggestedIp).toBe('192.168.0.250')
  })

  it('on another network only (e.g. campus Wi-Fi)', () => {
    expect(analyzeNetwork({ en0: [v4('10.20.30.40')] } as Ifaces, cams).problem).toBe('not-on-camera-network')
  })

  it('no network at all', () => {
    expect(analyzeNetwork({} as Ifaces, cams).problem).toBe('no-network')
  })

  it('suggested IP avoids a camera address', () => {
    expect(analyzeNetwork({} as Ifaces, ['192.168.0.250']).suggestedIp).toBe('192.168.0.249')
  })

  it('no check when cameras are on this computer (fake-camera test server)', () => {
    expect(analyzeNetwork({} as Ifaces, ['127.0.0.1:8081']).problem).toBe('ok')
  })
})
