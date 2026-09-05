import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProfileSample } from '../../lib/terrain'
import { fmt } from '../../lib/format'

export function ProfileChart({ samples, unit }: { samples: ProfileSample[]; unit: string }) {
  const data = samples.filter((p) => Number.isFinite(p.h)).map((p) => ({ t: p.t, h: p.h }))
  if (data.length < 2) return null
  const hs = data.map((d) => d.h)
  const lo = Math.min(...hs)
  const hi = Math.max(...hs)
  const pad = (hi - lo) * 0.1 || 1
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="profileFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5a524" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#f5a524" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#223040" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="t" type="number" domain={[0, 'dataMax']} tickFormatter={(v) => fmt(v, 0)} stroke="#7f8fa1" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis domain={[lo - pad, hi + pad]} tickFormatter={(v) => fmt(v, unit === 'm' ? 0 : 2)} stroke="#7f8fa1" fontSize={10} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            contentStyle={{ background: '#1b2531', border: '1px solid #2c3b4d', borderRadius: 8, fontSize: 12, fontFamily: 'JetBrains Mono Variable' }}
            labelFormatter={(v) => `${fmt(Number(v), 1)} ${unit === 'm' ? 'm along' : 'px along'}`}
            formatter={(v) => [`${fmt(Number(v), unit === 'm' ? 2 : 3)} ${unit}`, 'height']}
          />
          <Area type="monotone" dataKey="h" stroke="#f5a524" strokeWidth={1.8} fill="url(#profileFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
