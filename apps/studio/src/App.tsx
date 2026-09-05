import { useEffect, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useStore, type Layer } from './store'
import { Sidebar } from './components/shell/Sidebar'
import { Inspector } from './components/shell/Inspector'
import { Landing } from './components/shell/Landing'
import { Viewer } from './components/viewer/Viewer'
import { HUD } from './components/hud/HUD'

const LAYERS: Layer[] = ['texture', 'hypsometric', 'slope', 'aspect', 'hillshade']

export default function App() {
  const boot = useStore((s) => s.boot)
  const refreshJobs = useStore((s) => s.refreshJobs)
  const hf = useStore((s) => s.heightField)
  const [hidePanels, setHidePanels] = useState(false)

  useEffect(() => {
    boot()
    const t = window.setInterval(refreshJobs, 15000)
    return () => window.clearInterval(t)
  }, [boot, refreshJobs])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const s = useStore.getState()
      const onCanvasOrBody = !document.activeElement || document.activeElement === document.body || document.activeElement.tagName === 'CANVAS'
      if (e.code === 'KeyM' || (e.code === 'Tab' && onCanvasOrBody && !e.shiftKey)) {
        e.preventDefault()
        s.setMode(s.mode === 'presentation' ? 'analysis' : 'presentation')
      } else if (e.code === 'Digit1') s.set('nav', 'orbit')
      else if (e.code === 'Digit2') s.set('nav', 'fly')
      else if (e.code === 'Digit3') s.set('nav', 'walk')
      else if (e.code === 'KeyL') s.set('layer', LAYERS[(LAYERS.indexOf(s.layer) + 1) % LAYERS.length])
      else if (e.code === 'KeyH') setHidePanels((v) => !v)
      else if (e.code === 'Escape' && s.nav !== 'orbit' && !document.pointerLockElement) s.set('nav', 'orbit')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full w-full overflow-hidden bg-ground">
      {!hidePanels && <Sidebar />}
      <main className="relative min-w-0 flex-1">
        {hf && (
        <button
          onClick={() => setHidePanels((v) => !v)}
          title={hidePanels ? 'Show panels (H)' : 'Hide panels (H)'}
          className="hud-chip absolute bottom-4 left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center text-ink-3 hover:text-ink"
        >
          {hidePanels ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        )}
        {hf ? (
          <>
            <Viewer />
            <HUD />
          </>
        ) : (
          <Landing />
        )}
      </main>
      {!hidePanels && hf && <Inspector />}
    </div>
  )
}
