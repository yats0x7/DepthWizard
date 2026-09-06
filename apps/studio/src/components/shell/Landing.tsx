import { Mountain, Ruler, Scan } from 'lucide-react'
import { useStore } from '../../store'
import { Dropzone, Samples } from '../jobs/NewJob'
import { JobProgress } from '../jobs/JobProgress'
import { Button } from '../ui'

export function Landing() {
  const job = useStore((s) => s.job)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const openJob = useStore((s) => s.openJob)
  const set = useStore((s) => s.set)

  if (job && (job.status === 'queued' || job.status === 'running')) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 px-8">
        <p className="text-[13px] text-ink-3">{job.name}</p>
        <JobProgress job={job} />
      </div>
    )
  }
  if (job && (job.status === 'failed' || job.status === 'cancelled')) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <h2 className="font-display text-[22px] font-semibold tracking-tight">{job.status === 'failed' ? 'This run failed' : 'Run cancelled'}</h2>
        <p className="max-w-md text-[13px] leading-relaxed text-ink-2">
          {job.status === 'failed' ? `The engine reported: ${job.error ?? job.message}. Check that the file is a readable PNG, JPG or GeoTIFF and try again; the engine log has the full trace.` : 'The run was stopped before it finished.'}
        </p>
        <Button onClick={() => openJob(null)}>Back</Button>
      </div>
    )
  }
  if (loading || error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        {loading && <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-2 border-t-accent" />}
        <p className="text-[13px] text-ink-2">{error ?? loading}</p>
        {error && <Button onClick={() => openJob(null)}>Back</Button>}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="rise m-auto flex w-full max-w-2xl flex-col gap-9 px-8 py-10">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[38px] font-semibold leading-[1.05] tracking-tight text-ink text-balance">One satellite image in. A surface model you can walk through out.</h1>
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
            DepthWizard turns a single optical image into a digital surface model, calibrates it to metres when the file carries coordinates, and renders it as terrain you can fly over, measure and validate.
          </p>
        </div>
        <Dropzone />
        <Samples />
        <Button onClick={() => set('panel', 'map')} className="self-start">Open map picker</Button>
        <ol className="grid grid-cols-1 gap-6 border-t border-line pt-6 md:grid-cols-3">
          {[
            { icon: Scan, title: 'Depth from one view', body: 'Depth Anything V2 reads structure from the image; tiles are aligned to one global pass.' },
            { icon: Ruler, title: 'Metres from terrain', body: 'GeoTIFF footprints pull a coarse DEM; the terrain trend sets the scale, ground control points refine it.' },
            { icon: Mountain, title: 'Same data, two looks', body: 'Presentation lights and shades it. Analysis shows the raw surface; every reading is the DSM value.' },
          ].map((s) => (
            <li key={s.title} className="flex flex-col gap-2">
              <s.icon size={18} className="text-accent" />
              <h3 className="font-display text-[14px] font-semibold text-ink">{s.title}</h3>
              <p className="text-[12.5px] leading-relaxed text-ink-3">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
