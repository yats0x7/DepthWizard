import { useEffect, useRef } from 'react'
import { Crosshair, Eye, Layers, Lock, Mountain, MousePointer2, Navigation } from 'lucide-react'
import { useStore } from '../../store'
import { useTelemetry } from '../../lib/useTelemetry'
import { compass, fmt } from '../../lib/format'
import { api } from '../../lib/api'
import { pixelToMap, worldToPixel } from '../../lib/terrain'
import { Kbd, Segmented } from '../ui'
import { cn } from '../../lib/cn'

export function ModeSwitch({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  return (
    <Segmented
      id="mode"
      size={size}
      value={mode}
      onChange={setMode}
      options={[
        { value: 'presentation', label: (<><Eye size={15} /> Presentation</>), title: 'Cinematic lighting, shadows and effects (Tab)' },
        { value: 'analysis', label: (<><Crosshair size={15} /> Analysis</>), title: 'Flat lighting, exact heights, no effects (Tab)' },
      ]}
    />
  )
}

function Readout() {
  const hover = useStore((s) => s.hover)
  const probe = useStore((s) => s.probe)
  const hf = useStore((s) => s.heightField)
  const meta = useStore((s) => s.meta)
  const p = hover ?? probe
  if (!hf || !meta) return null
  const unit = hf.units === 'm' ? 'm' : ''
  const prior = meta.calibration.mode === 'prior'
  const source =
    meta.units === 'm'
      ? prior
        ? 'estimated metres, the zero point is arbitrary'
        : 'real metres, anchored to an elevation map'
      : 'relative height, 0 to 1, no real-world scale'
  return (
    <div className="hud-chip flex min-w-56 flex-col gap-1 px-3 py-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="label">{hover ? 'Under cursor' : probe ? 'Probe' : 'Height'}</span>
        <span className="text-[11px] text-ink-3">{p ? `px ${Math.round(p.col)}, ${Math.round(p.row)}` : ''}</span>
      </div>
      <div className={cn('num text-[22px] leading-none', prior ? 'text-accent' : 'text-ink')}>
        {p ? fmt(p.h, hf.units === 'm' ? 2 : 3) : '—'}
        <span className="ml-1 text-[12px] text-ink-3">{unit}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-[12px] text-ink-3">
        <span>{source}</span>
        {p && meta.input.georeferenced && Number.isFinite(p.slope) && <span className="num">{fmt(p.slope, 1)}° {compass(p.aspect)}</span>}
      </div>
    </div>
  )
}

function CompassRose() {
  const t = useTelemetry(20)
  const hf = useStore((s) => s.heightField)
  const unit = hf?.units === 'm' ? 'm' : ''
  return (
    <div className="hud-chip flex items-center gap-3 px-3 py-2">
      <div className="relative h-11 w-11 shrink-0">
        <svg viewBox="0 0 44 44" className="h-11 w-11">
          <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" className="text-line-2" strokeWidth="1" />
          <g style={{ transform: `rotate(${-t.heading}deg)`, transformOrigin: '22px 22px', transition: 'transform 120ms linear' }}>
            <polygon points="22,5 25.5,22 22,19 18.5,22" fill="#f26d6d" />
            <polygon points="22,39 25.5,22 22,25 18.5,22" fill="#7f8fa1" />
            <text x="22" y="4" textAnchor="middle" fontSize="6" fill="#e8edf2" fontFamily="Inter Variable">N</text>
          </g>
          <polygon points="22,1 24,6 20,6" fill="#22d3ee" />
        </svg>
      </div>
      <div className="flex flex-col gap-0.5 leading-none">
        <div className="num text-[15px] text-ink">
          {Math.round(t.heading).toString().padStart(3, '0')}° <span className="text-[11px] text-ink-3">{compass(t.heading)}</span>
        </div>
        <div className="num text-[11px] text-ink-2">
          alt <span className="text-ink">{fmt(t.altitude, hf?.units === 'm' ? 1 : 2)}</span>
          {unit} <span className="ml-1 text-ink-3">above surface</span>
        </div>
        <div className="num text-[11px] text-ink-3">
          ground {fmt(t.groundHeight, hf?.units === 'm' ? 1 : 3)}
          {unit} · {Math.round(t.fps)} fps
        </div>
      </div>
    </div>
  )
}

function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLImageElement | null>(null)
  const jobId = useStore((s) => s.jobId)
  const version = useStore((s) => s.version)
  const hf = useStore((s) => s.heightField)
  const t = useTelemetry(15)
  const W = 168

  useEffect(() => {
    if (!jobId) return
    const im = new Image()
    im.src = api.fileUrl(jobId, 'preview.png') + `?v=${version}`
    im.onload = () => {
      img.current = im
    }
    return () => {
      img.current = null
    }
  }, [jobId, version])

  useEffect(() => {
    const c = canvas.current
    if (!c || !hf) return
    const aspect = hf.height / hf.width
    const H = Math.round(W * aspect)
    if (c.width !== W * 2 || c.height !== H * 2) {
      c.width = W * 2
      c.height = H * 2
    }
    const ctx = c.getContext('2d')!
    ctx.setTransform(2, 0, 0, 2, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (img.current) ctx.drawImage(img.current, 0, 0, W, H)
    else {
      ctx.fillStyle = '#151d27'
      ctx.fillRect(0, 0, W, H)
    }
    const [col, row] = worldToPixel(hf, t.x, t.z)
    const px = (col / (hf.width - 1)) * W
    const py = (row / (hf.height - 1)) * H
    // view cone
    const rad = (t.heading * Math.PI) / 180
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(rad)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, 26, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5)
    ctx.closePath()
    ctx.fillStyle = 'rgba(34, 211, 238, 0.28)'
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.arc(px, py, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = '#22d3ee'
    ctx.fill()
    ctx.strokeStyle = '#0b1016'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [t, hf])

  if (!hf) return null
  const H = Math.round(W * (hf.height / hf.width))
  return (
    <div className="hud-chip overflow-hidden p-1">
      <canvas ref={canvas} style={{ width: W, height: H, display: 'block', borderRadius: 7 }} aria-label="Minimap" />
    </div>
  )
}

function CoordChip() {
  const hover = useStore((s) => s.hover)
  const probe = useStore((s) => s.probe)
  const hf = useStore((s) => s.heightField)
  const p = hover ?? probe
  if (!hf || !p || !hf.transform) return null
  const m = pixelToMap(hf, p.col, p.row)
  if (!m) return null
  return (
    <div className="hud-chip num px-2.5 py-1 text-[11px] text-ink-2">
      E {fmt(m[0], 1)} · N {fmt(m[1], 1)}
      {hf.epsg ? <span className="text-ink-3"> · EPSG:{hf.epsg}</span> : null}
    </div>
  )
}

const LAYER_NAME: Record<string, string> = {
  texture: 'Photo', hypsometric: 'Height', slope: 'Steepness', aspect: 'Facing', hillshade: 'Relief',
}

const TURBO = 'linear-gradient(90deg,#30123b,#4662d7,#36aaf9,#1ae4b6,#72fe5e,#c8ef34,#faba39,#f66b19,#ca2a04,#7a0403)'
const VIRIDIS = 'linear-gradient(90deg,#440154,#414487,#2a788e,#22a884,#7ad151,#fde725)'
const ASPECT = 'linear-gradient(90deg,#f2400f,#f2f20f,#0ff20f,#0ff2f2,#0f0ff2,#f20ff2,#f2400f)'

function Legend() {
  const layer = useStore((s) => s.layer)
  const hf = useStore((s) => s.heightField)
  if (!hf || layer === 'texture') return null
  const unit = hf.units === 'm' ? ' m' : ''
  const spec =
    layer === 'hypsometric'
      ? { bg: TURBO, lo: `${fmt(hf.hMin, hf.units === 'm' ? 1 : 2)}${unit}`, hi: `${fmt(hf.hMax, hf.units === 'm' ? 1 : 2)}${unit}`, title: 'Height' }
      : layer === 'slope'
        ? { bg: VIRIDIS, lo: '0°', hi: '60°', title: 'Slope' }
        : layer === 'aspect'
          ? { bg: ASPECT, lo: 'N  E  S  W  N', hi: '', title: 'Aspect (downslope)' }
          : { bg: 'linear-gradient(90deg,#1f1f1f,#ffffff)', lo: 'shadow', hi: 'lit', title: 'Relief from NW sun' }
  return (
    <div className="hud-chip flex w-44 flex-col gap-1 px-2.5 py-2">
      <span className="label">{spec.title}</span>
      <div className="h-2 rounded-full" style={{ background: spec.bg }} />
      <div className="num flex justify-between text-[10px] text-ink-2">
        <span className={layer === 'aspect' ? 'w-full text-center tracking-[0.35em]' : ''}>{spec.lo}</span>
        <span>{spec.hi}</span>
      </div>
    </div>
  )
}

export function HUD() {
  const mode = useStore((s) => s.mode)
  const nav = useStore((s) => s.nav)
  const exaggeration = useStore((s) => s.exaggeration)
  const layer = useStore((s) => s.layer)
  const showMinimap = useStore((s) => s.showMinimap)
  const hf = useStore((s) => s.heightField)
  const tool = useStore((s) => s.tool)
  if (!hf) return null
  const locked = nav !== 'orbit'
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="pointer-events-auto rise">
          <ModeSwitch />
        </div>
        {locked && (
          <div className="hud-chip flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-[12px] text-ink-2">
            <span>Click to capture mouse</span>
            <Kbd>W</Kbd>
            <Kbd>A</Kbd>
            <Kbd>S</Kbd>
            <Kbd>D</Kbd>
            <span>move</span>
            {nav === 'fly' && (
              <>
                <Kbd>Q</Kbd>
                <Kbd>E</Kbd>
                <span>height</span>
              </>
            )}
            <Kbd>Shift</Kbd>
            <span>fast</span>
            <Kbd>Esc</Kbd>
            <span>release</span>
          </div>
        )}
      </div>

      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className={cn('hud-chip flex items-center gap-2 px-2.5 py-1.5 text-[12px]', exaggeration !== 1 ? 'text-accent' : 'text-ink-2')}>
          <Mountain size={14} />
          <span className="num">×{exaggeration.toFixed(2)}</span>
          <span className="text-ink-3">vertical</span>
          {mode === 'analysis' && <Lock size={12} className="text-ink-3" />}
        </div>
        <div className="hud-chip flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] text-ink-2">
          <Layers size={14} />
          <span>{LAYER_NAME[layer]}</span>
        </div>
        <div className="hud-chip flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-ink-2">
          {locked ? <Navigation size={14} /> : <MousePointer2 size={14} />}
          <span className="capitalize">{nav}</span>
          {nav === 'orbit' && <span className="text-ink-3">· {tool}</span>}
        </div>
        <Legend />
      </div>

      {locked && (
        <>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg width="28" height="28" viewBox="0 0 28 28" className="text-accent drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]">
              <circle cx="14" cy="14" r="1.6" fill="currentColor" />
              <path d="M14 3v6M14 19v6M3 14h6M19 14h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}

      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        <CoordChip />
        <Readout />
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
        {showMinimap && <Minimap />}
        <CompassRose />
      </div>
    </div>
  )
}
