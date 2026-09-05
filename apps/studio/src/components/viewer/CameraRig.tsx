/**
 * Camera navigation: orbit (mouse), fly (pointer lock, WASD, momentum) and walk (eye height
 * clamped to the DSM by bilinear sampling, gentle head-bob in Presentation mode). Also drives
 * eased viewpoint transitions and publishes HUD telemetry every frame.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { ComponentRef } from 'react'
import { publishTelemetry, telemetry, useStore } from '../../store'
import { heightToY, sampleHeightWorld, type HeightField } from '../../lib/terrain'
import { probeAt } from './Terrain'

const EASE = (t: number) => 1 - Math.pow(2, -10 * Math.min(1, t)) // expo out
const KEYS: Record<string, string> = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right', KeyE: 'up', Space: 'up', KeyQ: 'down', KeyC: 'down', ShiftLeft: 'fast', ShiftRight: 'fast',
}

interface Pose {
  position: THREE.Vector3
  target: THREE.Vector3
}

function viewpointPose(name: string, hf: HeightField, size: number, relief: number, exaggeration: number): Pose {
  const sx = (hf.width - 1) * hf.dx
  const sz = (hf.height - 1) * hf.dy
  const mid = relief * exaggeration * 0.35
  const target = new THREE.Vector3(0, mid, 0)
  switch (name) {
    case 'overview':
      return { position: new THREE.Vector3(sx * 0.05, size * 1.1, sz * 0.9), target }
    case 'top':
      return { position: new THREE.Vector3(0, size * 1.35, 0.0001), target }
    case 'street': {
      const x = 0
      const z = sz * 0.35
      const h = sampleHeightWorld(hf, x, z)
      const eye = Number.isFinite(h) ? heightToY(hf, h) * exaggeration : mid
      return { position: new THREE.Vector3(x, eye + Math.max(size * 0.03, 2) * exaggeration, z), target: new THREE.Vector3(0, eye, -sz * 0.2) }
    }
    default:
      return { position: new THREE.Vector3(sx * 0.35, size * 0.55, sz * 1.05), target }
  }
}

export function CameraRig({ hf, size, relief }: { hf: HeightField; size: number; relief: number }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const nav = useStore((s) => s.nav)
  const mode = useStore((s) => s.mode)
  const exaggeration = useStore((s) => s.exaggeration)
  const viewpoint = useStore((s) => s.viewpoint)
  const viewpointName = useStore((s) => s.viewpointName)
  const orbit = useRef<ComponentRef<typeof OrbitControls>>(null)
  const keys = useRef<Set<string>>(new Set())
  const vel = useRef(new THREE.Vector3())
  const yaw = useRef(0)
  const pitch = useRef(0)
  const yawT = useRef(0)
  const pitchT = useRef(0)
  const locked = useRef(false)
  const bob = useRef(0)
  const transition = useRef<{ from: Pose; to: Pose; t0: number; dur: number } | null>(null)
  const fps = useRef({ frames: 0, t: 0 })
  const lastProbe = useRef(0)
  const orbitTarget = useMemo(() => new THREE.Vector3(0, relief * exaggeration * 0.35, 0), [relief, exaggeration])

  // camera frustum tuned to the scene; no logarithmic depth buffer (custom shader), tight near/far
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.near = Math.max(size * 0.0006, 0.02)
    cam.far = size * 40
    cam.fov = 58
    cam.updateProjectionMatrix()
  }, [camera, size])

  // start pose + transitions
  useEffect(() => {
    const to = viewpointPose(viewpointName, hf, size, relief, exaggeration)
    const from: Pose = { position: camera.position.clone(), target: orbit.current?.target.clone() ?? camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(size)) }
    if (viewpoint === 0) {
      camera.position.copy(to.position)
      camera.lookAt(to.target)
      orbit.current?.target.copy(to.target)
      syncAnglesFromCamera()
      return
    }
    transition.current = { from, to, t0: performance.now(), dur: 1400 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewpoint, hf])

  function syncAnglesFromCamera() {
    const dir = camera.getWorldDirection(new THREE.Vector3())
    yaw.current = yawT.current = Math.atan2(-dir.x, -dir.z)
    pitch.current = pitchT.current = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))
  }

  // pointer lock + keys for fly / walk
  useEffect(() => {
    if (nav === 'orbit') {
      locked.current = false
      if (document.pointerLockElement) document.exitPointerLock()
      return
    }
    syncAnglesFromCamera()
    const el = gl.domElement
    const onClick = () => {
      if (!document.pointerLockElement) el.requestPointerLock()
    }
    const onLock = () => {
      locked.current = document.pointerLockElement === el
      useStore.getState().set('hover', null)
    }
    const onMouse = (e: MouseEvent) => {
      if (!locked.current) return
      const sens = 0.0022
      yawT.current -= e.movementX * sens
      pitchT.current = THREE.MathUtils.clamp(pitchT.current - e.movementY * sens, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05)
    }
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const k = KEYS[e.code]
      if (k) {
        keys.current.add(k)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.code]
      if (k) keys.current.delete(k)
    }
    const blur = () => keys.current.clear()
    el.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onLock)
    document.addEventListener('mousemove', onMouse)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      el.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onLock)
      document.removeEventListener('mousemove', onMouse)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      keys.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, gl])

  const tmpDir = useMemo(() => new THREE.Vector3(), [])
  const tmpRight = useMemo(() => new THREE.Vector3(), [])
  const accel = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const cam = camera
    const tr = transition.current
    if (tr) {
      const k = EASE((performance.now() - tr.t0) / tr.dur)
      cam.position.lerpVectors(tr.from.position, tr.to.position, k)
      const look = tr.from.target.clone().lerp(tr.to.target, k)
      cam.lookAt(look)
      orbit.current?.target.copy(look)
      if (k >= 0.999) {
        transition.current = null
        syncAnglesFromCamera()
      }
    } else if (nav !== 'orbit') {
      // damped look
      const s = 1 - Math.exp(-dt * 18)
      yaw.current += (yawT.current - yaw.current) * s
      pitch.current += (pitchT.current - pitch.current) * s
      cam.rotation.set(0, 0, 0)
      cam.quaternion.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, 'YXZ'))
      // momentum
      const k = keys.current
      const fast = k.has('fast') ? 3.5 : 1
      const base = size * (nav === 'walk' ? 0.06 : 0.18) * fast
      cam.getWorldDirection(tmpDir)
      if (nav === 'walk') {
        tmpDir.y = 0
        tmpDir.normalize()
      }
      tmpRight.crossVectors(tmpDir, cam.up).normalize()
      accel.set(0, 0, 0)
      if (k.has('forward')) accel.add(tmpDir)
      if (k.has('back')) accel.sub(tmpDir)
      if (k.has('right')) accel.add(tmpRight)
      if (k.has('left')) accel.sub(tmpRight)
      if (nav === 'fly') {
        if (k.has('up')) accel.y += 1
        if (k.has('down')) accel.y -= 1
      }
      if (accel.lengthSq() > 0) accel.normalize().multiplyScalar(base)
      const damp = 1 - Math.exp(-dt * (accel.lengthSq() > 0 ? 6 : 4))
      vel.current.lerp(accel, damp)
      cam.position.addScaledVector(vel.current, dt)
      // keep inside a generous bounding box
      const lim = size * 3
      cam.position.x = THREE.MathUtils.clamp(cam.position.x, -lim, lim)
      cam.position.z = THREE.MathUtils.clamp(cam.position.z, -lim, lim)
      const ground = sampleHeightWorld(hf, cam.position.x, cam.position.z)
      const groundY = Number.isFinite(ground) ? heightToY(hf, ground) * exaggeration : 0
      if (nav === 'walk') {
        const eye = Math.max(size * 0.012, 1.7) * (hf.units === 'm' ? 1 : exaggeration)
        const speedFrac = Math.min(1, vel.current.length() / (size * 0.06))
        bob.current += dt * 9 * speedFrac
        const bobAmt = mode === 'presentation' ? Math.sin(bob.current) * eye * 0.035 * speedFrac : 0
        const targetY = groundY + eye + bobAmt
        cam.position.y += (targetY - cam.position.y) * (1 - Math.exp(-dt * 12))
      } else {
        const minY = groundY + Math.max(size * 0.004, 0.3)
        if (cam.position.y < minY) cam.position.y = minY
        cam.position.y = Math.min(cam.position.y, size * 6)
      }
      // crosshair probe at ~12 Hz
      const now = performance.now()
      if (locked.current && now - lastProbe.current > 80) {
        lastProbe.current = now
        const hit = raycastCenter(cam, hf, size, exaggeration)
        useStore.getState().setHover(hit)
      }
    }

    // telemetry
    cam.getWorldDirection(tmpDir)
    const heading = ((Math.atan2(tmpDir.x, -tmpDir.z) * 180) / Math.PI + 360) % 360
    const ground = sampleHeightWorld(hf, cam.position.x, cam.position.z)
    telemetry.x = cam.position.x
    telemetry.y = cam.position.y
    telemetry.z = cam.position.z
    telemetry.heading = heading
    telemetry.pitch = (Math.asin(THREE.MathUtils.clamp(tmpDir.y, -1, 1)) * 180) / Math.PI
    telemetry.groundHeight = ground
    telemetry.altitude = Number.isFinite(ground) ? cam.position.y / exaggeration / hf.vscale - (ground - hf.hMin) : NaN
    telemetry.speed = nav === 'orbit' ? 0 : vel.current.length()
    const f = fps.current
    f.frames++
    f.t += dtRaw
    if (f.t >= 0.5) {
      telemetry.fps = f.frames / f.t
      f.frames = 0
      f.t = 0
    }
    publishTelemetry()
  })

  return nav === 'orbit' ? (
    <OrbitControls
      ref={orbit}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.9}
      panSpeed={0.8}
      target={orbitTarget}
      minDistance={Math.max(size * 0.005, 0.2)}
      maxDistance={size * 8}
      maxPolarAngle={Math.PI / 2 - 0.01}
      enabled={!transition.current}
    />
  ) : null
}

/** Ray from the screen centre to the terrain by marching the DSM (no mesh needed). */
function raycastCenter(cam: THREE.Camera, hf: HeightField, size: number, exaggeration: number) {
  const dir = cam.getWorldDirection(new THREE.Vector3())
  const p = cam.position.clone()
  const step = Math.max(size * 0.0015, 0.02)
  const maxT = size * 6
  let prev = p.clone()
  for (let t = 0; t < maxT; t += step) {
    const q = p.clone().addScaledVector(dir, t)
    const h = sampleHeightWorld(hf, q.x, q.z)
    if (Number.isFinite(h)) {
      const gy = heightToY(hf, h) * exaggeration
      if (q.y <= gy) {
        // refine between prev and q
        const mid = prev.clone().lerp(q, 0.5)
        return probeAt(hf, mid.x, mid.z)
      }
    } else if (Math.abs(q.x) > size || Math.abs(q.z) > size) {
      return null
    }
    prev = q
  }
  return null
}
