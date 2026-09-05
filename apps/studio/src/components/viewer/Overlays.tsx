import { useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useStore } from '../../store'
import { heightToY, sampleHeight, type HeightField } from '../../lib/terrain'
import { fmt } from '../../lib/format'

function Marker({ x, y, z, color, size, label, onRemove }: { x: number; y: number; z: number; color: string; size: number; label?: string; onRemove?: () => void }) {
  const stem = size * 6
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, stem, 0]}>
        <sphereGeometry args={[size, 16, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Line points={[[0, 0, 0], [0, stem, 0]]} color={color} lineWidth={1.5} />
      {label && (
        <Html position={[0, stem + size * 2.5, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: onRemove ? 'auto' : 'none' }}>
          <div className="hud-chip num flex items-center gap-2 whitespace-nowrap px-2 py-1 text-[12px] text-ink" style={{ borderColor: color }}>
            <span>{label}</span>
            {onRemove && (
              <button onClick={onRemove} className="text-ink-3 hover:text-danger" aria-label="Remove marker">
                ×
              </button>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}

export function Overlays({ hf, size }: { hf: HeightField; size: number }) {
  const exaggeration = useStore((s) => s.exaggeration)
  const probe = useStore((s) => s.probe)
  const hover = useStore((s) => s.hover)
  const pins = useStore((s) => s.pins)
  const gcps = useStore((s) => s.gcps)
  const pendingGcp = useStore((s) => s.pendingGcp)
  const profile = useStore((s) => s.profile)
  const flood = useStore((s) => s.flood)
  const mode = useStore((s) => s.mode)
  const nav = useStore((s) => s.nav)
  const removePin = useStore((s) => s.removePin)
  const removeGcp = useStore((s) => s.removeGcp)
  const unit = hf.units === 'm' ? ' m' : ''
  const ms = Math.max(size * 0.004, 0.05)
  const y = (h: number) => heightToY(hf, h) * exaggeration
  const lift = ms * 0.5

  const profilePoints = useMemo(() => {
    if (profile.samples.length < 2) return null
    return profile.samples.filter((p) => Number.isFinite(p.h)).map((p) => {
      const t = p.t / profile.samples[profile.samples.length - 1].t
      const x = profile.a![0] + (profile.b![0] - profile.a![0]) * t
      const z = profile.a![1] + (profile.b![1] - profile.a![1]) * t
      return new THREE.Vector3(x, y(p.h) + lift, z)
    })
  }, [profile, exaggeration, hf, lift])

  return (
    <>
      {hover && nav === 'orbit' && !probe && (
        <mesh position={[hover.x, y(hover.h) + lift, hover.z]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[ms * 1.2, ms * 1.8, 32]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.8} toneMapped={false} depthTest={false} />
        </mesh>
      )}
      {probe && <Marker x={probe.x} y={y(probe.h)} z={probe.z} color="#22d3ee" size={ms} label={`${fmt(probe.h, 2)}${unit}`} />}
      {pins.map((p) => (
        <Marker key={p.id} x={p.x} y={y(p.h)} z={p.z} color="#e8edf2" size={ms * 0.8} label={`${fmt(p.h, 2)}${unit}`} onRemove={() => removePin(p.id)} />
      ))}
      {gcps.map((g) => (
        <Marker key={g.id} x={g.wx} y={y(sampleHeight(hf, g.col, g.row))} z={g.wz} color="#f5a524" size={ms} label={`GCP ${fmt(g.z, 2)} m`} onRemove={() => removeGcp(g.id)} />
      ))}
      {pendingGcp && (
        <Marker x={pendingGcp.x} y={y(sampleHeight(hf, pendingGcp.col, pendingGcp.row))} z={pendingGcp.z} color="#f5a524" size={ms} label="GCP: enter height" />
      )}
      {profile.a && (
        <mesh position={[profile.a[0], y(hf.hMin) + lift, profile.a[1]]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[ms * 1.4, 24]} />
          <meshBasicMaterial color="#f5a524" toneMapped={false} depthTest={false} />
        </mesh>
      )}
      {profilePoints && <Line points={profilePoints} color="#f5a524" lineWidth={2.5} depthTest={false} />}
      {flood.on && (
        <mesh position={[0, y(flood.level), 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[(hf.width - 1) * hf.dx * 1.02, (hf.height - 1) * hf.dy * 1.02]} />
          {mode === 'presentation' ? (
            <meshStandardMaterial color="#1c6fb0" transparent opacity={0.55} roughness={0.15} metalness={0.1} depthWrite={false} />
          ) : (
            <meshBasicMaterial color="#1c6fb0" transparent opacity={0.45} depthWrite={false} />
          )}
        </mesh>
      )}
    </>
  )
}
