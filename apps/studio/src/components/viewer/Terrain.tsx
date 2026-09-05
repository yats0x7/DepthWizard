import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { useStore, type Probe } from '../../store'
import { api } from '../../lib/api'
import { buildHeightTexture, buildTerrainGeometry, sampleHeight, sampleSlope, worldToPixel, type HeightField } from '../../lib/terrain'
import { LAYER_INDEX, makeTerrainMaterial, makeTerrainUniforms, sunDirection } from './TerrainMaterial'

export const PICK_MAX_SIDE = 448

export function probeAt(hf: HeightField, x: number, z: number): Probe | null {
  const [col, row] = worldToPixel(hf, x, z)
  const h = sampleHeight(hf, col, row)
  if (!Number.isFinite(h)) return null
  const { slope, aspect } = sampleSlope(hf, col, row)
  return { col, row, x, z, h, slope, aspect }
}

export function Terrain({ jobId, hf }: { jobId: string; hf: HeightField }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const mode = useStore((s) => s.mode)
  const layer = useStore((s) => s.layer)
  const wireframe = useStore((s) => s.wireframe)
  const contourStep = useStore((s) => s.contourStep)
  const flood = useStore((s) => s.flood)
  const sun = useStore((s) => s.sun)
  const exaggeration = useStore((s) => s.exaggeration)
  const tool = useStore((s) => s.tool)
  const nav = useStore((s) => s.nav)
  const meshDetail = useStore((s) => s.meshDetail)
  const gl = useThree((s) => s.gl)

  const texture = useTexture(api.fileUrl(jobId, 'texture.jpg'))
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    texture.needsUpdate = true
  }, [texture, gl])

  const built = useMemo(() => buildTerrainGeometry(hf, meshDetail), [hf, meshDetail])
  const heightTex = useMemo(() => buildHeightTexture(hf), [hf])
  const uniforms = useMemo(() => makeTerrainUniforms(hf, heightTex), [hf, heightTex])
  const material = useMemo(
    () => makeTerrainMaterial(mode === 'presentation' ? 'standard' : 'basic', texture, uniforms),
    [mode, texture, uniforms],
  )
  useEffect(() => () => built.geometry.dispose(), [built])
  useEffect(() => () => heightTex.dispose(), [heightTex])
  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    uniforms.uLayer.value = LAYER_INDEX[layer]
    uniforms.uContour.value = contourStep
    uniforms.uFlood.value = flood.level
    uniforms.uFloodOn.value = flood.on ? 1 : 0
    uniforms.uShade.value = mode === 'analysis' ? (layer === 'texture' ? 0.55 : 0.35) : 0
    uniforms.uTexMix.value = mode === 'analysis' ? 0.25 : 0.4
    sunDirection(mode === 'analysis' ? 315 : sun.azimuth, mode === 'analysis' ? 45 : sun.elevation, uniforms.uSun.value)
    uniforms.uVScale.value = hf.vscale * exaggeration
  }, [uniforms, layer, contourStep, flood, mode, sun, exaggeration, hf])

  // Picking runs against a coarse proxy grid with a BVH (built in well under a second) so the
  // 3M-triangle display mesh never stalls the page. Every readout still samples the DSM array.
  const pick = useMemo(() => {
    const g = buildTerrainGeometry(hf, PICK_MAX_SIDE).geometry
    ;(g as any).boundsTree = new MeshBVH(g)
    const m = new THREE.Mesh(g)
    m.raycast = acceleratedRaycast
    return m
  }, [hf])
  useEffect(() => () => pick.geometry.dispose(), [pick])
  const raycastProxy = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      if (!mesh.current) return
      pick.matrixWorld.copy(mesh.current.matrixWorld)
      const before = intersects.length
      ;(raycaster as any).firstHitOnly = true
      pick.raycast(raycaster, intersects)
      for (let i = before; i < intersects.length; i++) intersects[i].object = mesh.current
    },
    [pick],
  )

  const setHover = useStore((s) => s.setHover)
  const last = useRef(0)
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (nav !== 'orbit') return
    const now = performance.now()
    if (now - last.current < 33) return
    last.current = now
    setHover(probeAt(hf, e.point.x, e.point.z))
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (nav !== 'orbit' || e.delta > 4) return
    const p = probeAt(hf, e.point.x, e.point.z)
    if (!p) return
    const s = useStore.getState()
    if (tool === 'profile') s.setProfilePoint([p.x, p.z])
    else if (tool === 'gcp') s.set('pendingGcp', { col: p.col, row: p.row, x: p.x, z: p.z })
    else {
      s.setProbe(p)
      if (e.shiftKey) s.addPin(p)
    }
  }

  const presentation = mode === 'presentation'
  return (
    <group scale={[1, exaggeration, 1]}>
      <mesh
        ref={mesh}
        geometry={built.geometry}
        material={material}
        castShadow={presentation}
        receiveShadow={presentation}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={onClick}
        raycast={raycastProxy}
        frustumCulled={false}
      />
      {wireframe && mode === 'analysis' && (
        <mesh geometry={built.geometry} frustumCulled={false}>
          <meshBasicMaterial wireframe color="#22d3ee" transparent opacity={0.28} depthTest polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      )}
    </group>
  )
}
