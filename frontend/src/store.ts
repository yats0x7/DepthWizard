import { create } from 'zustand'
import type { GCP, Job, Meta, Metrics } from './lib/api'
import type { HeightField } from './lib/terrain'

export type Tool = 'none' | 'probe' | 'profile' | 'gcp'
export type Layer = 'texture' | 'hypsometric' | 'slope' | 'aspect'
export type ControlMode = 'orbit' | 'fly'

export interface Probe { col: number; row: number; height: number; slope: number; map: [number, number] | null }
export interface ProfilePoint { dist: number; height: number; col: number; row: number }

interface State {
  jobs: Job[]
  job: Job | null
  meta: Meta | null
  heightField: HeightField | null
  version: number // bumps when outputs are rewritten (recalibration)
  loading: string | null
  error: string | null

  tool: Tool
  layer: Layer
  controls: ControlMode
  wireframe: boolean
  exaggeration: number
  flood: number | null // absolute height in data units, null = off
  contours: boolean
  maxError: number
  sun: number // azimuth degrees

  hover: Probe | null
  pins: Probe[]
  profile: { a: Probe | null; b: Probe | null; points: ProfilePoint[] }
  gcps: GCP[]
  pendingGcp: Probe | null
  metrics: Metrics | null
  flyLocked: boolean

  set: (p: Partial<State>) => void
  reset: () => void
}

const initial = {
  jobs: [], job: null, meta: null, heightField: null, version: 0, loading: null, error: null,
  tool: 'probe' as Tool, layer: 'texture' as Layer, controls: 'orbit' as ControlMode, wireframe: false,
  exaggeration: 1.5, flood: null, contours: false, maxError: 1.2, sun: 315,
  hover: null, pins: [], profile: { a: null, b: null, points: [] }, gcps: [], pendingGcp: null, metrics: null, flyLocked: false,
}

export const useStore = create<State>((set) => ({
  ...initial,
  set: (p) => set(p),
  reset: () => set({ ...initial, tool: 'probe' }),
}))
