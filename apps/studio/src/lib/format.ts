export function fmt(v: number | null | undefined, digits = 1, unit = ''): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v.toFixed(digits)}${unit}`
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return Math.round(v).toLocaleString()
}

export function fmtSeconds(s: number | null | undefined): string {
  if (s === null || s === undefined) return '—'
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`
  const m = Math.floor(s / 60)
  return `${m} min ${Math.round(s - m * 60)} s`
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function timeAgo(ts: number): string {
  const d = Date.now() / 1000 - ts
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)} min ago`
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`
  return `${Math.floor(d / 86400)} d ago`
}

export function compass(deg: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}
