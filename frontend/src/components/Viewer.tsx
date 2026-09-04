import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line, OrbitControls, Sky, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { api } from '../lib/api'
import { buildTerrain, pixelToMap, pixelToWorld, sampleHeight, sampleSlope, worldToPixel, type HeightField } from '../lib/terrain'
import { useStore, type Probe } from '../store'
import { makeTerrainMaterial } from './TerrainMaterial'
import { FlyControls } from './FlyControls'

const LAYER_ID = { texture: 0, hypsometric: 1, slope: 2, aspect: 3 } as const

/** Geometry scale derived from the job meta and the (possibly downsampled) heightfield. */
export function useScale() {
  const meta = useStore((s) => s.meta)
  const hf = useStore((s) => s.heightField)
  const exaggeration = useStore((s) => s.exaggeration)
  return useMemo(() => {
    if (!meta || !hf) return null
    const [wh, ww] = meta.input.shape
    const hfToWorking = ww / hf.width
    const px = meta.units === 'm' && meta.input.pixel_size_m ? meta.input.pixel_size_m : [1, 1]
    const dx = px[0] * hfToWorking, dy = px[1] * (wh / hf.height)
    const vscale = meta.view.vertical_scale * exaggeration
    const size = Math.max(hf.width * dx, hf.height * dy)
    return { dx, dy, vscale, size, hfToWorking }
  }, [meta, hf, exaggeration])
}

function Terrain({ hf, textureUrl }: { hf: HeightField; textureUrl: string }) {
  const scale = useScale()!
  const { layer, wireframe, maxError, sun, contours, flood, tool, set, meta } = useStore()
  const texture = useTexture(textureUrl)
  const meshRef = useRef<THREE.Mesh>(null)
  const lastHover = useRef(0)

  useEffect(() => { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.needsUpdate = true }, [texture])

  const built = useMemo(() => buildTerrain(hf, scale.dx, scale.dy, scale.vscale, maxError * (scale.vscale / (meta?.view.vertical_scale ?? 1)) * (meta?.units === 'm' ? 1 : 0.02 * scale.size / 100)),
    [hf, scale.dx, scale.dy, scale.vscale, maxError, meta])
  const material = useMemo(() => makeTerrainMaterial(texture), [texture])

  useEffect(() => () => { built.geometry.dispose() }, [built])
  useEffect(() => () => { material.dispose() }, [material])

  useEffect(() => {
    const u = material.uniforms
    u.layer.value = LAYER_ID[layer]
    u.hMin.value = 0
    u.hMax.value = (hf.max - hf.min) * scale.vscale
    u.vscale.value = scale.vscale
    const az = THREE.MathUtils.degToRad(sun), alt = THREE.MathUtils.degToRad(40)
    u.sunDir.value.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt))
    const span = hf.max - hf.min
    u.contourStep.value = contours ? (meta?.units === 'm' ? niceStep(span) : span / 20) : 0
    u.flood.value = flood === null ? -1e9 : (flood - hf.min) * scale.vscale
    material.wireframe = wireframe
  }, [material, layer, sun, contours, flood, wireframe, hf, scale, meta])

  const probeAt = (p: THREE.Vector3): Probe => {
    const { col, row } = worldToPixel(p.x, p.z, hf, scale.dx, scale.dy)
    return {
      col, row, height: sampleHeight(hf, col, row), slope: sampleSlope(hf, col, row, scale.dx, scale.dy),
      map: pixelToMap(col, row, meta?.input.transform ?? null, scale.hfToWorking),
    }
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const now = performance.now()
    if (now - lastHover.current < 40) return
    lastHover.current = now
    set({ hover: probeAt(e.point) })
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return // drag, not click
    const p = probeAt(e.point)
    if (!Number.isFinite(p.height)) return
    const st = useStore.getState()
    if (tool === 'probe') set({ pins: [...st.pins, p].slice(-12) })
    else if (tool === 'gcp') set({ pendingGcp: p })
    else if (tool === 'profile') {
      if (!st.profile.a || st.profile.b) set({ profile: { a: p, b: null, points: [] } })
      else {
        const a = st.profile.a, n = 256, pts = []
        const worldLen = Math.hypot((p.col - a.col) * scale.dx, (p.row - a.row) * scale.dy)
        for (let i = 0; i <= n; i++) {
          const t = i / n, col = a.col + (p.col - a.col) * t, row = a.row + (p.row - a.row) * t
          pts.push({ dist: worldLen * t, height: sampleHeight(hf, col, row), col, row })
        }
        set({ profile: { a, b: p, points: pts } })
      }
    }
  }

  return (
    <mesh ref={meshRef} geometry={built.geometry} material={material} onPointerMove={onMove} onClick={onClick}
      onPointerOut={() => set({ hover: null })} />
  )
}

