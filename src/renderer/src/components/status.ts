import type { ConnectionState } from '@shared/types'

export const STATE_LABEL: Record<ConnectionState, string> = {
  'not-set': 'No IP set',
  connecting: 'Connecting…',
  connected: 'Connected',
  offline: 'Offline',
  'login-required': 'Needs login',
  'not-a-camera': 'Not a camera'
}

/** CSS colour class for the status dot / tile border. */
export function stateClass(state: ConnectionState): string {
  if (state === 'connected') return 'ok'
  if (state === 'connecting') return 'wait'
  if (state === 'not-set') return 'idle'
  return 'bad'
}
