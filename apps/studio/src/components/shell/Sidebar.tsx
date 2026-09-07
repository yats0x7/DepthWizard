import { Cpu, House } from 'lucide-react'
import { useStore } from '../../store'
import { JobList } from '../jobs/JobList'
import { Button } from '../ui'
import { cn } from '../../lib/cn'

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#2a2521" />
        <path d="M4 24 L11 12 L15 18 L20 8 L28 24 Z" fill="none" stroke="#e5a13c" strokeWidth="2" strokeLinejoin="round" />
        <path d="M4 24 H28" stroke="#b3aa9e" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[16px] font-semibold tracking-tight text-ink">DepthWizard</span>
    </div>
  )
}

/**
 * The sidebar is history and the way home, not a second front door. The old build mounted the
 * dropzone and the sample list here *and* on the landing at the same time, which is why there were
 * five ways in and no obvious one — and then, once a model was open, no way back out at all.
 */
export function Sidebar() {
  const system = useStore((s) => s.system)
  const online = useStore((s) => s.online)
  const hasJob = useStore((s) => !!s.heightField)
  const openJob = useStore((s) => s.openJob)
  const jobs = useStore((s) => s.jobs)
  return (
    <aside className="flex h-full w-[268px] shrink-0 flex-col border-r border-line bg-panel 2xl:w-[300px]">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        {/* The wordmark is the way home, the way it is on every site anyone has ever used. */}
        <button onClick={() => openJob(null)} title="Back to the start page" className="rounded-md text-left hover:opacity-80">
          <Brand />
        </button>
        <span
          className={cn('flex items-center gap-1.5 text-[12px]', online ? 'text-ink-3' : 'text-danger')}
          title={system ? `${system.torch} on ${system.device}` : 'engine offline'}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-ok' : 'bg-danger')} />
          {online ? (<><Cpu size={12} /> {system?.device.toUpperCase()}</>) : 'offline'}
        </span>
      </div>
      {hasJob && (
        <div className="px-3 pb-3">
          <Button variant="primary" className="w-full" onClick={() => openJob(null)} title="Samples, your own image, and the map picker">
            <House size={15} /> Home
          </Button>
        </div>
      )}
      {jobs.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-4 opacity-90">
          <span className="label px-1">Recent runs</span>
          <JobList />
        </div>
      )}
    </aside>
  )
}
