import clsx from 'clsx'
import { Crosshair, MapPin, Mountain, Orbit, Plane, Ruler } from 'lucide-react'
import { fmt } from '../lib/terrain'
import { useStore, type Tool } from '../store'

/** Overlay on the 3D view: hover readout, control mode and quick tools. */
export function HUD() {
  const { hover, meta, controls, tool, set, heightField, flyLocked } = useStore()
  if (!meta || !heightField) return null
  const unit = meta.units === 'm' ? 'm' : ''
  const tools: { id: Tool; icon: React.ReactNode; name: string }[] = [
    { id: 'probe', icon: <Crosshair size={14} />, name: 'Probe' }, { id: 'profile', icon: <Ruler size={14} />, name: 'Profile' }, { id: 'gcp', icon: <MapPin size={14} />, name: 'GCP' },
  ]
  return (
    <>
      <div className="absolute top-3 left-3 flex gap-1 pointer-events-auto">
        <button className={clsx('btn text-xs', controls === 'orbit' && 'btn-active')} onClick={() => set({ controls: 'orbit' })}><Orbit size={14} /> Orbit</button>
        <button className={clsx('btn text-xs', controls === 'fly' && 'btn-active')} onClick={() => set({ controls: 'fly' })}><Plane size={14} /> Fly</button>
        <span className="w-2" />
        {tools.map((t) => <button key={t.id} className={clsx('btn text-xs', tool === t.id && 'btn-active')} onClick={() => set({ tool: t.id })}>{t.icon}{t.name}</button>)}
      </div>
      <div className={clsx('absolute bottom-3 left-3 panel px-3 py-2 text-xs font-mono transition-opacity', hover ? 'opacity-100' : 'opacity-40')}>
        <div className="flex items-center gap-2 text-muted"><Mountain size={13} className="text-accent" /> {meta.units === 'm' ? 'Elevation' : 'Relative height'}</div>
        {hover ? (
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3">
            <span className="text-muted">h</span><span className="text-accent">{fmt(hover.height, meta.units === 'm' ? 1 : 3)} {unit}</span>
            <span className="text-muted">slope</span><span>{fmt(hover.slope, 1)}°</span>
            <span className="text-muted">pixel</span><span>{fmt(hover.col * (meta.input.shape[1] / heightField.width), 0)}, {fmt(hover.row * (meta.input.shape[0] / heightField.height), 0)}</span>
            {hover.map && <><span className="text-muted">map</span><span>{fmt(hover.map[0], 2)}, {fmt(hover.map[1], 2)}</span></>}
          </div>
        ) : <div className="mt-1 text-muted">hover the terrain</div>}
      </div>
      {!flyLocked && (
        <div className="absolute bottom-3 right-3 text-[11px] text-muted">
          {controls === 'orbit' ? <><span className="kbd">drag</span> orbit · <span className="kbd">right-drag</span> pan · <span className="kbd">wheel</span> zoom</> : <><span className="kbd">click</span> to fly</>}
        </div>
      )}
    </>
  )
}
