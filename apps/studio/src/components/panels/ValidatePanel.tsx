import { useRef, useState } from 'react'
import { FileCheck2 } from 'lucide-react'
import { useStore } from '../../store'
import { api, type MetricBlock } from '../../lib/api'
import { fmt, fmtInt } from '../../lib/format'
import { Button, Input, Section, Stat } from '../ui'

function Block({ title, m, unit, note }: { title: string; m: MetricBlock; unit: string; note?: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-panel-2/60 px-3 py-2">
      <div className="flex items-baseline justify-between pb-1">
        <span className="font-display text-[13px] font-semibold">{title}</span>
        {note && <span className="text-[11px] text-ink-3">{note}</span>}
      </div>
      <Stat label="RMSE" value={fmt(m.rmse, 2)} unit={unit} tone="warm" />
      <Stat label="MAE" value={fmt(m.mae, 2)} unit={unit} tone="warm" />
      <Stat label="Pearson r" value={fmt(m.pearson_r, 3)} tone="warm" />
      <Stat label="Bias (mean error)" value={fmt(m.bias, 2)} unit={unit} />
      <Stat label="NMAD" value={fmt(m.nmad, 2)} unit={unit} />
      <Stat label="|error| p90" value={fmt(m.abs_error_p90, 2)} unit={unit} />
      <Stat label="Within 1 m / 3 m" value={`${fmt(m.within_1m * 100, 0)}% / ${fmt(m.within_3m * 100, 0)}%`} />
      <Stat label="Pixels compared" value={fmtInt(m.n)} />
      {m.scale !== undefined && <Stat label="Fitted scale / offset" value={`${fmt(m.scale, 3)} / ${fmt(m.offset, 2)}`} />}
    </div>
  )
}

export function ValidatePanel() {
  const s = useStore()
  const input = useRef<HTMLInputElement>(null)
  const maskInput = useRef<HTMLInputElement>(null)
  const [mask, setMask] = useState<File | null>(null)
  const [names, setNames] = useState('1=urban, 2=sparse, 3=hilly, 4=forest')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!s.jobId || !s.meta) return null
  const m = s.metrics
  const unit = s.meta.units === 'm' ? 'm' : ''
  const run = async (file: File) => {
    setBusy(true)
    setErr(null)
    try {
      const classNames: Record<string, string> = {}
      for (const part of names.split(',')) {
        const [k, v] = part.split('=').map((x) => x.trim())
        if (k && v) classNames[k] = v
      }
      const r = await api.validate(s.jobId!, file, mask, classNames)
      s.set('metrics', r)
      s.set('version', s.version + 1)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Section title="Reference data">
        <p className="text-[12px] leading-relaxed text-ink-3">Drop a reference DSM, DTM or LiDAR raster. A georeferenced GeoTIFF is reprojected onto the job grid; an ungeoreferenced raster is resized to it.</p>
        <input ref={input} type="file" accept=".tif,.tiff,.geotiff,.img,.png" className="hidden" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
        <input ref={maskInput} type="file" accept=".tif,.tiff,.geotiff,.img,.png" className="hidden" onChange={(e) => setMask(e.target.files?.[0] ?? null)} />
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel-2/60 p-2.5">
          <span className="label">Landscape classes (optional)</span>
          <p className="text-[11px] text-ink-3">A raster of integer codes on any grid gives per-landscape metrics (urban, sparse, hilly, forested).</p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => maskInput.current?.click()}>{mask ? mask.name : 'Choose class raster'}</Button>
            {mask && (
              <Button size="sm" variant="ghost" onClick={() => setMask(null)}>
                Remove
              </Button>
            )}
          </div>
          <Input value={names} onChange={(e) => setNames(e.target.value)} placeholder="1=urban, 2=forest" disabled={!mask} />
        </div>
        <Button variant="primary" disabled={busy} onClick={() => input.current?.click()}>
          <FileCheck2 size={15} /> {busy ? 'Comparing' : 'Choose reference raster'}
        </Button>
        {err && <p className="text-[12px] text-danger">{err}</p>}
      </Section>
      {m && !m.error && m.raw && m.aligned && (
        <Section title={`Against ${m.reference ?? 'reference'}`}>
          <Block title="Raw" m={m.raw} unit={unit} note={s.meta.units === 'm' ? 'absolute heights' : 'unitless vs metres'} />
          <Block title="Scale + offset aligned" m={m.aligned} unit="m" note="shape only" />
          {m.per_class && (
            <div className="flex flex-col gap-2">
              {Object.entries(m.per_class).map(([k, v]) => (
                <Block key={k} title={k} m={v} unit="m" />
              ))}
            </div>
          )}
          {m.error_map && (
            <figure className="flex flex-col gap-1.5">
              <img src={api.fileUrl(s.jobId, 'error_map.png') + `?v=${s.version}`} alt="Signed error map" className="rounded-lg border border-line" />
              <figcaption className="text-[11px] text-ink-3">Signed error, blue below reference to red above, clipped at ±{fmt(m.error_map_clip_m, 1)} m.</figcaption>
            </figure>
          )}
        </Section>
      )}
      {m?.error && <p className="px-4 py-3 text-[12px] text-danger">{m.error}</p>}
    </>
  )
}
