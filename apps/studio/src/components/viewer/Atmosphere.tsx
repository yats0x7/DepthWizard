import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useStore } from '../../store'
import { sunDirection } from './TerrainMaterial'
import { SkyDome, skyPalette } from './SkyDome'


/** Presentation sky, sun, shadows and fog. */
export function Presentation({ size, relief }: { size: number; relief: number }) {
  const sun = useStore((s) => s.sun)
  const shadows = useStore((s) => s.shadows)
  const light = useRef<THREE.DirectionalLight>(null!)
  const scene = useThree((s) => s.scene)
  const dir = useMemo(() => sunDirection(sun.azimuth, sun.elevation), [sun])
  const palette = useMemo(() => skyPalette(sun.elevation), [sun.elevation])
  const horizon = palette.horizon
  const sunCol = palette.sun
  const shadowMap = 3072

  useEffect(() => {
    const l = light.current
    if (!l) return
    const cam = l.shadow.camera
    const half = size * 0.62
    cam.left = -half
    cam.right = half
    cam.top = half
    cam.bottom = -half
    cam.near = size * 0.1
    cam.far = size * 4
    cam.updateProjectionMatrix()
    l.shadow.bias = -0.00015
    l.shadow.normalBias = Math.max(size * 0.0006, 0.02)
    l.shadow.needsUpdate = true
  }, [size, relief])

  useEffect(() => {
    scene.fog = new THREE.Fog(horizon, size * 2.2, size * 14)
    return () => {
      scene.fog = null
    }
  }, [scene, horizon, size])

  return (
    <>
      <SkyDome radius={size * 18} sunDir={dir} elevation={sun.elevation} />
      <hemisphereLight args={[palette.zenith.clone().lerp(palette.horizon, 0.5), palette.ground, 1.1]} />
      <ambientLight intensity={0.15} />
      <directionalLight
        ref={light}
        position={[dir.x * size * 1.8, dir.y * size * 1.8, dir.z * size * 1.8]}
        intensity={3.0}
        color={sunCol}
        castShadow={shadows}
        shadow-mapSize={[shadowMap, shadowMap]}
        shadow-radius={2}
      />
    </>
  )
}

/** Analysis: neutral, flat and quiet. */
export function AnalysisBackdrop() {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.fog = null
  }, [scene])
  return <color attach="background" args={['#14120f']} />
}
