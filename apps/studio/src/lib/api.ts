export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface Job {
  id: string
  name: string
  status: JobStatus
  stage: string
  progress: number
  message: string
  created: number
  updated: number
  seconds?: number | null
  units?: 'm' | 'relative' | null
  georeferenced?: boolean | null
  model?: string | null
  error?: string | null
  imagery?: ImageryAttribution | null
  meta?: Meta | null
}

export interface ImageryAttribution {
  source: string
  id?: string
  title?: string
  license?: string
  attribution?: string
  date?: string | null
  provider?: string | null
  bbox?: number[]
}

export interface ImageryItem extends ImageryAttribution {
  source: 'oam' | 'sentinel2'
  id: string
  title: string
  url: string
  bbox: number[]
  gsd_m?: number | null
  cloud?: number | null
  thumbnail?: string | null
}

export interface Calibration {
  mode: string
  scale: number
  offset: number
  r2: number | null
  n: number
  used_prior: boolean
  gcp_count: number
  gcp_rmse: number | null
  dem: { source?: string; native_res_m?: number; error?: string; cached?: boolean }
  notes: string[]
}

export interface Stats {
  valid_fraction: number
  min: number
  max: number
  mean: number
  std: number
  p2: number
  p25: number
  median: number
  p75: number
  p98: number
  relief: number
  slope_mean_deg?: number
  slope_p90_deg?: number
  steep_fraction?: number
  histogram: { bins: number[]; counts: number[] }
}

export interface Meta {
  version: string
  input: {
    name: string
    shape: [number, number]
    source_shape: [number, number]
    downscale: number
    georeferenced: boolean
    crs: string | null
    epsg: number | null
    transform: number[] | null
    bounds: number[] | null
    bounds4326: number[] | null
    centre4326: [number, number] | null
    pixel_size_m: [number, number] | null
    nodata_fraction: number
  }
  model: { id: string; preset: string; device: string; tta: boolean; infer_res: number; tile: number }
  units: 'm' | 'relative'
  calibration: Calibration
  heightmap: { min: number; max: number }
  stats: Stats
  mesh: { vertices: number; faces: number; grid: [number, number]; pixel_size: [number, number]; z_offset: number }
  view: { vertical_scale: number; pixel_size: [number, number] }
  files: Record<string, string>
  timings: Record<string, number>
  seconds: number
  metrics?: Metrics
}

export interface MetricBlock {
  n: number
  rmse: number
  mae: number
  bias: number
  median_error: number
  nmad: number
  pearson_r: number
  abs_error_p90: number
  within_1m: number
  within_3m: number
  scale?: number
  offset?: number
}

export interface Metrics {
  raw?: MetricBlock
  aligned?: MetricBlock
  per_class?: Record<string, MetricBlock>
  reference?: string
  units?: string
  error_map?: string
  error_map_clip_m?: number
  error?: string
  n?: number
}

export interface SystemInfo {
  version: string
  device: string
  torch: string
  models: Record<string, { id: string; params: string; label: string }>
  dem_sources: Record<string, { label: string; res_m: number; note: string }>
  loaded_models: string[]
  defaults: { model: string; calibration: string; dem_source: string; prior_p95_m: number; tta: boolean }
  jobs: number
}

export interface GCP {
  row: number
  col: number
  z: number
  label?: string
}

export interface RunOptions {
  model?: string
  calibration?: string
  dem_source?: string
  prior_p95_m?: number
  semantic_prior?: boolean
}

export interface Sample {
  name: string
  size: number
  georeferenced: boolean
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? window.__DW_API__ ?? ''

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? JSON.stringify(body)
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json() as Promise<T>
}

