import { useState } from 'react'
import { useStore } from '../../store'
import { Dropzone, RunSettings } from '../jobs/NewJob'
import { JobProgress } from '../jobs/JobProgress'
import { MapPanel } from '../panels/MapPanel'
import { Home } from './Home'
import { Button } from '../ui'

/**
 * Everything you see when no surface is loaded: the start page, the two ways of bringing your own
 * data, and the transient states of a run. Each one that is not the start page carries its own way
 * back, because a screen with no exit is the fastest way to make an app feel like a trap.
 */
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
        <Button onClick={() => openJob(null)}>Back to the start</Button>
      </div>
    )
  }
  if (loading || error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        {loading && <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-2 border-t-accent" />}
        <p className="text-[13.5px] text-ink-2">{error ?? loading}</p>
        {error && <Button onClick={() => openJob(null)}>Back to the start</Button>}
      </div>
    )
  }

  if (route === 'map') {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-8 pt-8">
          <button onClick={() => setRoute('start')} className="mb-4 text-[13px] text-ink-3 hover:text-ink">← Back to the start</button>
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
          <button onClick={() => setRoute('start')} className="text-[13px] text-ink-3 hover:text-ink">← Back to the start</button>
          <h2 className="text-[24px] font-semibold tracking-tight">Open your own image</h2>
          <Dropzone />
          <RunSettings />
        </div>
      </div>
    )
  }

  return <Home onUpload={() => setRoute('upload')} onMap={() => setRoute('map')} />
}
