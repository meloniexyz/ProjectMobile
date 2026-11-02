/**
 * Classical works on album pages, the same rules as Negusify on Windows (full/lib/classical): a song
 * titled "<Work>: <Movement>" is a movement of <Work>, and two or more back to back with the same
 * <Work> become one group. Works saved with the plugin's metadata editor win over the title rule.
 */
const ROMAN_MOVEMENT_RE = /^[IVXLCDM]+\.\s+\S/
const ARABIC_INDEX_RE = /^\d+[.)]?\s/
const BARE_KEY_NAME_RE = /^(in\s+)?[A-G](?:[\s-](?:Sharp|Flat)|[#b])?\s+(?:Major|Minor)\b/i
/** "...: Thema" / "...: Theme": the theme of a set of variations carries its own tempo marking */
const THEME_MOVEMENT_RE = /:\s*(Thema|Theme)$/i

export function splitMovement(title: string): { work: string; movement: string } | null {
  // the LAST ": " (some titles carry the composer in front: "J.S. Bach: Italian Concerto, BWV 971: 1. (Allegro)")
  let idx = title.lastIndexOf(': ')
  let sep = 2
  // no colon: "Piano Sonata No. 3 in F major, Op. 46 - Allegro con moto" uses " - " instead (only a
  // run of songs with the same text before it becomes a group, so a lone "Song - Live" stays a song)
  if (idx < 0) {
    idx = title.lastIndexOf(' - ')
    sep = 3
  }
  if (idx < 0) return null
  // "...WoO 80: Thema: Allegretto": the theme joins its variations
  if (sep === 2 && THEME_MOVEMENT_RE.test(title.slice(0, idx))) {
    const outer = title.slice(0, idx).lastIndexOf(': ')
    if (outer >= 0) idx = outer
  }
  const movement = title.slice(idx + sep)
  if (!movement) return null
  // an Arabic index followed by just a key ("14 in E-Flat Minor") is a numbered piece of a set, not a movement
  if (!ROMAN_MOVEMENT_RE.test(movement) && ARABIC_INDEX_RE.test(movement) && BARE_KEY_NAME_RE.test(movement.replace(ARABIC_INDEX_RE, ''))) return null
  // "Piano Concerto in A Minor, Op. 16: Piano Concerto in A Minor: I. Allegro": the short name repeated
  // after the full one (common in store tags) is dropped, so it joins "...Op. 16: II. Adagio"
  let work = title.slice(0, idx)
  const inner = work.lastIndexOf(': ')
  if (inner > 0 && work.slice(0, inner).startsWith(work.slice(inner + 2))) work = work.slice(0, inner)
  return { work, movement }
}

/** A work saved on the server (only what the phone shows). Song ids are item ids without dashes. */
export interface SavedWork {
  Id: number
  Title?: string
  IsLive: boolean
  TrackItemIds: string[]
}

/** A group of consecutive songs: `start` and `count` index into the album's songs. */
export interface WorkGroup {
  start: number
  count: number
  title: string
  live: boolean
}

/** The album's work groups: saved works whose songs sit together, then the title rule for the rest. */
export function workGroups<T>(songs: T[], titleOf: (s: T) => string, idOf: (s: T) => string, saved: SavedWork[] = []): WorkGroup[] {
  const out: WorkGroup[] = []
  const byTitle = (from: number, to: number) => {
    for (let i = from; i < to; ) {
      const split = splitMovement(titleOf(songs[i]))
      let j = i + 1
      while (split && j < to && splitMovement(titleOf(songs[j]))?.work === split.work) j++
      if (split && j - i >= 2) out.push({ start: i, count: j - i, title: split.work, live: false })
      i = j
    }
  }
  const index = new Map(songs.map((s, i) => [idOf(s), i]))
  const placed = saved
    .map((w) => {
      const at = w.TrackItemIds.map((id) => index.get(id.replace(/-/g, ''))).filter((i): i is number => i !== undefined)
      return at.length ? { start: Math.min(...at), end: Math.max(...at), w } : null
    })
    // a work whose songs aren't next to each other can't be one group; a one-song work isn't a group
    .filter((p): p is { start: number; end: number; w: SavedWork } => !!p && p.end - p.start + 1 === p.w.TrackItemIds.length && p.end > p.start)
    .sort((a, b) => a.start - b.start)
  let cursor = 0
  for (const p of placed) {
    if (p.start < cursor) continue // overlaps an earlier work
    byTitle(cursor, p.start)
    out.push({ start: p.start, count: p.end - p.start + 1, title: p.w.Title || 'Untitled work', live: p.w.IsLive })
    cursor = p.end + 1
  }
  byTitle(cursor, songs.length)
  return out
}

