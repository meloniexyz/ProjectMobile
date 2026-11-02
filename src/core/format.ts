export function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  sec = Math.floor(sec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = String(sec % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function fmtTotal(sec: number) {
  const m = Math.round(sec / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`
}

export type TimeUnit = 'day' | 'hour' | 'minute'
const UNITS = [
  { key: 'day', seconds: 86400, suffix: 'd' },
  { key: 'hour', seconds: 3600, suffix: 'h' },
  { key: 'minute', seconds: 60, suffix: 'm' },
  { key: 'second', seconds: 1, suffix: 's' },
] as const

/** Listening time with a cap on the largest unit (same as Windows): 254925 s reads "2d 22h 48m 45s", "70h 48m 45s" or "4248m 45s". */
export function formatListeningSeconds(totalSeconds: number, maxUnit: TimeUnit = 'day') {
  let remaining = Math.round(totalSeconds)
  const parts: string[] = []
  for (const u of UNITS.slice(UNITS.findIndex((u) => u.key === maxUnit))) {
    const v = Math.floor(remaining / u.seconds)
    remaining -= v * u.seconds
    if (v > 0) parts.push(`${v}${u.suffix}`)
  }
  return parts.length ? parts.join(' ') : '0s'
}

export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

/** Lowercase and strip accents so "Beyoncé" matches "beyonce" and "Işık" matches "isik". */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ı/g, 'i')

export const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')

export const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

export function shuffled<T>(items: T[]): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
