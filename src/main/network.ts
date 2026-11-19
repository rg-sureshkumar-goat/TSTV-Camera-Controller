import os from 'node:os'
import type { NetworkStatus } from '@shared/types'

type Interfaces = ReturnType<typeof os.networkInterfaces>

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function isIPv4(s: string): boolean {
  const m = IPV4.exec(s)
  return !!m && m.slice(1).every((o) => Number(o) <= 255)
}

/** "192.168.0.11" → "192.168.0". Undefined for host:port or non-IPv4 values. */
export function subnetOf(ip: string): string | undefined {
  return isIPv4(ip) ? ip.split('.').slice(0, 3).join('.') : undefined
}

/** Private LAN ranges (not VPN/CGNAT 100.64/10, not link-local 169.254/16). */
export function isPrivateLan(ip: string): boolean {
  if (!isIPv4(ip)) return false
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export function listIPv4(interfaces: Interfaces): { iface: string; address: string }[] {
  const out: { iface: string; address: string }[] = []
  for (const [iface, addrs] of Object.entries(interfaces)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ iface, address: a.address })
    }
  }
  return out
}

/**
 * Works out whether this laptop can reach the camera network, and if not, why.
 * Pure function so it can be unit-tested; `checkNetwork` feeds it real data.
 */
export function analyzeNetwork(interfaces: Interfaces, cameraIps: string[]): NetworkStatus {
  const addresses = listIPv4(interfaces)
  const cameraSubnet = cameraIps.map((ip) => subnetOf(ip.trim())).find(Boolean)

  // Cameras on this computer (the fake-camera test server) or no IPs set: nothing to check.
  if (!cameraSubnet) return { problem: 'ok', addresses }

  const taken = new Set(cameraIps.map((ip) => ip.trim()))
  let suggestedIp = `${cameraSubnet}.250`
  for (let last = 250; last > 200 && taken.has(`${cameraSubnet}.${last}`); last--) {
    suggestedIp = `${cameraSubnet}.${last - 1}`
  }

  if (addresses.some((a) => subnetOf(a.address) === cameraSubnet)) {
    return { problem: 'ok', cameraSubnet, addresses, suggestedIp }
  }
  if (addresses.some((a) => a.address.startsWith('169.254.'))) {
    return { problem: 'self-assigned', cameraSubnet, addresses, suggestedIp }
  }
  if (addresses.length === 0) {
    return { problem: 'no-network', cameraSubnet, addresses, suggestedIp }
  }
  return { problem: 'not-on-camera-network', cameraSubnet, addresses, suggestedIp }
}

export function checkNetwork(cameraIps: string[]): NetworkStatus {
  return analyzeNetwork(os.networkInterfaces(), cameraIps)
}
