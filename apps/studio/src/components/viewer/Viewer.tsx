import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { useStore } from '../../store'
import { fieldSize } from '../../lib/terrain'
import { Terrain } from './Terrain'
import { AnalysisBackdrop, Presentation } from './Atmosphere'
import { Effects } from './Effects'
import { Overlays } from './Overlays'
import { CameraRig } from './CameraRig'

function RendererConfig() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const mode = useStore((s) => s.mode)
  const effects = useStore((s) => s.effects)
  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    // Presentation: ACES in the composer when effects are on, otherwise on the renderer.
    // Analysis: no tone mapping at all so colours are exactly the layer values.
    gl.toneMapping = mode === 'presentation' && !effects ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
    gl.toneMappingExposure = 1.0
    if (import.meta.env.DEV) window.__dw = { ...window.__dw, gl, scene }
  }, [gl, scene, mode, effects])
  return null
}

export function Viewer() {
  const hf = useStore((s) => s.heightField)
  const jobId = useStore((s) => s.jobId)
  const mode = useStore((s) => s.mode)
  const effects = useStore((s) => s.effects)
  const dims = useMemo(() => (hf ? fieldSize(hf) : null), [hf])
  if (!hf || !jobId || !dims) return null
  const presentation = mode === 'presentation'
  return (
    <Canvas
      key={jobId}
      shadows={presentation ? 'soft' : false}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: false, stencil: false }}
      camera={{ fov: 58, near: 0.05, far: 5000, position: [dims.sx * 0.55, dims.size * 0.42, dims.sz * 0.75] }}
      onCreated={({ gl, size }) => {
        if (import.meta.env.DEV) console.info('[dw] canvas', size.width, size.height)
        gl.setClearColor('#0e141b')
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          console.warn('WebGL context lost; waiting for restore')
        })
        gl.domElement.addEventListener('webglcontextrestored', () => console.info('WebGL context restored'))
      }}
    >
      <RendererConfig />
      <Suspense fallback={null}>
        <Terrain jobId={jobId} hf={hf} />
      </Suspense>
      {presentation ? <Presentation size={dims.size} relief={dims.relief} /> : <AnalysisBackdrop />}
      <Overlays hf={hf} size={dims.size} />
      <CameraRig hf={hf} size={dims.size} relief={dims.relief} />
      {presentation && effects && <Effects size={dims.size} />}
    </Canvas>
  )
}