export const api = {
  base: BASE,
  fileUrl: (id: string, name: string) => `${BASE}/api/jobs/${id}/files/${name}`,
  health: () => fetch(`${BASE}/api/health`).then(json<{ ok: boolean; version: string }>),
  system: () => fetch(`${BASE}/api/system`).then(json<SystemInfo>),
  warmup: (model?: string) =>
    fetch(`${BASE}/api/warmup${model ? `?model=${model}` : ''}`, { method: 'POST' }).then(json<{ model: string }>),
  jobs: () => fetch(`${BASE}/api/jobs`).then(json<Job[]>),
  job: (id: string) => fetch(`${BASE}/api/jobs/${id}`).then(json<Job>),
  samples: () => fetch(`${BASE}/api/samples`).then(json<Sample[]>),
  createFromSample: (name: string, opts: RunOptions) =>
    fetch(`${BASE}/api/jobs/from-sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...opts }),
    }).then(json<Job>),
  create: (file: File, opts: RunOptions, onProgress?: (frac: number) => void) =>
    new Promise<Job>((resolve, reject) => {
      const fd = new FormData()
      fd.append('file', file)
      for (const [k, v] of Object.entries(opts)) if (v !== undefined && v !== null && v !== '') fd.append(k, String(v))
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE}/api/jobs`)
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText))
        else {
          let msg = xhr.statusText
          try {
            msg = JSON.parse(xhr.responseText).detail ?? msg
          } catch {
            /* ignore */
          }
          reject(new Error(msg))
        }
      }
      xhr.onerror = () => reject(new Error('upload failed'))
      xhr.send(fd)
    }),
  cancel: (id: string) => fetch(`${BASE}/api/jobs/${id}/cancel`, { method: 'POST' }).then(json<Job>),
  delete: (id: string) => fetch(`${BASE}/api/jobs/${id}`, { method: 'DELETE' }).then(json<{ deleted: string }>),
  validate: (id: string, file: File, classes?: File | null, classNames?: Record<string, string>) => {
    const fd = new FormData()
    fd.append('file', file)
    if (classes) fd.append('classes', classes)
    if (classNames && Object.keys(classNames).length) fd.append('class_names', JSON.stringify(classNames))
    return fetch(`${BASE}/api/jobs/${id}/validate`, { method: 'POST', body: fd }).then(json<Metrics>)
  },
  recalibrate: (id: string, body: { mode?: string | null; gcps?: GCP[]; prior_p95_m?: number | null }) =>
    fetch(`${BASE}/api/jobs/${id}/recalibrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(json<Meta>),
  imagerySearch: (bbox: number[], sources: ('oam' | 'sentinel2')[] = ['oam', 'sentinel2']) =>
    fetch(`${BASE}/api/imagery/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox, sources }),
    }).then(json<ImageryItem[]>),
  createFromArea: (bbox: number[], item: ImageryItem, opts: RunOptions) =>
    fetch(`${BASE}/api/jobs/from-area`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bbox, item, ...opts }),
    }).then(json<Job>),
  /** Live job status over server-sent events; falls back to polling when SSE is unavailable. */
  watch(id: string, onStatus: (job: Job) => void): () => void {
    let closed = false
    let es: EventSource | null = null
    let timer: number | undefined
    const poll = async () => {
      if (closed) return
      try {
        const j = await api.job(id)
        onStatus(j)
        if (['done', 'failed', 'cancelled'].includes(j.status)) return
      } catch {
        /* keep polling */
      }
      timer = window.setTimeout(poll, 1000)
    }
    try {
      es = new EventSource(`${BASE}/api/jobs/${id}/events`)
      es.addEventListener('status', (e) => {
        const j = JSON.parse((e as MessageEvent).data) as Job
        onStatus(j)
        if (['done', 'failed', 'cancelled'].includes(j.status)) es?.close()
      })
      es.onerror = () => {
        es?.close()
        es = null
        if (!closed) poll()
      }
    } catch {
      poll()
    }
    return () => {
      closed = true
      es?.close()
      if (timer) window.clearTimeout(timer)
    }
  },
}

export interface DesktopBridge {
  isDesktop: true
  platform: string
  version: string
  saveFile: (url: string, suggestedName: string) => Promise<string | null>
  openImage: () => Promise<{ name: string; path: string } | null>
  submitPath: (path: string, opts: RunOptions) => Promise<Job>
  revealJob: (id: string) => Promise<void>
}

export const desktop: DesktopBridge | undefined = window.depthwizard
