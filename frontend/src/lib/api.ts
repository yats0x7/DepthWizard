export type JobStatus = 'queued' | 'running' | 'done' | 'error'

export interface Calibration {
  mode: string
  scale: number
  offset: number
  r2: number | null
  n: number
  used_prior: boolean
  gcp_count: number
  dem: Record<string, unknown>
  notes: string[]
}

export interface Meta {
  input: {
    name: string
    shape: [number, number]
    downscale: number
    georeferenced: boolean
    crs: string | null
    epsg: number | null
    transform: number[] | null
    bounds: number[] | null
    bounds4326: number[] | null
    pixel_size_m: [number, number] | null
  }
  model: { name: string; device: string; seconds: number }
  units: 'm' | 'relative'
  calibration: Calibration
  stats: { min: number; max: number; mean: number; p2: number; p98: number }
  heightmap: { min: number; max: number }
  view: { vertical_scale: number; pixel_size: [number, number] }
  mesh: { vertices: number; faces: number }
  files: Record<string, string>
  metrics?: Metrics
  seconds: number
}

export interface Stats {
  n: number; rmse: number; mae: number; bias: number; median_error: number; nmad: number
  pearson_r: number; abs_error_p90: number; within_1m: number; within_3m: number
}
export interface Metrics {
  raw: Stats
  aligned: Stats & { scale: number; offset: number }
  per_class?: Record<string, Stats>
  reference: string
  units: string
  error_map?: string
  error?: string
}

export interface Job {
  id: string
  status: JobStatus
  stage: string
  progress: number
  error: string | null
  created: number
  input_name: string
  meta: Meta | null
}

export interface GCP { row: number; col: number; z: number }

const base = import.meta.env.VITE_API_BASE ?? ''

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base + url, init)
  if (!r.ok) {
    let detail = r.statusText
    try { detail = (await r.json()).detail ?? detail } catch { /* ignore */ }
    throw new Error(`${r.status}: ${detail}`)
  }
  return r.status === 204 ? (undefined as T) : r.json()
}

export const api = {
  health: () => req<{ ok: boolean; version: string; model: string; device: string; model_loaded: boolean }>('/api/health'),
  warmup: () => req('/api/warmup', { method: 'POST' }),
  listJobs: () => req<Job[]>('/api/jobs'),
  getJob: (id: string) => req<Job>(`/api/jobs/${id}`),
  deleteJob: (id: string) => req<void>(`/api/jobs/${id}`, { method: 'DELETE' }),
  createJob: (file: File, opts: { calibration?: string; dem_source?: string; prior_p95_m?: number }) => {
    const fd = new FormData()
    fd.append('file', file)
    if (opts.calibration) fd.append('calibration', opts.calibration)
    if (opts.dem_source) fd.append('dem_source', opts.dem_source)
    if (opts.prior_p95_m) fd.append('prior_p95_m', String(opts.prior_p95_m))
    return req<Job>('/api/jobs', { method: 'POST', body: fd })
  },
  validate: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return req<Metrics>(`/api/jobs/${id}/validate`, { method: 'POST', body: fd })
  },
  recalibrate: (id: string, body: { calibration?: string | null; gcps: GCP[]; prior_p95_m?: number | null }) =>
    req<Meta>(`/api/jobs/${id}/recalibrate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  fileUrl: (id: string, name: string, bust?: number) => `${base}/api/jobs/${id}/files/${name}${bust ? `?v=${bust}` : ''}`,
}
