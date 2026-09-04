import { useEffect, useState } from 'react'
import { Cpu, ExternalLink, PanelLeft, PanelRight, X } from 'lucide-react'
import clsx from 'clsx'
import { api } from './lib/api'
import { useJobPolling } from './lib/useJob'
import { useStore } from './store'
import { UploadPanel } from './components/UploadPanel'
import { Viewer } from './components/Viewer'
import { HUD } from './components/HUD'
import { RightPanel } from './components/RightPanel'

export default function App() {
  useJobPolling()
  const { error, set, meta } = useStore()
  const [health, setHealth] = useState<{ model: string; device: string; model_loaded: boolean } | null>(null)
  const [left, setLeft] = useState(true)
  const [right, setRight] = useState(true)

  useEffect(() => {
    const load = () => api.health().then(setHealth).catch(() => setHealth(null))
    load()
    const t = setInterval(load, 15000)
    api.warmup().catch(() => undefined)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return
      if (e.key === 'f' || e.key === 'F') set({ controls: useStore.getState().controls === 'fly' ? 'orbit' : 'fly' })
      if (e.key === '1') set({ tool: 'probe' }); if (e.key === '2') set({ tool: 'profile' }); if (e.key === '3') set({ tool: 'gcp' })
      if (e.key === 'Escape') set({ pendingGcp: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set])

  return (
    <div className="h-full flex flex-col">
      <header className="h-12 shrink-0 flex items-center gap-3 px-3 border-b border-line bg-panel">
        <button className="btn px-2" onClick={() => setLeft((v) => !v)} title="Toggle jobs panel"><PanelLeft size={16} /></button>
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" className="w-6 h-6" alt="" />
          <span className="font-semibold tracking-tight">DepthWizard</span>
          <span className="text-xs text-muted hidden md:inline">single-view height estimation · 3D flythrough</span>
        </div>
        <div className="flex-1" />
        {meta && <span className={clsx('text-xs px-2 py-0.5 rounded-full border', meta.units === 'm' ? 'border-ok/50 text-ok' : 'border-warn/50 text-warn')}>{meta.units === 'm' ? 'metric DSM' : 'relative DSM'}</span>}
        <div className="flex items-center gap-1.5 text-xs text-muted" title={health ? health.model : 'API offline'}>
          <Cpu size={14} className={health ? (health.model_loaded ? 'text-ok' : 'text-warn') : 'text-err'} />
          <span className="hidden sm:inline">{health ? `${health.device} · ${health.model_loaded ? 'model ready' : 'loading model'}` : 'API offline'}</span>
        </div>
        <a className="btn px-2" href="https://github.com/yats0x7/DepthWizard" target="_blank" rel="noreferrer" title="Source"><ExternalLink size={16} /></a>
        <button className="btn px-2" onClick={() => setRight((v) => !v)} title="Toggle tools panel"><PanelRight size={16} /></button>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className={clsx('w-80 shrink-0 border-r border-line bg-panel/60 p-3 overflow-hidden transition-all', !left && 'hidden')}><UploadPanel /></aside>
        <main className="flex-1 relative min-w-0">
          <Viewer />
          <div className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto"><HUD /></div>
          {error && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 panel border-err/60 px-3 py-2 text-xs text-err flex items-center gap-2 max-w-lg">
              <span className="truncate">{error}</span><button onClick={() => set({ error: null })}><X size={14} /></button>
            </div>
          )}
        </main>
        <aside className={clsx('w-80 shrink-0 border-l border-line bg-panel/60 p-3 overflow-hidden transition-all', !right && 'hidden')}><RightPanel /></aside>
      </div>
    </div>
  )
}
