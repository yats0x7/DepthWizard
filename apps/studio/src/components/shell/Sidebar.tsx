import { Cpu } from 'lucide-react'
import { useStore } from '../../store'
import { Dropzone, Samples } from '../jobs/NewJob'
import { JobList } from '../jobs/JobList'
import { cn } from '../../lib/cn'

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#151d27" />
        <path d="M4 24 L11 12 L15 18 L20 8 L28 24 Z" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" />
        <path d="M4 24 H28" stroke="#f5a524" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[17px] font-semibold tracking-tight text-ink">DepthWizard</span>
    </div>
  )
}

export function Sidebar() {
  const system = useStore((s) => s.system)
  const online = useStore((s) => s.online)
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-panel 2xl:w-[300px]">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <Brand />
        <span className={cn('flex items-center gap-1.5 text-[11px]', online ? 'text-ink-3' : 'text-danger')} title={system ? `${system.torch} on ${system.device}` : 'engine offline'}>
          <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-ok' : 'bg-danger')} />
          {online ? (
            <>
              <Cpu size={12} /> {system?.device.toUpperCase()}
            </>
          ) : (
            'engine offline'
          )}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        <Dropzone compact />
        <Samples />
        <div className="flex flex-col gap-1.5">
          <span className="label px-1">Jobs</span>
          <JobList />
        </div>
      </div>
    </aside>
  )
}