function niceStep(span: number): number {
  const raw = span / 15
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

function Marker({ p, color, label }: { p: Probe; color: string; label: string }) {
  const hf = useStore((s) => s.heightField)!
  const scale = useScale()!
  const pos = pixelToWorld(p.col, p.row, hf, scale.dx, scale.dy, scale.vscale)
  const r = scale.size / 300
  return (
    <group position={pos}>
      <mesh position={[0, r * 1.5, 0]}><sphereGeometry args={[r, 16, 16]} /><meshBasicMaterial color={color} /></mesh>
      <mesh position={[0, r * 0.75, 0]}><cylinderGeometry args={[r * 0.15, r * 0.15, r * 1.5, 8]} /><meshBasicMaterial color={color} /></mesh>
      <Html position={[0, r * 3, 0]} center distanceFactor={scale.size / 2} zIndexRange={[10, 0]}>
        <div className="px-1.5 py-0.5 rounded bg-black/70 text-[11px] font-mono whitespace-nowrap border" style={{ borderColor: color }}>{label}</div>
      </Html>
    </group>
  )
}

function Markers() {
  const { pins, profile, gcps, pendingGcp, meta, heightField: hf } = useStore()
  const scale = useScale()
  if (!hf || !scale) return null
  const unit = meta?.units === 'm' ? ' m' : ''
  const line = profile.points.length ? profile.points.map((q) => pixelToWorld(q.col, q.row, hf, scale.dx, scale.dy, scale.vscale).add(new THREE.Vector3(0, scale.size / 600, 0))) : null
  return (
    <>
      {pins.map((p, i) => <Marker key={`pin${i}`} p={p} color="#22d3ee" label={`${p.height.toFixed(1)}${unit}`} />)}
      {profile.a && <Marker p={profile.a} color="#fbbf24" label="A" />}
      {profile.b && <Marker p={profile.b} color="#fbbf24" label="B" />}
      {line && <Line points={line} color="#fbbf24" lineWidth={2} />}
      {gcps.map((g, i) => <Marker key={`gcp${i}`} p={{ col: g.col / scale.hfToWorking, row: g.row / scale.hfToWorking, height: g.z, slope: 0, map: null }} color="#34d399" label={`GCP ${g.z} m`} />)}
      {pendingGcp && <Marker p={pendingGcp} color="#f87171" label="new GCP" />}
    </>
  )
}

function FloodPlane() {
  const { flood, heightField: hf } = useStore()
  const scale = useScale()
  if (flood === null || !hf || !scale) return null
  const y = (flood - hf.min) * scale.vscale
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <planeGeometry args={[hf.width * scale.dx, hf.height * scale.dy]} />
      <meshPhysicalMaterial color="#1d6fd8" transparent opacity={0.45} roughness={0.15} metalness={0.1} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

function CameraRig({ size }: { size: number }) {
  const { camera } = useThree()
  const controls = useStore((s) => s.controls)
  useEffect(() => {
    camera.near = size / 4000
    camera.far = size * 30
    camera.position.set(size * 0.05, size * 0.55, size * 0.85)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size])
  useEffect(() => {
    if (controls === 'fly') {
      camera.position.y = Math.max(camera.position.y, size * 0.05)
    }
  }, [controls, camera, size])
  return null
}

export function Viewer() {
  const { job, meta, heightField: hf, controls, loading, error, set, version } = useStore()
  const scale = useScale()
  const [locked, setLocked] = useState(false)
  const ready = job && meta && hf && scale

  return (
    <div className="relative w-full h-full bg-[#0a0e13]">
      {ready ? (
        <Canvas dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true }}
          camera={{ fov: 55 }} onCreated={({ gl }) => { gl.setClearColor('#0a0e13') }}>
          <Sky sunPosition={[Math.sin(THREE.MathUtils.degToRad(useStore.getState().sun)) * 100, 45, -Math.cos(THREE.MathUtils.degToRad(useStore.getState().sun)) * 100]} turbidity={6} rayleigh={1.2} />
          <fog attach="fog" args={['#0a0e13', scale.size * 2, scale.size * 12]} />
          <CameraRig size={scale.size} />
          <Suspense fallback={<Html center><div className="text-sm text-muted">Loading texture…</div></Html>}>
            <Terrain hf={hf} textureUrl={api.fileUrl(job.id, 'texture.jpg', version)} />
          </Suspense>
          <Markers />
          <FloodPlane />
          {controls === 'orbit'
            ? <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={scale.size / 200} maxDistance={scale.size * 6} />
            : <FlyControls speed={scale.size / 6} onLock={(l) => { setLocked(l); set({ flyLocked: l }) }} />}
        </Canvas>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="text-2xl font-semibold bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">DepthWizard</div>
            <div className="text-sm text-muted mt-2">Upload a single optical satellite image to reconstruct a Digital Surface Model and fly through it in 3D.</div>
            {loading && <div className="text-sm text-accent mt-4 animate-pulse">{loading}</div>}
            {error && <div className="text-sm text-err mt-4">{error}</div>}
          </div>
        </div>
      )}
      {ready && controls === 'fly' && !locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="panel px-4 py-3 text-sm text-center pointer-events-auto">
            <div className="font-medium">Click the terrain to start flying</div>
            <div className="text-xs text-muted mt-1"><span className="kbd">W A S D</span> move · <span className="kbd">Q</span>/<span className="kbd">E</span> down/up · <span className="kbd">Shift</span> sprint · <span className="kbd">Esc</span> release</div>
          </div>
        </div>
      )}
      {loading && ready && <div className="absolute top-3 right-3 text-xs text-accent animate-pulse">{loading}</div>}
    </div>
  )
}
