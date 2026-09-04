import { useState } from 'react'
import clsx from 'clsx'
import { Crosshair, Download, Layers, MapPin, Ruler, ShieldCheck, Info, Loader2, Trash2, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { fmt } from '../lib/terrain'
import { useStore, type Layer, type Tool } from '../store'
import { ProfileChart } from './ProfileChart'
import { ValidationPanel } from './ValidationPanel'

type Tab = 'layers' | 'analyze' | 'validate' | 'info'

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs mb-1"><span className="label">{label}</span><span className="font-mono text-muted">{format ? format(value) : value}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function LayersTab() {
  const s = useStore()
  const unit = s.meta?.units === 'm' ? 'm' : ''
  const hf = s.heightField
  const layers: { id: Layer; name: string }[] = [
    { id: 'texture', name: 'Image' }, { id: 'hypsometric', name: 'Elevation' }, { id: 'slope', name: 'Slope' }, { id: 'aspect', name: 'Aspect' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label mb-1.5">Surface</div>
        <div className="grid grid-cols-4 gap-1">
          {layers.map((l) => <button key={l.id} className={clsx('btn justify-center text-xs px-1', s.layer === l.id && 'btn-active')} onClick={() => s.set({ layer: l.id })}>{l.name}</button>)}
        </div>
        <div className="flex gap-2 mt-2">
          <button className={clsx('btn text-xs', s.wireframe && 'btn-active')} onClick={() => s.set({ wireframe: !s.wireframe })}>Wireframe</button>
          <button className={clsx('btn text-xs', s.contours && 'btn-active')} onClick={() => s.set({ contours: !s.contours })}>Contours</button>
        </div>
      </div>
      <Slider label="Vertical exaggeration" value={s.exaggeration} min={0.25} max={6} step={0.05} onChange={(v) => s.set({ exaggeration: v })} format={(v) => `${v.toFixed(2)}×`} />
      <Slider label="Mesh detail (max error)" value={s.maxError} min={0.1} max={10} step={0.1} onChange={(v) => s.set({ maxError: v })} format={(v) => `${v.toFixed(1)} ${unit}`} />
      <Slider label="Sun azimuth" value={s.sun} min={0} max={360} step={1} onChange={(v) => s.set({ sun: v })} format={(v) => `${v}°`} />
      {hf && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="label">Flood level</span>
            <button className={clsx('btn text-xs py-0.5', s.flood !== null && 'btn-active')} onClick={() => s.set({ flood: s.flood === null ? hf.min + (hf.max - hf.min) * 0.2 : null })}>{s.flood === null ? 'Off' : 'On'}</button>
          </div>
          {s.flood !== null && <Slider label="Water surface" value={s.flood} min={hf.min} max={hf.max} step={(hf.max - hf.min) / 400} onChange={(v) => s.set({ flood: v })} format={(v) => `${fmt(v, 1)} ${unit}`} />}
          {s.flood !== null && <div className="text-[11px] text-muted mt-1">Terrain below the water surface is tinted blue. Useful for inundation what-if scenarios.</div>}
        </div>
      )}
    </div>
  )
}

