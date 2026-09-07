import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { api, type GCP, type Job, type Meta, type Metrics, type RunOptions, type SystemInfo } from './lib/api'
import { loadHeightField, type HeightField, type ProfileSample } from './lib/terrain'

export type Mode = 'presentation' | 'analysis'
export type Nav = 'orbit' | 'fly' | 'walk'
export type Layer = 'texture' | 'hypsometric' | 'slope' | 'aspect' | 'hillshade'
export type Tool = 'probe' | 'profile' | 'gcp' | 'none'
export type Panel = 'look' | 'measure' | 'check' | 'map'

export interface Probe {
  col: number
  row: number
  x: number
  z: number
  h: number
  slope: number
  aspect: number
}

export interface Pin extends Probe {
  id: number
  label?: string
}

export interface GcpPin extends GCP {
  id: number
  wx: number
  wz: number
}

interface State {
  system: SystemInfo | null
  online: boolean
  /** Shared by every way of starting a run, so settings never silently reset between them. */
  runOptions: RunOptions
  showAdvanced: boolean
  jobs: Job[]
  jobId: string | null
  job: Job | null
  meta: Meta | null
  heightField: HeightField | null
  version: number
  loading: string | null
  error: string | null

  mode: Mode
  nav: Nav
  panel: Panel
  exaggeration: number
  savedExaggeration: number | null
  layer: Layer
  wireframe: boolean
  contourStep: number
  flood: { on: boolean; level: number }
  sun: { azimuth: number; elevation: number }
  effects: boolean
  shadows: boolean
  showMinimap: boolean
  meshDetail: number // max grid side for the display mesh; vertices are always exact DSM samples
  tool: Tool
  hover: Probe | null
  probe: Probe | null
  pins: Pin[]
  profile: { a: [number, number] | null; b: [number, number] | null; samples: ProfileSample[] }
  gcps: GcpPin[]
  pendingGcp: { col: number; row: number; x: number; z: number } | null
  metrics: Metrics | null
  viewpoint: number // increments to request a camera transition
  viewpointName: 'overview' | 'oblique' | 'street' | 'top'

  boot: () => Promise<void>
  refreshJobs: () => Promise<void>
  openJob: (id: string | null) => Promise<void>
  reloadJob: () => Promise<void>
  removeJob: (id: string) => Promise<void>
  setMode: (m: Mode) => void
  set: <K extends keyof State>(k: K, v: State[K]) => void
  setHover: (p: Probe | null) => void
  setProbe: (p: Probe | null) => void
  addPin: (p: Probe) => void
  removePin: (id: number) => void
  clearPins: () => void
  setProfilePoint: (xz: [number, number]) => void
  clearProfile: () => void
  addGcp: (g: Omit<GcpPin, 'id'>) => void
  removeGcp: (id: number) => void
  goTo: (name: State['viewpointName']) => void
}

let pinSeq = 1

