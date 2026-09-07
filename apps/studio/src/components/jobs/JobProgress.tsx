import { motion, AnimatePresence } from 'motion/react'
import { Check, Loader2 } from 'lucide-react'
import type { Job } from '../../lib/api'
import { STAGES, STAGE_LABEL, stageProgress } from './JobList'
import { Progress } from '../ui'
import { cn } from '../../lib/cn'

export function JobProgress({ job }: { job: Job }) {
  const idx = STAGES.indexOf(job.stage)
  const pct = stageProgress(job)
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="relative h-10 w-full overflow-hidden text-center">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={job.stage}
            initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="text-[24px] font-semibold tracking-tight text-ink"
          >
            {STAGE_LABEL[job.stage] ?? job.stage}
          </motion.div>
        </AnimatePresence>
      </div>
      <Progress value={pct} active className="h-2" />
      <ol className="flex w-full items-center justify-between">
        {STAGES.slice(0, 7).map((s, i) => {
          const done = i < idx || job.status === 'done'
          const current = i === idx && job.status === 'running'
          return (
            <li key={s} className="flex flex-col items-center gap-1.5">
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition-colors', done ? 'border-accent bg-accent text-ground' : current ? 'border-accent text-accent' : 'border-line-2 text-ink-3')}>
                {done ? <Check size={13} /> : current ? <Loader2 size={12} className="animate-spin" /> : i + 1}
              </span>
              <span className={cn('text-[11px]', done || current ? 'text-ink-2' : 'text-ink-3')}>{STAGE_LABEL[s].split(' ')[0]}</span>
            </li>
          )
        })}
      </ol>
      <p className="num text-[12px] text-ink-3">{job.message}</p>
    </div>
  )
}
