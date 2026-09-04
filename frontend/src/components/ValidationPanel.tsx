import { useRef, useState } from 'react'
import { FileCheck2, Loader2 } from 'lucide-react'
import { api, type Stats } from '../lib/api'
import { useStore } from '../store'
import { fmt } from '../lib/terrain'

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2 text-xs py-0.5 border-b border-line/60"><span className="text-muted">{k}</span><span className="font-mono">{v}</span></div>
}

function StatsTable({ s, unit }: { s: Stats; unit: string }) {
  return (
    <div>
      <Row k="RMSE" v={`${fmt(s.rmse, 2)} ${unit}`} />
      <Row k="MAE" v={`${fmt(s.mae, 2)} ${unit}`} />
      <Row k="Bias" v={`${fmt(s.bias, 2)} ${unit}`} />
      <Row k="NMAD" v={`${fmt(s.nmad, 2)} ${unit}`} />
      <Row k="Pearson r" v={fmt(s.pearson_r, 3)} />
      <Row k="|err| p90" v={`${fmt(s.abs_error_p90, 2)} ${unit}`} />
      <Row k="within 1 m / 3 m" v={`${fmt(s.within_1m * 100, 0)}% / ${fmt(s.within_3m * 100, 0)}%`} />
      <Row k="pixels" v={s.n.toLocaleString()} />
    </div>
  )
}

export function ValidationPanel() {
  const { job, meta, metrics, set, version } = useStore()
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const m = metrics ?? meta?.metrics ?? null
  const unit = meta?.units === 'm' ? 'm' : 'u'

  const run = async (f: File) => {
    if (!job) return
    setBusy(true)
    try { set({ metrics: await api.validate(job.id, f), error: null }) } catch (e) { set({ error: (e as Error).message }) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted">Upload a reference DSM / LiDAR raster (GeoTIFF). It is reprojected onto the prediction grid and compared pixel by pixel.</div>
      <button className="btn btn-primary" disabled={!job || busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" size={15} /> : <FileCheck2 size={15} />} Validate against reference
      </button>
      <input ref={input} type="file" hidden accept=".tif,.tiff" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = '' }} />
      {m && 'error' in m && m.error && <div className="text-xs text-err">{m.error}</div>}
      {m && m.raw && (
        <>
          <div>
            <div className="label mb-1">Raw ({meta?.units === 'm' ? 'metric' : 'relative units'})</div>
            <StatsTable s={m.raw} unit={unit} />
          </div>
          <div>
            <div className="label mb-1">Scale/offset aligned <span className="normal-case font-normal">(z = {fmt(m.aligned.scale, 3)}·h + {fmt(m.aligned.offset, 2)})</span></div>
            <StatsTable s={m.aligned} unit={unit} />
          </div>
          {m.per_class && Object.entries(m.per_class).map(([k, s]) => (
            <div key={k}><div className="label mb-1">{k}</div><StatsTable s={s} unit={unit} /></div>
          ))}
          {m.error_map && job && (
            <div>
              <div className="label mb-1">Error map (blue low · red high)</div>
              <img src={api.fileUrl(job.id, 'error_map.png', version + 1)} alt="error map" className="rounded-lg border border-line w-full" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
