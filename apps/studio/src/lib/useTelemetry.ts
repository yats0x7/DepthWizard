import { useEffect, useState } from 'react'
import { telemetry, telemetryListeners, type Telemetry } from '../store'

/** Throttled subscription to the camera telemetry stream. */
export function useTelemetry(hz = 12): Telemetry {
  const [t, setT] = useState<Telemetry>({ ...telemetry })
  useEffect(() => {
    let last = 0
    const l = (v: Telemetry) => {
      const now = performance.now()
      if (now - last < 1000 / hz) return
      last = now
      setT({ ...v })
    }
    telemetryListeners.add(l)
    return () => {
      telemetryListeners.delete(l)
    }
  }, [hz])
  return t
}
