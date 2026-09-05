import { useState } from 'react'
import { Crosshair, MapPin, Spline, Trash2, Waves } from 'lucide-react'
import { useStore, type Tool } from '../../store'
import { api } from '../../lib/api'
import { compass, fmt } from '../../lib/format'
import { pixelToMap } from '../../lib/terrain'
import { Button, Field, Input, Section, Segmented, Select, Slider, Stat, Switch } from '../ui'
import { ProfileChart } from './ProfileChart'

export function AnalysePanel() {
  const s = useStore()
  const hf = s.heightField
  const meta = s.meta
  const [gcpZ, setGcpZ] = useState('')
  const [calMode, setCalMode] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (!hf || !meta || !s.jobId) return null
  const unit = hf.units === 'm' ? 'm' : ''
  const p = s.probe
  const map = p ? pixelToMap(hf, p.col, p.row) : null
  const relief = hf.hMax - hf.hMin
  const stepProfile = s.profile.samples.length ? s.profile.samples[s.profile.samples.length - 1].t : 0

  const recalibrate = async (body: { mode?: string | null; gcps?: { row: number; col: number; z: number }[] }) => {
    setBusy(true)
    setMsg(null)
    try {
      const m = await api.recalibrate(s.jobId!, body)
      setMsg(m.calibration.notes[m.calibration.notes.length - 1] ?? 'recalibrated')
      await s.reloadJob()
      await s.refreshJobs()
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Section title="Tool">
        <Segmented<Tool>
          id="tool"
          size="sm"
          value={s.tool}
          onChange={(v) => s.set('tool', v)}
          options={[
            { value: 'probe', label: (<><Crosshair size={13} /> Probe</>), title: 'Click to read a height; Shift-click pins it' },
            { value: 'profile', label: (<><Spline size={13} /> Profile</>), title: 'Click two points for a cross-section' },
            { value: 'gcp', label: (<><MapPin size={13} /> GCP</>), title: 'Click a point of known height' },
          ]}
        />
        <p className="text-[11px] text-ink-3">{s.nav === 'orbit' ? 'Click the surface in Orbit mode. In Fly and Walk the crosshair reads continuously.' : 'Switch to Orbit (1) to click points.'}</p>
      </Section>

      <Section title="Reading" right={p && <Button size="sm" variant="ghost" onClick={() => s.setProbe(null)}>Clear</Button>}>
        {p ? (
          <div className="flex flex-col">
            <div className="num pb-1 text-[26px] leading-none text-ink">
              {fmt(p.h, hf.units === 'm' ? 2 : 3)}
              <span className="ml-1 text-[13px] text-ink-3">{unit || 'relative'}</span>
            </div>
            <p className="pb-2 text-[11px] leading-relaxed text-ink-3">
              Source: {meta.units === 'm' ? `metric DSM, ${meta.calibration.mode} calibration${meta.calibration.dem?.source ? ` against ${meta.calibration.dem.source}` : ''}${meta.calibration.gcp_count ? `, ${meta.calibration.gcp_count} GCP` : ''}` : 'relative DSM in [0, 1]; no absolute scale. Add GCPs for metres.'}
            </p>
            <Stat label="Above scene minimum" value={fmt(p.h - hf.hMin, hf.units === 'm' ? 2 : 3)} unit={unit} />
            {meta.input.georeferenced ? (
              <>
                <Stat label="Slope" value={fmt(p.slope, 1)} unit="°" />
                <Stat label="Aspect (downslope)" value={`${fmt(p.aspect, 0)}° ${compass(p.aspect)}`} />
              </>
            ) : (
              <p className="py-1 text-[11px] text-ink-3">Slope needs a ground sample distance; this image has no georeferencing.</p>
            )}
            <Stat label="Pixel" value={`${Math.round(p.col)}, ${Math.round(p.row)}`} />
            {map && <Stat label={`Map${hf.epsg ? ` EPSG:${hf.epsg}` : ''}`} value={`${fmt(map[0], 1)}, ${fmt(map[1], 1)}`} />}
            <Button size="sm" className="mt-2 self-start" onClick={() => s.addPin(p)}>
              Pin this reading
            </Button>
          </div>
        ) : (
          <p className="text-[12px] text-ink-3">Click the surface to read a height. Every value is sampled from the DSM array, not from the rendered mesh.</p>
        )}
        {s.pins.length > 0 && (
          <ul className="flex flex-col divide-y divide-line border-t border-line pt-1">
            {s.pins.map((pin) => (
              <li key={pin.id} className="flex items-center justify-between py-1.5 text-[12px]">
                <span className="num text-ink">
                  {fmt(pin.h, hf.units === 'm' ? 2 : 3)} {unit}
                </span>
                <span className="num text-ink-3">px {Math.round(pin.col)}, {Math.round(pin.row)}</span>
                <button onClick={() => s.removePin(pin.id)} className="text-ink-3 hover:text-danger" aria-label="Remove pin">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {s.pins.length >= 2 && (
              <li className="num pt-1.5 text-[11px] text-ink-3">
                Δ last two: {fmt(Math.abs(s.pins[s.pins.length - 1].h - s.pins[s.pins.length - 2].h), 2)} {unit}
              </li>
            )}
          </ul>
        )}
      </Section>

      <Section title="Cross-section" right={s.profile.a && <Button size="sm" variant="ghost" onClick={s.clearProfile}>Clear</Button>}>
        {s.profile.samples.length ? (
          <>
            <ProfileChart samples={s.profile.samples} unit={hf.units === 'm' ? 'm' : ''} />
            <p className="num text-[11px] text-ink-3">
              {fmt(stepProfile, 1)} {hf.units === 'm' ? 'm' : 'px'} long · rise {fmt(Math.max(...s.profile.samples.map((q) => q.h).filter(Number.isFinite)) - Math.min(...s.profile.samples.map((q) => q.h).filter(Number.isFinite)), 2)} {unit}
            </p>
          </>
        ) : (
          <p className="text-[12px] text-ink-3">{s.tool === 'profile' ? (s.profile.a ? 'Click the second point.' : 'Click the first point on the surface.') : 'Choose the Profile tool and click two points.'}</p>
        )}
      </Section>

      <Section title="Flood level" right={<Waves size={14} className="text-accent" />}>
        <Switch label="Show water plane" checked={s.flood.on} onChange={(v) => s.set('flood', { ...s.flood, on: v })} />
        <Slider value={s.flood.level} min={hf.hMin} max={hf.hMax} step={relief / 400} disabled={!s.flood.on} onChange={(v) => s.set('flood', { ...s.flood, level: v })} format={(v) => `${fmt(v, hf.units === 'm' ? 1 : 3)}${unit}`} />
        <p className="num text-[11px] text-ink-3">{fmt(floodFraction(hf, s.flood.level) * 100, 1)}% of valid pixels below this level (sampled)</p>
      </Section>

      <Section title="Ground control points">
        {s.pendingGcp ? (
          <div className="flex flex-col gap-2 rounded-lg border border-warm/40 bg-warm/5 p-2.5">
            <span className="text-[12px] text-ink-2">Known height at px {Math.round(s.pendingGcp.col)}, {Math.round(s.pendingGcp.row)}</span>
            <div className="flex gap-2">
              <Input type="number" step="0.01" placeholder="height in metres" value={gcpZ} onChange={(e) => setGcpZ(e.target.value)} autoFocus />
              <Button
                variant="primary"
                size="md"
                disabled={!gcpZ}
                onClick={() => {
                  s.addGcp({ row: s.pendingGcp!.row, col: s.pendingGcp!.col, z: Number(gcpZ), wx: s.pendingGcp!.x, wz: s.pendingGcp!.z })
                  setGcpZ('')
                }}
              >
                Add
              </Button>
              <Button size="md" variant="ghost" onClick={() => s.set('pendingGcp', null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-ink-3">One point fixes the offset, two or more fix scale and offset. Works on PNG and JPG inputs too.</p>
        )}
        {s.gcps.length > 0 && (
          <ul className="flex flex-col divide-y divide-line">
            {s.gcps.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-1.5 text-[12px]">
                <span className="num text-warm">{fmt(g.z, 2)} m</span>
                <span className="num text-ink-3">px {Math.round(g.col)}, {Math.round(g.row)}</span>
                <button onClick={() => s.removeGcp(g.id)} className="text-ink-3 hover:text-danger" aria-label="Remove GCP">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="primary" disabled={busy || !s.gcps.length} onClick={() => recalibrate({ gcps: s.gcps.map((g) => ({ row: g.row, col: g.col, z: g.z })) })}>
          {busy ? 'Recalibrating' : `Recalibrate with ${s.gcps.length} GCP${s.gcps.length === 1 ? '' : 's'}`}
        </Button>
        {meta.input.georeferenced && (
          <Field label="Calibration mode">
            <div className="flex gap-2">
              <Select value={calMode || meta.calibration.mode} onChange={(e) => setCalMode(e.target.value)}>
                <option value="hybrid">Hybrid (DEM + structure)</option>
                <option value="affine">Affine fit to DEM</option>
                <option value="prior">Scene prior only</option>
              </Select>
              <Button disabled={busy || !calMode} onClick={() => recalibrate({ mode: calMode })}>
                Apply
              </Button>
            </div>
          </Field>
        )}
        {msg && <p className="text-[11px] text-ink-2">{msg}</p>}
      </Section>
    </>
  )
}

function floodFraction(hf: { data: Float32Array }, level: number): number {
  let n = 0
  let below = 0
  const step = Math.max(1, Math.floor(hf.data.length / 200000))
  for (let i = 0; i < hf.data.length; i += step) {
    const v = hf.data[i]
    if (Number.isFinite(v)) {
      n++
      if (v < level) below++
    }
  }
  return n ? below / n : 0
}
