import os from 'node:os'
import type { DiscoveredCamera, DiscoveryResult } from '@shared/types'
import { assertAllowed, commandPath, isShowCameraModel, parseReply, valueAfter, type CameraCommand } from './camera/protocol'
import { httpGet } from './camera/httpClient'
import { isPrivateLan, listIPv4, subnetOf } from './network'

const QID: CameraCommand = { endpoint: 'aw_cam', cmd: 'QID' } // model query: read-only
const PROBE_TIMEOUT_MS = 800
const CONCURRENCY = 32
const MAX_SUBNETS = 3

/**
 * Finds Panasonic cameras by asking every address on this laptop's local
 * subnets for its model (QID, a read-only query: one request per address).
 * If the laptop is on the cameras' subnet, only that subnet is scanned.
 * VPN (100.64/10) and self-assigned (169.254) networks are never scanned.
 */
export async function discoverCameras(currentCameraIps: string[]): Promise<DiscoveryResult> {
  assertAllowed(QID)
  const own = listIPv4(os.networkInterfaces()).filter((a) => isPrivateLan(a.address))
  const ownAddresses = new Set(own.map((a) => a.address))
  let subnets = [...new Set(own.map((a) => subnetOf(a.address)!))]
  const preferred = currentCameraIps.map((ip) => subnetOf(ip.trim())).find((s) => s && subnets.includes(s))
  if (preferred) subnets = [preferred]
  subnets = subnets.slice(0, MAX_SUBNETS)

  const targets: string[] = []
  for (const s of subnets) {
    for (let i = 1; i <= 254; i++) {
      const ip = `${s}.${i}`
      if (!ownAddresses.has(ip)) targets.push(ip)
    }
  }

  const found: DiscoveredCamera[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < targets.length) {
      const ip = targets[next++]
      try {
        const r = await httpGet(ip, commandPath(QID), PROBE_TIMEOUT_MS)
        if (r.status !== 200) continue
        const parsed = parseReply(r.body)
        const model = parsed.kind === 'ok' ? valueAfter(parsed.text, 'OID:') : undefined
        if (model) found.push({ ip, model, isShowCamera: isShowCameraModel(model) })
      } catch {
        // nothing at this address
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }))
  return { scannedSubnets: subnets.map((s) => `${s}.1–254`), cameras: found }
}
