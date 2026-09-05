import { Download, ExternalLink } from 'lucide-react'
import { useStore } from '../../store'
import { api, desktop } from '../../lib/api'
import { fmt, fmtInt, fmtSeconds } from '../../lib/format'
import { Button, Section, Stat } from '../ui'

function Histogram({ bins, counts, unit }: { bins: number[]; counts: number[]; unit: string }) {
  const max = Math.max(...counts, 1)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-16 items-end gap-px">
        {counts.map((c, i) => (
          <div key={i} className="flex-1 rounded-t-[1px] bg-accent/70" style={{ height: `${(c / max) * 100}%` }} title={`${fmt(bins[i], 1)} to ${fmt(bins[i + 1], 1)} ${unit}: ${fmtInt(c)} px`} />
        ))}
      </div>
      <div className="num flex justify-between text-[10px] text-ink-3">
        <span>{fmt(bins[0], unit ? 0 : 2)} {unit}</span>
        <span>{fmt(bins[bins.length - 1], unit ? 0 : 2)} {unit}</span>
      </div>
    </div>
  )
}

export function DataPanel() {
  const s = useStore()
  const m = s.meta
  if (!m || !s.jobId) return null
  const unit = m.units === 'm' ? 'm' : ''
  const files: [string, string, string][] = [
    ['dsm', m.files.dsm ? 'DSM GeoTIFF (Float32)' : 'Relative DSM GeoTIFF', m.files.dsm ?? m.files.rdsm],
    ['heightmap', '16-bit heightmap PNG', 'heightmap.png'],
    ['mesh', 'Textured mesh GLB', 'mesh.glb'],
    ['preview', 'Hillshade preview PNG', 'preview.png'],
    ['texture', 'Texture JPG', 'texture.jpg'],
    ['meta', 'Metadata JSON', 'meta.json'],
  ]
  if (m.files.dem) files.push(['dem', 'Coarse DEM used for calibration', 'dem.tif'])
  if (m.metrics) files.push(['metrics', 'Validation metrics JSON', 'metrics.json'])
  const save = (name: string) => {
    const url = api.fileUrl(s.jobId!, name)
    if (desktop) desktop.saveFile(url, `${m.input.name.replace(/\.[^.]+$/, '')}_${name}`)
    else window.open(url, '_blank')
  }
  return (
    <>
      <Section title="Input">
        <Stat label="File" value={m.input.name} />
        <Stat label="Working grid" value={`${m.input.shape[1]} × ${m.input.shape[0]} px`} />
        {m.input.downscale !== 1 && <Stat label="Source grid" value={`${m.input.source_shape[1]} × ${m.input.source_shape[0]} px (÷${fmt(m.input.downscale, 2)})`} />}
        <Stat label="Georeferenced" value={m.input.georeferenced ? `yes${m.input.epsg ? `, EPSG:${m.input.epsg}` : ''}` : 'no'} />
        {m.input.pixel_size_m && <Stat label="Ground sample distance" value={`${fmt(m.input.pixel_size_m[0], 2)} × ${fmt(m.input.pixel_size_m[1], 2)}`} unit="m" />}
        {m.input.centre4326 && <Stat label="Centre (lon, lat)" value={`${fmt(m.input.centre4326[0], 5)}, ${fmt(m.input.centre4326[1], 5)}`} />}
        {m.input.nodata_fraction > 0 && <Stat label="Nodata" value={fmt(m.input.nodata_fraction * 100, 1)} unit="%" />}
      </Section>
      <Section title="Model">
        <Stat label="Backbone" value={m.model.id.split('/').pop() ?? m.model.id} />
        <Stat label="Device" value={m.model.device.toUpperCase()} />
        <Stat label="Tile / input side" value={`${m.model.tile} / ${m.model.infer_res} px`} />
        <Stat label="Flip averaging" value={m.model.tta ? 'on' : 'off'} />
        <Stat label="Total time" value={fmtSeconds(m.seconds)} />
        <p className="num text-[11px] text-ink-3">{Object.entries(m.timings).filter(([k]) => k !== 'total').map(([k, v]) => `${k} ${fmtSeconds(v)}`).join(' · ')}</p>
      </Section>
      <Section title="Calibration">
        <Stat label="Mode" value={m.calibration.mode} tone="accent" />
        <Stat label="Units" value={m.units === 'm' ? 'metres' : 'relative (0 to 1)'} />
        {m.calibration.dem?.source && <Stat label="Terrain source" value={`${m.calibration.dem.source}${m.calibration.dem.native_res_m ? ` · ${fmt(m.calibration.dem.native_res_m, 0)} m` : ''}${m.calibration.dem.cached ? ' · cached' : ''}`} />}
        {m.calibration.dem?.error && <p className="text-[11px] text-danger">Terrain fetch failed: {m.calibration.dem.error}</p>}
        {m.calibration.r2 !== null && <Stat label="Terrain fit r²" value={fmt(m.calibration.r2, 3)} />}
        <Stat label="Structural scale" value={fmt(m.calibration.scale, 3)} />
        {m.calibration.gcp_count > 0 && <Stat label="GCPs / RMSE" value={`${m.calibration.gcp_count} / ${fmt(m.calibration.gcp_rmse, 2)} m`} />}
        <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-ink-3">
          {m.calibration.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </Section>
      <Section title="Surface statistics">
        <Histogram bins={m.stats.histogram.bins} counts={m.stats.histogram.counts} unit={unit} />
        <Stat label="Range" value={`${fmt(m.stats.min, unit ? 1 : 3)} to ${fmt(m.stats.max, unit ? 1 : 3)}`} unit={unit} />
        <Stat label="Relief (p2 to p98)" value={fmt(m.stats.relief, unit ? 1 : 3)} unit={unit} />
        <Stat label="Median" value={fmt(m.stats.median, unit ? 1 : 3)} unit={unit} />
        {m.stats.slope_mean_deg !== undefined && <Stat label="Mean slope / p90" value={`${fmt(m.stats.slope_mean_deg, 1)}° / ${fmt(m.stats.slope_p90_deg, 1)}°`} />}
        {m.stats.steep_fraction !== undefined && <Stat label="Steeper than 30°" value={fmt(m.stats.steep_fraction * 100, 1)} unit="%" />}
        <Stat label="Valid pixels" value={fmt(m.stats.valid_fraction * 100, 1)} unit="%" />
        <Stat label="Mesh in GLB" value={`${fmtInt(m.mesh.vertices)} vertices`} />
      </Section>
      <Section title="Export">
        <ul className="flex flex-col gap-1">
          {files.map(([k, label, name]) => (
            <li key={k}>
              <Button variant="ghost" size="sm" className="w-full justify-between px-2" onClick={() => save(name)}>
                <span>{label}</span>
                {desktop ? <Download size={13} className="text-ink-3" /> : <ExternalLink size={13} className="text-ink-3" />}
              </Button>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
