import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { useStore, type Probe } from '../../store'
import { api } from '../../lib/api'
import { buildHeightTexture, buildTerrainGeometry, heightToY, sampleHeight, sampleHeightWorld, sampleSlope, worldToPixel, type HeightField } from '../../lib/terrain'
import { LAYER_INDEX, makeTerrainMaterial, makeTerrainUniforms, sunDirection } from './TerrainMaterial'

export const PICK_MAX_SIDE = 448

export function probeAt(hf: HeightField, x: number, z: number): Probe | null {
  const [col, row] = worldToPixel(hf, x, z)
  const h = sampleHeight(hf, col, row)
  if (!Number.isFinite(h)) return null
  const { slope, aspect } = sampleSlope(hf, col, row)
  return { col, row, x, z, h, slope, aspect }
}

/**
 * The proxy hit is only accurate to its stride. March the full-resolution DSM along the ray from a
 * little before the proxy hit so the reported x/z lands on the true first surface crossing.
 */
function refineHit(hit: THREE.Intersection, ray: THREE.Ray, hf: HeightField, exaggeration: number, stride: number) {
  const back = stride * Math.max(hf.dx, hf.dy) * 2.5
  const step = Math.min(hf.dx, hf.dy) * 0.5
  const t0 = Math.max(0, hit.distance - back)
  const p = new THREE.Vector3()
  let prevT = t0
  for (let t = t0; t <= hit.distance + back; t += step) {
    ray.at(t, p)
    const h = sampleHeightWorld(hf, p.x, p.z)
    if (Number.isFinite(h) && p.y <= heightToY(hf, h) * exaggeration) {
      ray.at(0.5 * (prevT + t), hit.point)
      hit.distance = 0.5 * (prevT + t)
      return
    }
    prevT = t
  }
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
    // Analysis: colour layers are exact values (no shading); the image layer keeps a hillshade for relief
    uniforms.uShade.value = mode === 'analysis' && layer === 'texture' ? 0.55 : 0
    uniforms.uTexMix.value = mode === 'analysis' ? 0.25 : 0.4
    sunDirection(mode === 'analysis' ? 315 : sun.azimuth, mode === 'analysis' ? 45 : sun.elevation, uniforms.uSun.value)
    uniforms.uVScale.value = hf.vscale // slope and shading never include the display exaggeration
  }, [uniforms, layer, contourStep, flood, mode, sun, exaggeration, hf])

  // Picking runs against a coarse proxy grid with a BVH (built in well under a second) so the
  // 3M-triangle display mesh never stalls the page. Every readout still samples the DSM array.
  const pickStride = Math.max(1, Math.ceil(Math.max(hf.width, hf.height) / PICK_MAX_SIDE))
  const pick = useMemo(() => {
    const g = buildTerrainGeometry(hf, PICK_MAX_SIDE).geometry
    ;(g as THREE.BufferGeometry & { boundsTree?: MeshBVH }).boundsTree = new MeshBVH(g)
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
      ;(raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
      pick.raycast(raycaster, intersects)
      for (let i = before; i < intersects.length; i++) {
        intersects[i].object = mesh.current
        refineHit(intersects[i], raycaster.ray, hf, exaggeration, pickStride)
      }
    },
    [pick, hf, exaggeration, pickStride],
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
          <meshBasicMaterial wireframe color="#e5a13c" transparent opacity={0.28} depthTest polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      )}
    </group>
  )
}