function AnalyzeTab() {
  const s = useStore()
  const [z, setZ] = useState('')
  const [busy, setBusy] = useState(false)
  const unit = s.meta?.units === 'm' ? 'm' : ''
  const tools: { id: Tool; name: string; icon: React.ReactNode; hint: string }[] = [
    { id: 'probe', name: 'Probe', icon: <Crosshair size={14} />, hint: 'Click to pin heights' },
    { id: 'profile', name: 'Profile', icon: <Ruler size={14} />, hint: 'Click two points' },
    { id: 'gcp', name: 'GCP', icon: <MapPin size={14} />, hint: 'Click, then enter known height' },
  ]

  const addGcp = () => {
    const p = s.pendingGcp
    const zz = Number(z)
    if (!p || !Number.isFinite(zz)) return
    const [wh, ww] = s.meta!.input.shape
    const hf = s.heightField!
    s.set({ gcps: [...s.gcps, { row: p.row * (wh / hf.height), col: p.col * (ww / hf.width), z: zz }], pendingGcp: null })
    setZ('')
  }

  const recalibrate = async (mode?: string) => {
    if (!s.job) return
    setBusy(true)
    try {
      const meta = await api.recalibrate(s.job.id, { calibration: mode ?? null, gcps: s.gcps })
      s.set({ meta, version: s.version + 1, metrics: null, pins: [], profile: { a: null, b: null, points: [] }, error: null })
    } catch (e) { s.set({ error: (e as Error).message }) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label mb-1.5">Tool</div>
        <div className="grid grid-cols-3 gap-1">
          {tools.map((t) => <button key={t.id} title={t.hint} className={clsx('btn justify-center text-xs', s.tool === t.id && 'btn-active')} onClick={() => s.set({ tool: t.id })}>{t.icon}{t.name}</button>)}
        </div>
        <div className="text-[11px] text-muted mt-1">{tools.find((t) => t.id === s.tool)?.hint}</div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1"><span className="label">Pinned heights</span>{s.pins.length > 0 && <button className="text-muted hover:text-err" onClick={() => s.set({ pins: [] })}><Trash2 size={13} /></button>}</div>
        {s.pins.length === 0 ? <div className="text-xs text-muted">No pins. Use the Probe tool and click the terrain.</div> : (
          <div className="max-h-36 overflow-y-auto">
            {s.pins.map((p, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5 border-b border-line/60 font-mono">
                <span className="text-muted">#{i + 1} {p.map ? `${fmt(p.map[0], 1)}, ${fmt(p.map[1], 1)}` : `${fmt(p.col, 0)}, ${fmt(p.row, 0)} px`}</span>
                <span>{fmt(p.height)} {unit} · {fmt(p.slope, 0)}°</span>
              </div>
            ))}
            {s.pins.length >= 2 && <div className="text-xs mt-1 text-accent">Δ last two: {fmt(Math.abs(s.pins[s.pins.length - 1].height - s.pins[s.pins.length - 2].height))} {unit}</div>}
          </div>
        )}
      </div>

      <div><div className="label mb-1">Cross-section</div><ProfileChart /></div>

      <div>
        <div className="label mb-1">Ground control points</div>
        <div className="text-[11px] text-muted mb-2">Known elevations refit the DSM scale and offset. One point fixes the offset, two or more fix the scale as well. Works on PNG/JPG inputs too.</div>
        {s.pendingGcp && (
          <div className="panel p-2 flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-muted">px {fmt(s.pendingGcp.col, 0)},{fmt(s.pendingGcp.row, 0)}</span>
            <input type="number" placeholder="height (m)" className="w-24 text-xs" value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGcp()} />
            <button className="btn btn-primary text-xs" onClick={addGcp}>Add</button>
            <button className="text-muted hover:text-err" onClick={() => s.set({ pendingGcp: null })}><Trash2 size={13} /></button>
          </div>
        )}
        {s.gcps.map((g, i) => (
          <div key={i} className="flex justify-between text-xs py-0.5 border-b border-line/60 font-mono">
            <span className="text-muted">px {fmt(g.col, 0)},{fmt(g.row, 0)}</span><span>{g.z} m <button className="text-muted hover:text-err ml-1" onClick={() => s.set({ gcps: s.gcps.filter((_, j) => j !== i) })}>×</button></span>
          </div>
        ))}
        <div className="flex gap-2 mt-2 flex-wrap">
          <button className="btn btn-primary text-xs" disabled={busy || s.gcps.length === 0} onClick={() => recalibrate()}>{busy ? <Loader2 className="animate-spin" size={13} /> : <RotateCcw size={13} />} Apply GCPs</button>
          {s.meta?.input.georeferenced && ['hybrid', 'affine', 'prior'].map((m) => (
            <button key={m} className="btn text-xs" disabled={busy} onClick={() => recalibrate(m)}>{m}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

function InfoTab() {
  const { meta, job, version } = useStore()
  if (!meta || !job) return <div className="text-xs text-muted">No job loaded.</div>
  const c = meta.calibration
  const unit = meta.units === 'm' ? 'm' : ''
  const files = [['DSM GeoTIFF', meta.files.dsm ?? meta.files.rdsm], ['Heightmap PNG (16-bit)', 'heightmap.png'], ['3D model (GLB)', 'mesh.glb'], ['Preview', 'preview.png'], ['Metadata JSON', 'meta.json']] as const
  const row = (k: string, v: string | number | null | undefined) => <div className="flex justify-between gap-2 text-xs py-0.5 border-b border-line/60"><span className="text-muted">{k}</span><span className="font-mono text-right">{v ?? '—'}</span></div>
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label mb-1">Input</div>
        {row('File', meta.input.name)}
        {row('Size', `${meta.input.shape[1]} × ${meta.input.shape[0]} px${meta.input.downscale > 1 ? ` (÷${meta.input.downscale.toFixed(2)})` : ''}`)}
        {row('Georeferenced', meta.input.georeferenced ? `yes · EPSG:${meta.input.epsg ?? '?'}` : 'no')}
        {meta.input.pixel_size_m && row('GSD', `${fmt(meta.input.pixel_size_m[0], 2)} m`)}
        {meta.input.bounds4326 && row('Centre', `${fmt((meta.input.bounds4326[1] + meta.input.bounds4326[3]) / 2, 5)}, ${fmt((meta.input.bounds4326[0] + meta.input.bounds4326[2]) / 2, 5)}`)}
      </div>
      <div>
        <div className="label mb-1">Model</div>
        {row('Backbone', meta.model.name)}
        {row('Device', meta.model.device)}
        {row('Inference', `${meta.model.seconds}s · total ${meta.seconds}s`)}
      </div>
      <div>
        <div className="label mb-1">Calibration</div>
        {row('Mode', c.mode + (c.used_prior ? ' (prior)' : ''))}
        {row('Scale / offset', `${fmt(c.scale, 3)} / ${fmt(c.offset, 2)}`)}
        {c.r2 !== null && row('Terrain fit R²', fmt(c.r2, 3))}
        {row('DEM', (c.dem?.source as string) ?? '—')}
        {c.gcp_count > 0 && row('GCPs', c.gcp_count)}
        {c.notes.map((n, i) => <div key={i} className="text-[11px] text-muted mt-1">· {n}</div>)}
      </div>
      <div>
        <div className="label mb-1">Height statistics</div>
        {row('Min / max', `${fmt(meta.stats.min)} / ${fmt(meta.stats.max)} ${unit}`)}
        {row('Mean', `${fmt(meta.stats.mean)} ${unit}`)}
        {row('p2 / p98', `${fmt(meta.stats.p2)} / ${fmt(meta.stats.p98)} ${unit}`)}
        {row('Mesh', `${meta.mesh.vertices.toLocaleString()} verts · ${meta.mesh.faces.toLocaleString()} faces`)}
      </div>
      <div>
        <div className="label mb-1">Downloads</div>
        <div className="flex flex-col gap-1">
          {files.map(([name, f]) => <a key={f} className="btn text-xs justify-between" href={api.fileUrl(job.id, f, version)} download><span>{name}</span><Download size={13} /></a>)}
        </div>
      </div>
    </div>
  )
}

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('layers')
  const tabs: { id: Tab; icon: React.ReactNode; name: string }[] = [
    { id: 'layers', icon: <Layers size={15} />, name: 'View' }, { id: 'analyze', icon: <Crosshair size={15} />, name: 'Analyze' },
    { id: 'validate', icon: <ShieldCheck size={15} />, name: 'Validate' }, { id: 'info', icon: <Info size={15} />, name: 'Info' },
  ]
  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-4 gap-1 mb-3">
        {tabs.map((t) => <button key={t.id} className={clsx('btn justify-center text-xs px-1', tab === t.id && 'btn-active')} onClick={() => setTab(t.id)}>{t.icon}{t.name}</button>)}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {tab === 'layers' && <LayersTab />}
        {tab === 'analyze' && <AnalyzeTab />}
        {tab === 'validate' && <ValidationPanel />}
        {tab === 'info' && <InfoTab />}
      </div>
    </div>
  )
}