export const useStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    system: null,
    online: false,
    runOptions: {},
    showAdvanced: false,
    jobs: [],
    jobId: null,
    job: null,
    meta: null,
    heightField: null,
    version: 0,
    loading: null,
    error: null,

    mode: 'presentation',
    nav: 'orbit',
    panel: 'look',
    exaggeration: 1,
    savedExaggeration: null,
    layer: 'texture',
    wireframe: false,
    contourStep: 0,
    flood: { on: false, level: 0 },
    sun: { azimuth: 235, elevation: 28 },
    effects: true,
    shadows: true,
    showMinimap: true,
    meshDetail: 1024,
    tool: 'probe',
    hover: null,
    probe: null,
    pins: [],
    profile: { a: null, b: null, samples: [] },
    gcps: [],
    pendingGcp: null,
    metrics: null,
    viewpoint: 0,
    viewpointName: 'oblique',

    boot: async () => {
      try {
        const system = await api.system()
        set({
          system,
          online: true,
          runOptions: {
            model: system.defaults.model,
            calibration: system.defaults.calibration,
            dem_source: system.defaults.dem_source,
            prior_p95_m: system.defaults.prior_p95_m,
          },
        })
      } catch {
        set({ online: false })
      }
      await get().refreshJobs()
      const fromHash = new URLSearchParams(location.hash.slice(1)).get('job')
      if (fromHash && get().jobs.some((j) => j.id === fromHash)) await get().openJob(fromHash)
    },
    refreshJobs: async () => {
      try {
        const jobs = await api.jobs()
        set({ jobs, online: true })
      } catch {
        set({ online: false })
      }
    },
    openJob: async (id) => {
      history.replaceState(null, '', id ? `#job=${id}` : location.pathname)
      if (!id) {
        set({ jobId: null, job: null, meta: null, heightField: null, metrics: null, pins: [], gcps: [], probe: null })
        return
      }
      set({ jobId: id, loading: 'Reading job', error: null, pins: [], gcps: [], probe: null, hover: null, metrics: null })
      get().clearProfile()
      await get().reloadJob()
    },
    reloadJob: async () => {
      const id = get().jobId
      if (!id) return
      try {
        const job = await api.job(id)
        if (get().jobId !== id) return
        set({ job })
        if (job.status !== 'done' || !job.meta) {
          set({ meta: job.meta ?? null, heightField: null, loading: null })
          return
        }
        set({ loading: 'Loading surface model' })
        const name = job.meta.files.dsm ?? job.meta.files.rdsm
        const hf = await loadHeightField(api.fileUrl(id, name) + `?v=${Date.now()}`, job.meta)
        if (get().jobId !== id) return // another job was opened while this one downloaded
        const level = hf.hMin + (hf.hMax - hf.hMin) * 0.2
        set((s) => ({
          meta: job.meta!,
          heightField: hf,
          version: s.version + 1,
          loading: null,
          metrics: job.meta!.metrics ?? null,
          flood: { on: false, level },
          exaggeration: s.mode === 'analysis' ? 1 : s.exaggeration,
        }))
      } catch (e) {
        set({ error: (e as Error).message, loading: null })
      }
    },
    removeJob: async (id) => {
      await api.delete(id)
      if (get().jobId === id) await get().openJob(null)
      await get().refreshJobs()
    },
    setMode: (mode) => {
      const s = get()
      if (mode === 'analysis') set({ mode, savedExaggeration: s.exaggeration, exaggeration: 1 })
      else set({ mode, exaggeration: s.savedExaggeration ?? s.exaggeration })
    },
    set: (k, v) => set({ [k]: v } as Pick<State, typeof k>),
    setHover: (hover) => set({ hover }),
    setProbe: (probe) => set({ probe }),
    addPin: (p) => set((s) => ({ pins: [...s.pins, { ...p, id: pinSeq++ }] })),
    removePin: (id) => set((s) => ({ pins: s.pins.filter((p) => p.id !== id) })),
    clearPins: () => set({ pins: [] }),
    setProfilePoint: (xz) => {
      const { profile, heightField } = get()
      if (!heightField) return
      if (!profile.a || profile.b) {
        set({ profile: { a: xz, b: null, samples: [] } })
        return
      }
      import('./lib/terrain').then(({ profileAlong }) => {
        set({ profile: { a: profile.a, b: xz, samples: profileAlong(heightField, profile.a!, xz) } })
      })
    },
    clearProfile: () => set({ profile: { a: null, b: null, samples: [] } }),
    addGcp: (g) => set((s) => ({ gcps: [...s.gcps, { ...g, id: pinSeq++ }], pendingGcp: null })),
    removeGcp: (id) => set((s) => ({ gcps: s.gcps.filter((g) => g.id !== id) })),
    goTo: (name) => set((s) => ({ viewpointName: name, viewpoint: s.viewpoint + 1 })),
  })),
)

/** High-frequency camera telemetry for the HUD, kept out of React state. */
export interface Telemetry {
  x: number
  y: number
  z: number
  heading: number // degrees clockwise from north
  pitch: number
  altitude: number // above terrain, world units
  groundHeight: number // DSM value under the camera
  speed: number
  fps: number
}

export const telemetry: Telemetry = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, altitude: 0, groundHeight: NaN, speed: 0, fps: 0 }
export const telemetryListeners = new Set<(t: Telemetry) => void>()
export function publishTelemetry() {
  for (const l of telemetryListeners) l(telemetry)
}

if (import.meta.env.DEV) {
  window.__dw = { store: useStore, telemetry }
}
