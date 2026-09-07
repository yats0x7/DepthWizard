import { useState } from 'react'
import { ArrowRight, Map as MapIcon, Upload } from 'lucide-react'
import { useStore } from '../../store'
import { Dropzone, RunSettings, Samples } from '../jobs/NewJob'
import { JobProgress } from '../jobs/JobProgress'
import { MapPanel } from '../panels/MapPanel'
import { Button } from '../ui'

export function Landing() {
  const job = useStore((s) => s.job)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const openJob = useStore((s) => s.openJob)
  const [route, setRoute] = useState<'start' | 'upload' | 'map'>('start')

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
        <h2 className="text-[22px] font-semibold tracking-tight">{job.status === 'failed' ? 'This run failed' : 'Run cancelled'}</h2>
        <p className="max-w-md text-[13.5px] leading-relaxed text-ink-2">
          {job.status === 'failed'
            ? `The engine reported: ${job.error ?? job.message}. Check the file is a readable PNG, JPG or GeoTIFF and try again.`
            : 'The run was stopped before it finished.'}
        </p>
        <Button onClick={() => openJob(null)}>Back</Button>
      </div>
    )
  }
  if (loading || error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        {loading && <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-2 border-t-accent" />}
        <p className="text-[13.5px] text-ink-2">{error ?? loading}</p>
        {error && <Button onClick={() => openJob(null)}>Back</Button>}
      </div>
    )
  }

  if (route === 'map') {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-8 pt-8">
          <button onClick={() => setRoute('start')} className="mb-4 text-[13px] text-ink-3 hover:text-ink">← Back</button>
          <h2 className="text-[24px] font-semibold tracking-tight">Pick a place</h2>
          <p className="pt-1 text-[13.5px] leading-relaxed text-ink-2">
            Search for somewhere, drag the pin, then choose an image. We only use imagery whose licence
            allows us to build a height model from it.
          </p>
        </div>
        <div className="mx-auto w-full max-w-xl pb-10"><MapPanel /></div>
      </div>
    )
  }

  if (route === 'upload') {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="m-auto flex w-full max-w-xl flex-col gap-5 px-8 py-10">
          <button onClick={() => setRoute('start')} className="text-[13px] text-ink-3 hover:text-ink">← Back</button>
          <h2 className="text-[24px] font-semibold tracking-tight">Open your own image</h2>
          <Dropzone />
          <RunSettings />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="rise m-auto flex w-full max-w-2xl flex-col gap-10 px-8 py-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight text-balance text-ink">
            How tall is everything in this photo?
          </h1>
          <p className="max-w-[60ch] text-[15.5px] leading-relaxed text-ink-2">
            Give DepthWizard one satellite or drone image and it works out the height of every
            point in it, then turns that into terrain you can fly through and measure.
          </p>
        </div>

        <Samples />

        <div className="flex flex-col gap-3 border-t border-line pt-7">
          <span className="label">Or start from your own data</span>
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={() => setRoute('upload')}>
              <Upload size={15} /> Open an image
            </Button>
            <Button onClick={() => setRoute('map')}>
              <MapIcon size={15} /> Pick a place on the map <ArrowRight size={14} className="text-ink-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
