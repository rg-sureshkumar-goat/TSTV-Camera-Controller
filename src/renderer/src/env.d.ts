import type { CamApi } from '@shared/types'

declare global {
  interface Window {
    camApi: CamApi
  }
}

export {}
