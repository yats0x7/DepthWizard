import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../store'
import { fmt } from '../lib/terrain'

export function ProfileChart() {
  const { profile, meta, set } = useStore()
  const unit = meta?.units === 'm' ? 'm' : ''
  if (!profile.points.length) {
    return <div className="text-xs text-muted">Select the <b>Profile</b> tool and click two points on the terrain to draw a cross-section.</div>
  }
  const hs = profile.points.map((p) => p.height).filter(Number.isFinite)
  const min = Math.min(...hs), max = Math.max(...hs)
  const len = profile.points[profile.points.length - 1].dist
  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-1">
        <span>Length {fmt(len, 0)} {unit || 'px'}</span><span>Δh {fmt(max - min)} {unit}</span>
      </div>
      <div className="h-40">
        <ResponsiveContainer>
          <AreaChart data={profile.points} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" stopOpacity={0.6} /><stop offset="100%" stopColor="#fbbf24" stopOpacity={0.05} /></linearGradient></defs>
            <CartesianGrid stroke="#223041" strokeDasharray="3 3" />
            <XAxis dataKey="dist" tick={{ fontSize: 10, fill: '#8b9bb0' }} tickFormatter={(v) => fmt(v, 0)} />
            <YAxis domain={[min, max]} tick={{ fontSize: 10, fill: '#8b9bb0' }} tickFormatter={(v) => fmt(v, 0)} />
            <Tooltip contentStyle={{ background: '#111820', border: '1px solid #223041', fontSize: 12 }}
              formatter={(v) => [`${fmt(Number(v))} ${unit}`, 'height']} labelFormatter={(v) => `${fmt(Number(v), 0)} ${unit || 'px'} along`} />
            <Area type="monotone" dataKey="height" stroke="#fbbf24" fill="url(#pg)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <button className="btn mt-2 text-xs" onClick={() => set({ profile: { a: null, b: null, points: [] } })}>Clear profile</button>
    </div>
  )
}
