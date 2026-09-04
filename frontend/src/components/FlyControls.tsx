import { useEffect, useRef, type ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'

/** First-person flythrough: WASD move, Q/E down/up, Shift sprint, mouse look (pointer lock). */
export function FlyControls({ speed, onLock }: { speed: number; onLock?: (locked: boolean) => void }) {
  const ref = useRef<ComponentRef<typeof PointerLockControls>>(null)
  const keys = useRef<Record<string, boolean>>({})
  const vel = useRef(new THREE.Vector3())
  const { camera } = useThree()

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (!(e.target as HTMLElement)?.closest?.('input,textarea,select')) keys.current[e.code] = true }
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  useFrame((_, dt) => {
    const k = keys.current
    const locked = ref.current?.isLocked
    if (!locked) return
    const s = speed * (k.ShiftLeft || k.ShiftRight ? 3.5 : 1)
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize()
    const want = new THREE.Vector3()
    if (k.KeyW || k.ArrowUp) want.add(dir)
    if (k.KeyS || k.ArrowDown) want.sub(dir)
    if (k.KeyD || k.ArrowRight) want.add(right)
    if (k.KeyA || k.ArrowLeft) want.sub(right)
    if (k.KeyE || k.Space) want.y += 1
    if (k.KeyQ || k.KeyC) want.y -= 1
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(s)
    vel.current.lerp(want, Math.min(1, dt * 8)) // smooth acceleration
    camera.position.addScaledVector(vel.current, dt)
  })

  return <PointerLockControls ref={ref} makeDefault onLock={() => onLock?.(true)} onUnlock={() => onLock?.(false)} />
}
