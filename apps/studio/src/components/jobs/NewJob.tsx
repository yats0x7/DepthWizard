import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, FolderOpen, Loader2, MountainSnow, Satellite, ImageIcon, UploadCloud } from 'lucide-react'
import { api, desktop, type RunOptions } from '../../lib/api'
import { useStore } from '../../store'
import { Field, Input, Progress, Select } from '../ui'
import { cn } from '../../lib/cn'

const ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.geotiff,.jp2,.img'

/** Every entry point shares one set of run options; keeping them local silently lost the choices. */
export function useRunOptions() {
  const opts = useStore((s) => s.runOptions)
  const set = useStore((s) => s.set)
  return [opts, (next: RunOptions) => set('runOptions', next)] as const
}

/**
 * Advanced only. The defaults are correct for almost every scene, so these stay folded away: four
 * expert decisions in front of the Run button was the single biggest barrier in the old build.
 */
export function RunSettings() {
  const system = useStore((s) => s.system)
  const open = useStore((s) => s.showAdvanced)
  const set = useStore((s) => s.set)
  const [opts, setOpts] = useRunOptions()
  return (
    <div className="flex flex-col gap-3">
      <button onClick={() => set('showAdvanced', !open)} className="flex items-center gap-1.5 self-start text-[13px] text-ink-3 hover:text-ink">
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        Settings
        <span className="text-ink-3">· defaults work for most scenes</span>
      </button>
      {open && (
        <div className="rise grid grid-cols-2 gap-3.5">
          <Field label="Detail vs speed" hint="larger is slower">
            <Select value={opts.model ?? 'small'} onChange={(e) => setOpts({ ...opts, model: e.target.value })}>
              {Object.entries(system?.models ?? { small: { label: 'Fast', params: '25M' } }).map(([k, m]) => (
                <option key={k} value={k}>{m.label} · {m.params}</option>
              ))}
            </Select>
          </Field>
          <Field label="How heights get their scale">
            <Select value={opts.calibration ?? 'hybrid'} onChange={(e) => setOpts({ ...opts, calibration: e.target.value })}>
              <option value="hybrid">From an elevation map (best)</option>
              <option value="affine">Fit directly to the elevation map</option>
              <option value="prior">Estimate from the scene alone</option>
              <option value="semantic">Elevation map, flat surfaces pinned</option>
            </Select>
          </Field>
          <Field label="Elevation map to use">
            <Select value={opts.dem_source ?? 'terrarium'} onChange={(e) => setOpts({ ...opts, dem_source: e.target.value })}>
              {Object.entries(system?.dem_sources ?? { terrarium: { label: 'AWS Terrain Tiles' } }).map(([k, d]) => (
                <option key={k} value={k}>{d.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Typical tall thing" hint="metres">
            <Input type="number" min={1} max={500} step={1} value={opts.prior_p95_m ?? 20}
                   onChange={(e) => setOpts({ ...opts, prior_p95_m: Number(e.target.value) })} />
          </Field>
        </div>
      )}
    </div>
  )
}

export function Dropzone({ compact = false, className }: { compact?: boolean; className?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState<{ name: string; frac: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [opts] = useRunOptions()
  const refreshJobs = useStore((s) => s.refreshJobs)
  const openJob = useStore((s) => s.openJob)

  const submit = useCallback(
    async (file: File) => {
      setErr(null)
      setBusy({ name: file.name, frac: 0 })
      try {
        const job = await api.create(file, opts, (f) => setBusy({ name: file.name, frac: f }))
        await refreshJobs()
        await openJob(job.id)
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setBusy(null)
      }
    },
    [opts, refreshJobs, openJob],
  )

  const pickNative = async () => {
    if (!desktop) return
    const picked = await desktop.openImage()
    if (!picked) return
    setErr(null)
    setBusy({ name: picked.name, frac: 1 })
    try {
      const job = await desktop.submitPath(picked.path, opts)
      await refreshJobs()
      await openJob(job.id)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => (desktop ? pickNative() : input.current?.click())}
        onKeyDown={(e) => e.key === 'Enter' && (desktop ? pickNative() : input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) submit(f) }}
        className={cn(
          'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-panel border border-dashed text-center transition-colors',
          compact ? 'px-3 py-6' : 'px-6 py-12',
          drag ? 'border-accent bg-accent/10' : 'border-line-2 bg-panel-2/40 hover:border-ink-3 hover:bg-panel-2',
        )}
      >
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && submit(e.target.files[0])} />
        {busy ? (
          <div className="flex w-full max-w-xs flex-col gap-2">
            <span className="truncate text-[13.5px] text-ink">{busy.name}</span>
            <Progress value={busy.frac} active />
            <span className="text-[12px] text-ink-3">{busy.frac < 1 ? `uploading ${Math.round(busy.frac * 100)}%` : 'starting'}</span>
          </div>
        ) : (
          <>
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line-2 bg-raised text-accent transition-transform group-hover:-translate-y-0.5">
              {desktop ? <FolderOpen size={19} /> : <UploadCloud size={19} />}
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink">{desktop ? 'Choose an image' : 'Drop an image here'}</span>
            <span className="text-[13px] text-ink-3">A GeoTIFF gives heights in metres. A PNG or JPG gives relative heights.</span>
          </>
        )}
      </div>
      {err && <p className="text-[13px] text-danger">{err}</p>}
    </div>
  )
}

/** What each sample demonstrates, in the user's terms rather than file terms. */
const SAMPLE_ORDER: Record<string, number> = { 'oam_urban.tif': 0, 'landsat_rgb.tif': 1, 'urban_photo.png': 2 }

const SAMPLE_NOTES: Record<string, { title: string; body: string; icon: typeof Satellite }> = {
  'oam_urban.tif': { title: 'City block, drone photo', body: 'Centimetre detail. Buildings and trees come out in real metres. About 30 seconds.', icon: MountainSnow },
  'landsat_rgb.tif': { title: 'Satellite scene', body: 'A wide landscape at coarse detail, calibrated against a public elevation map. About 15 seconds.', icon: Satellite },
  'urban_photo.png': { title: 'Ordinary photo, no location', body: 'No coordinates in the file, so heights come out relative. Shows the fallback path.', icon: ImageIcon },
}

export function Samples({ className }: { className?: string }) {
  const [samples, setSamples] = useState<{ name: string; size: number; georeferenced: boolean }[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [opts] = useRunOptions()
  const online = useStore((s) => s.online)
  const refreshJobs = useStore((s) => s.refreshJobs)
  const openJob = useStore((s) => s.openJob)

  useEffect(() => {
    if (!online) return
    api.samples().then(setSamples).catch((e) => setErr(`Could not load the sample scenes: ${(e as Error).message}`))
  }, [online])

  if (!samples.length && !err) return null
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <span className="label">Try it now, nothing to install</span>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[...samples].sort((a, b) => (SAMPLE_ORDER[a.name] ?? 9) - (SAMPLE_ORDER[b.name] ?? 9)).map((s) => {
          const note = SAMPLE_NOTES[s.name] ?? {
            title: s.name,
            body: s.georeferenced ? 'Carries coordinates, so heights come out in metres.' : 'No coordinates, so heights come out relative.',
            icon: ImageIcon,
          }
          const Icon = note.icon
          const busy = running === s.name
          return (
            <button
              key={s.name}
              disabled={running !== null}
              onClick={async () => {
                setRunning(s.name)
                setErr(null)
                try {
                  const job = await api.createFromSample(s.name, opts)
                  await refreshJobs()
                  await openJob(job.id)
                } catch (e) {
                  setErr(`Could not start ${s.name}: ${(e as Error).message}`)
                } finally {
                  setRunning(null)
                }
              }}
              className={cn(
                'flex flex-col gap-2 rounded-panel border p-3.5 text-left transition-colors disabled:opacity-55',
                busy ? 'border-accent bg-accent/10' : 'border-line-2 bg-panel-2/50 hover:border-accent/60 hover:bg-panel-2',
              )}
            >
              <span className="flex items-center gap-2 text-accent">
                {busy ? <Loader2 size={17} className="animate-spin" /> : <Icon size={17} />}
              </span>
              <span className="text-[14px] font-semibold leading-snug text-ink">{note.title}</span>
              <span className="text-[12.5px] leading-relaxed text-ink-3">{busy ? 'Starting…' : note.body}</span>
            </button>
          )
        })}
      </div>
      {err && <p className="text-[13px] text-danger">{err}</p>}
    </div>
  )
}
