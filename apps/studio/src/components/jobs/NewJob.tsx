import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, FolderOpen, ImagePlus, UploadCloud } from 'lucide-react'
import { api, desktop, type RunOptions } from '../../lib/api'
import { useStore } from '../../store'
import { Button, Field, Input, Progress, Select } from '../ui'
import { cn } from '../../lib/cn'
import { fmtBytes } from '../../lib/format'

const ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.geotiff,.jp2,.img'

export function useRunOptions() {
  const system = useStore((s) => s.system)
  const [opts, setOpts] = useState<RunOptions>({})
  useEffect(() => {
    if (system && !opts.model) setOpts({ model: system.defaults.model, calibration: system.defaults.calibration, dem_source: system.defaults.dem_source, prior_p95_m: system.defaults.prior_p95_m })
  }, [system, opts.model])
  return [opts, setOpts] as const
}

export function RunOptionsForm({ opts, setOpts }: { opts: RunOptions; setOpts: (o: RunOptions) => void }) {
  const system = useStore((s) => s.system)
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Model">
        <Select value={opts.model ?? 'small'} onChange={(e) => setOpts({ ...opts, model: e.target.value })}>
          {Object.entries(system?.models ?? { small: { label: 'Fast', params: '25M' } }).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label} · {m.params}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Calibration">
        <Select value={opts.calibration ?? 'hybrid'} onChange={(e) => setOpts({ ...opts, calibration: e.target.value })}>
          <option value="hybrid">Hybrid (DEM + structure)</option>
          <option value="affine">Affine fit to DEM</option>
          <option value="prior">Scene prior only</option>
        </Select>
      </Field>
      <Field label="Terrain source">
        <Select value={opts.dem_source ?? 'terrarium'} onChange={(e) => setOpts({ ...opts, dem_source: e.target.value })}>
          {Object.entries(system?.dem_sources ?? { terrarium: { label: 'AWS Terrain Tiles' } }).map(([k, d]) => (
            <option key={k} value={k}>
              {d.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prior p95 height" hint="m">
        <Input type="number" min={1} max={500} step={1} value={opts.prior_p95_m ?? 20} onChange={(e) => setOpts({ ...opts, prior_p95_m: Number(e.target.value) })} />
      </Field>
    </div>
  )
}

export function Dropzone({ compact = false, className }: { compact?: boolean; className?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState<{ name: string; frac: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showOpts, setShowOpts] = useState(false)
  const [opts, setOpts] = useRunOptions()
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
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files?.[0]
          if (f) submit(f)
        }}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-panel border border-dashed text-center transition-colors',
          compact ? 'px-3 py-5' : 'px-6 py-10',
          drag ? 'border-accent bg-accent/10' : 'border-line-2 bg-panel-2/50 hover:border-ink-3 hover:bg-panel-2',
        )}
      >
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && submit(e.target.files[0])} />
        {busy ? (
          <div className="flex w-full max-w-xs flex-col gap-2">
            <span className="truncate text-[13px] text-ink">{busy.name}</span>
            <Progress value={busy.frac} active />
            <span className="text-[11px] text-ink-3">{busy.frac < 1 ? `uploading ${Math.round(busy.frac * 100)}%` : 'starting'}</span>
          </div>
        ) : (
          <>
            <span className={cn('flex items-center justify-center rounded-full border border-line-2 bg-raised text-accent transition-transform group-hover:-translate-y-0.5', compact ? 'h-9 w-9' : 'h-12 w-12')}>
              {desktop ? <FolderOpen size={compact ? 16 : 20} /> : <UploadCloud size={compact ? 16 : 20} />}
            </span>
            <span className={cn('font-display font-semibold tracking-tight text-ink', compact ? 'text-[13px]' : 'text-[16px]')}>{desktop ? 'Open an image' : 'Drop an image here'}</span>
            <span className="text-[12px] text-ink-3">PNG or JPG gives a relative DSM · GeoTIFF gives metres</span>
          </>
        )}
      </div>
      {err && <p className="text-[12px] text-danger">{err}</p>}
      <button onClick={() => setShowOpts((v) => !v)} className="flex items-center gap-1 self-start text-[12px] text-ink-3 hover:text-ink">
        <ChevronDown size={14} className={cn('transition-transform', showOpts && 'rotate-180')} /> Run options
      </button>
      {showOpts && (
        <div className="rise">
          <RunOptionsForm opts={opts} setOpts={setOpts} />
        </div>
      )}
    </div>
  )
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
    if (online) api.samples().then(setSamples).catch(() => setSamples([]))
  }, [online])
  if (!samples.length) return null
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="label">Sample scenes</span>
      {samples.map((s) => (
        <Button
          key={s.name}
          variant="ghost"
          size="sm"
          disabled={running !== null}
          className="justify-between px-2"
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
        >
          <span className="flex min-w-0 items-center gap-2">
            <ImagePlus size={14} className="shrink-0 text-accent" />
            <span className="truncate">{s.name}</span>
          </span>
          <span className="num shrink-0 whitespace-nowrap text-[11px] text-ink-3">
            {s.georeferenced ? 'GeoTIFF' : 'image'} · {fmtBytes(s.size)}
          </span>
        </Button>
      ))}
      {err && <p className="px-1 text-[12px] text-danger">{err}</p>}
    </div>
  )
}
