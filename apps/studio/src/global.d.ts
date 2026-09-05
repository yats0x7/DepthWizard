import type { DesktopBridge } from './lib/api'

declare global {
  interface Window {
    depthwizard?: DesktopBridge
    __DW_API__?: string
    __dw?: Record<string, unknown>
  }
}
export {}
