import { useEffect } from 'react'
import { api } from './api'
import { loadHeightField } from './terrain'
import { useStore } from '../store'

/** Polls the active job until it finishes, then loads its heightfield into the store. */
export function useJobPolling() {
  const job = useStore((s) => s.job)
  const version = useStore((s) => s.version)
  const set = useStore((s) => s.set)

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return
    let alive = true
    const tick = async () => {
      try {
        const j = await api.getJob(job.id)
        if (!alive) return
        set({ job: j, meta: j.meta ?? null, jobs: useStore.getState().jobs.map((x) => (x.id === j.id ? j : x)) })
        if (j.status === 'done' || j.status === 'error') return
      } catch (e) {
        if (alive) set({ error: (e as Error).message })
        return
      }
      if (alive) setTimeout(tick, 700)
    }
    const t = setTimeout(tick, 500)
    return () => { alive = false; clearTimeout(t) }
  }, [job?.id, job?.status, set])

  useEffect(() => {
    if (!job || job.status !== 'done' || !job.meta) return
    let alive = true
    const name = job.meta.files.dsm ?? job.meta.files.rdsm
    set({ loading: 'Loading elevation model…', heightField: null })
    loadHeightField(api.fileUrl(job.id, name, version))
      .then((hf) => { if (alive) set({ heightField: hf, loading: null, error: null }) })
      .catch((e) => { if (alive) set({ loading: null, error: `Could not load DSM: ${(e as Error).message}` }) })
    return () => { alive = false }
  }, [job?.id, job?.status, version, set])
}
