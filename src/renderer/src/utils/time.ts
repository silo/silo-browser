/** "just now", "5 min ago", "3 h ago", "yesterday", "12 Nov" */
export function timeAgo(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return 'never'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** "Today 14:02", "Yesterday 09:15", "12 Nov 18:40" */
export function dateTime(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const today = new Date(now)
  const yesterday = new Date(now - 86_400_000)
  const same = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()
  if (same(d, today)) return `Today ${time}`
  if (same(d, yesterday)) return `Yesterday ${time}`
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`
}
