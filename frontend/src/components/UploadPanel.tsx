import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Image as ImageIcon, Loader2, Trash2, UploadCloud, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { api, type Job } from '../lib/api'
import { useStore } from '../store'

const STAGES: Record<string, string> = {
  queued: 'Queued', loading: 'Reading image', depth: 'Estimating depth', dem: 'Fetching reference DEM',
  calibrate: 'Calibrating scale', export: 'Exporting outputs', done: 'Done',
}

export function UploadPanel() {
  const { job, jobs, set, reset } = useStore()
  const [drag, setDrag] = useState(false)
  const [calibration, setCalibration] = useState('hybrid')
  const [dem, setDem] = useState('glo_30')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = () => api.listJobs().then((j) => set({ jobs: j })).catch(() => undefined)
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [set])

  const submit = useCallback(async (file: File) => {
    setBusy(true)
    try {
      const j = await api.createJob(file, { calibration, dem_source: dem })
      reset()
      set({ job: j, jobs: [j, ...useStore.getState().jobs] })
    } catch (e) {
      set({ error: (e as Error).message })
    } finally { setBusy(false) }
  }, [calibration, dem, reset, set])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) submit(f)
  }

  const open = (j: Job) => { reset(); set({ job: j, meta: j.meta }) }
  const remove = async (j: Job) => {
    await api.deleteJob(j.id).catch(() => undefined)
    set({ jobs: useStore.getState().jobs.filter((x) => x.id !== j.id) })
    if (job?.id === j.id) reset()
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
        onClick={() => input.current?.click()}
        className={clsx('panel p-5 text-center cursor-pointer border-dashed transition-colors',
          drag ? 'border-accent bg-accent/10' : 'hover:border-accent/50')}
      >
        <UploadCloud className="mx-auto mb-2 text-accent" size={28} />
        <div className="text-sm font-medium">Drop a satellite image</div>
        <div className="text-xs text-muted mt-1">PNG / JPG → relative DSM · GeoTIFF → metric DSM</div>
        <input ref={input} type="file" hidden accept=".png,.jpg,.jpeg,.tif,.tiff,.webp"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) submit(f); e.target.value = '' }} />
      </div>

      <div className="panel p-3 grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1"><span className="label">Calibration</span>
          <select value={calibration} onChange={(e) => setCalibration(e.target.value)}>
            <option value="hybrid">Hybrid (DEM + model)</option>
            <option value="affine">Affine to DEM</option>
            <option value="prior">Scene prior only</option>
          </select></label>
        <label className="flex flex-col gap-1"><span className="label">Reference DEM</span>
          <select value={dem} onChange={(e) => setDem(e.target.value)}>
            <option value="glo_30">Copernicus GLO-30</option>
            <option value="srtm_v3">SRTM v3 (30 m)</option>
            <option value="nasadem">NASADEM</option>
          </select></label>
      </div>

      {job && job.status !== 'done' && (
        <div className="panel p-3">
          <div className="flex items-center gap-2 text-sm">
            {job.status === 'error' ? <XCircle className="text-err" size={16} /> : <Loader2 className="animate-spin text-accent" size={16} />}
            <span className="truncate">{job.input_name}</span>
          </div>
          {job.status === 'error' ? <div className="text-xs text-err mt-2 break-words">{job.error}</div> : (
            <>
              <div className="text-xs text-muted mt-2">{STAGES[job.stage || job.status] ?? job.stage}</div>
              <div className="h-1.5 bg-bg rounded mt-1 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-accent to-accent-2 transition-all" style={{ width: `${Math.max(4, job.progress * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="label mt-1">Recent jobs</div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-0">
        {jobs.length === 0 && <div className="text-xs text-muted px-1">No jobs yet. Upload an image to start.</div>}
        {jobs.map((j) => (
          <div key={j.id} onClick={() => j.status === 'done' && open(j)}
            className={clsx('panel px-3 py-2 flex items-center gap-2 text-sm', j.status === 'done' && 'cursor-pointer hover:border-accent/50',
              job?.id === j.id && 'border-accent/70')}>
            {j.status === 'done' ? <CheckCircle2 className="text-ok shrink-0" size={15} /> : j.status === 'error' ? <XCircle className="text-err shrink-0" size={15} /> : <Loader2 className="animate-spin text-accent shrink-0" size={15} />}
            <ImageIcon size={14} className="text-muted shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate">{j.input_name}</div>
              <div className="text-[11px] text-muted">{j.meta ? `${j.meta.units === 'm' ? 'metric' : 'relative'} · ${j.meta.input.shape[1]}×${j.meta.input.shape[0]}` : j.status}</div>
            </div>
            <button className="text-muted hover:text-err" onClick={(e) => { e.stopPropagation(); remove(j) }} title="Delete"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      {busy && <div className="text-xs text-muted">Uploading…</div>}
    </div>
  )
}
