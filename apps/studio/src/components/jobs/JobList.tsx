import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Trash2, XCircle } from 'lucide-react'
import { api, type Job } from '../../lib/api'
import { useStore } from '../../store'
import { Progress } from '../ui'
import { cn } from '../../lib/cn'
import { fmtSeconds, timeAgo } from '../../lib/format'

export const STAGES = ['fetch', 'load', 'infer', 'dem', 'calibrate', 'analyse', 'export', 'done']
export const STAGE_LABEL: Record<string, string> = {
  queued: 'Queued', fetch: 'Fetching imagery', load: 'Reading image', infer: 'Predicting depth', dem: 'Fetching terrain', calibrate: 'Calibrating heights',
  analyse: 'Terrain statistics', export: 'Writing outputs', done: 'Finished', failed: 'Failed', cancelled: 'Cancelled',
}

/** Keeps running jobs live through server-sent events. */
export function useLiveJobs() {
  const jobs = useStore((s) => s.jobs)
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running').map((j) => j.id).join(',')
  useEffect(() => {
    if (!active) return
    const stops = active.split(',').map((id) =>
      api.watch(id, (job) => {
        useStore.setState((s) => ({
          jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...job, meta: j.meta } : j)),
          job: s.jobId === id && s.job ? { ...s.job, ...job, meta: s.job.meta } : s.job,
        }))
        if (['done', 'failed', 'cancelled'].includes(job.status)) {
          const s = useStore.getState()
          s.refreshJobs()
          if (s.jobId === id) s.reloadJob()
        }
      }),
    )
    return () => stops.forEach((s) => s())
  }, [active])
}

function StatusIcon({ job }: { job: Job }) {
  if (job.status === 'done') return <CheckCircle2 size={15} className="text-ok" />
  if (job.status === 'failed') return <XCircle size={15} className="text-danger" />
  if (job.status === 'cancelled') return <AlertTriangle size={15} className="text-ink-3" />
  return <Loader2 size={15} className="animate-spin text-accent" />
}

export function JobList() {
  const jobs = useStore((s) => s.jobs)
  const jobId = useStore((s) => s.jobId)
  const openJob = useStore((s) => s.openJob)
  const removeJob = useStore((s) => s.removeJob)
  useLiveJobs()
  if (!jobs.length) return <p className="px-1 text-[12px] text-ink-3">No jobs yet. Drop an image or run a sample.</p>
  return (
    <ul className="flex flex-col gap-1">
      {jobs.map((j) => {
        const active = j.id === jobId
        const running = j.status === 'queued' || j.status === 'running'
        return (
          <li key={j.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => openJob(j.id)}
              onKeyDown={(e) => e.key === 'Enter' && openJob(j.id)}
              className={cn('group flex cursor-pointer flex-col gap-1.5 rounded-lg border px-2.5 py-2 transition-colors', active ? 'border-accent/50 bg-accent/10' : 'border-transparent hover:border-line-2 hover:bg-panel-2')}
            >
              <div className="flex items-center gap-2">
                <StatusIcon job={j} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{j.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (running) api.cancel(j.id)
                    else if (window.confirm(`Delete "${j.name}" and all of its output files? This cannot be undone.`)) removeJob(j.id)
                  }}
                  title={running ? 'Cancel' : 'Delete'}
                  className="rounded p-0.5 text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                >
                  {running ? <XCircle size={14} /> : <Trash2 size={14} />}
                </button>
              </div>
              {running ? (
                <>
                  <Progress value={stageProgress(j)} active />
                  <span className="text-[11px] text-ink-3">{STAGE_LABEL[j.stage] ?? j.stage} · {j.message}</span>
                </>
              ) : (
                  <span className="num text-[11px] text-ink-3">
                    {j.status === 'failed' ? (j.error ?? 'failed').slice(0, 80) : `${j.units === 'm' ? 'metric DSM' : j.units === 'relative' ? 'relative DSM' : j.status}${j.imagery?.source ? ` · ${j.imagery.source}` : ''} · ${fmtSeconds(j.seconds)} · ${timeAgo(j.created)}`}
                  </span>
              )}
              {j.imagery?.attribution && <span className="truncate text-[10px] text-ink-3" title={`${j.imagery.license ?? ''} · ${j.imagery.attribution}`}>
                {j.imagery.attribution}
              </span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Overall progress from stage weights (inference dominates). */
export function stageProgress(j: Job): number {
  const weights: Record<string, [number, number]> = { queued: [0, 0.02], fetch: [0.02, 0.08], load: [0.08, 0.1], infer: [0.1, 0.72], dem: [0.72, 0.8], calibrate: [0.8, 0.86], analyse: [0.86, 0.88], export: [0.88, 0.99], done: [1, 1] }
  const [a, b] = weights[j.stage] ?? [0, 0]
  return a + (b - a) * (j.progress ?? 0)
}
