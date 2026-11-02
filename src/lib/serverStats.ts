import { useEffect, useMemo, useState } from 'react'
import type { ListenEntry } from '../core/types'
import { stats, type Tally } from './history'
import { currentServer, fullMode, jf } from './jellyfin'
import { serverTrack } from './serverHistory'
import { jellyfin, jellyfinTrackId } from './sources/jellyfin'

/**
 * History → Stats for a timeframe. Full mode with the plugin: the server's numbers (every play, like
 * Negusify on Windows). Otherwise: worked out from this phone's own history.
 */

/** A preset rolling window, or calendar days (YYYY-MM-DD, both inclusive), same as on Windows. */
export interface Timeframe {
  period?: 'week' | 'all'
  from?: string
  to?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
/** The last `n` days, today included. */
const lastDays = (n: number): Timeframe => ({ from: dayString(new Date(Date.now() - (n - 1) * 864e5)), to: dayString(new Date()) })

export const PRESETS: { label: string; tf: () => Timeframe }[] = [
  { label: '1 week', tf: () => ({ period: 'week' }) },
  { label: '4 weeks', tf: () => lastDays(28) },
  { label: '6 months', tf: () => lastDays(182) },
  { label: 'All time', tf: () => ({ period: 'all' }) },
]

/** "1 Oct – 15 Oct 2026" */
export function rangeLabel(t: Timeframe) {
  if (!t.from || !t.to) return 'Custom'
  const a = parseDay(t.from)
  const b = parseDay(t.to)
  const fmt = (d: Date, year: boolean) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })
  return t.from === t.to ? fmt(a, true) : `${fmt(a, a.getFullYear() !== b.getFullYear())} – ${fmt(b, true)}`
}

/** [since, until) in ms, for this phone's own history. */
function span(t: Timeframe): [number, number] {
  if (t.from && t.to) {
    const end = parseDay(t.to)
    end.setDate(end.getDate() + 1)
    return [parseDay(t.from).getTime(), end.getTime()]
  }
  return [t.period === 'week' ? Date.now() - 7 * 864e5 : 0, Infinity]
}

export interface Stats {
  seconds: number
  plays: number
  tracks: Tally[]
  artists: Tally[]
  albums: Tally[]
}

const FULL = 10_000
const cache = new Map<string, { at: number; data: Stats }>()

async function fromServer(t: Timeframe): Promise<Stats> {
  const s = currentServer()!
  const q = t.from && t.to ? { from: t.from, to: t.to } : { period: t.period ?? 'week' }
  const img = (id: string) => `media://jellyfin/${s.id}/Items/${id.replace(/-/g, '')}/Images/Primary?maxHeight=400&quality=90`
  const [total, artists, albums, tracks] = await Promise.all([
    jf<{ SecondsPlayed: number; Plays: number }>('/HQPlayer/stats/playtime', { query: q }),
    jf<{ ArtistName: string; ArtistId?: string | null; SecondsPlayed: number; Plays?: number }[]>('/HQPlayer/stats/playtime', { query: { ...q, by: 'artist', limit: FULL } }),
    jf<{ AlbumName: string; AlbumId: string; SecondsPlayed: number; Plays?: number }[]>('/HQPlayer/stats/playtime', { query: { ...q, by: 'album', limit: FULL } }),
    jf<{ ItemId: string; TrackTitle: string; ArtistNames?: string; AlbumId?: string | null; Plays: number; SecondsPlayed: number; Source?: string | null; ExternalId?: string | null }[]>(
      '/HQPlayer/stats/playtime/tracks',
      { query: { ...q, limit: FULL } },
    ),
  ])
  const trackTallies: Tally[] = []
  for (const r of tracks) {
    const track = serverTrack(r, s.id)
    if (track) trackTallies.push({ key: track.uid, label: track.title, sub: track.artist, track, artwork: track.artwork, plays: r.Plays, seconds: r.SecondsPlayed })
  }
  // plays without a resolved album (imported ones) have no cover: take the server's own songs
  const bare = trackTallies.filter((x) => x.track!.source === 'jellyfin' && !x.track!.artwork)
  if (bare.length) {
    const songs = await jellyfin.tracksByIds(s.id, bare.map((x) => x.track!.id.slice(x.track!.id.indexOf('~') + 1)))
    for (const x of bare) {
      const song = songs.get(x.track!.id.slice(x.track!.id.indexOf('~') + 1))
      if (song) Object.assign(x, { track: song, artwork: song.artwork })
    }
  }
  return {
    seconds: total.SecondsPlayed,
    plays: total.Plays,
    tracks: trackTallies,
    artists: artists.map((a) => ({
      key: a.ArtistName,
      label: a.ArtistName,
      artwork: a.ArtistId ? img(a.ArtistId) : undefined,
      entity: a.ArtistId ? { source: 'jellyfin', kind: 'artist', id: jellyfinTrackId(s.id, a.ArtistId.replace(/-/g, '')), name: a.ArtistName, artwork: img(a.ArtistId) } : undefined,
      plays: a.Plays ?? 0,
      seconds: a.SecondsPlayed,
    })),
    albums: albums.map((a) => ({
      key: a.AlbumId,
      label: a.AlbumName,
      artwork: img(a.AlbumId),
      entity: { source: 'jellyfin', kind: 'album', id: jellyfinTrackId(s.id, a.AlbumId.replace(/-/g, '')), name: a.AlbumName, artwork: img(a.AlbumId) },
      plays: a.Plays ?? 0,
      seconds: a.SecondsPlayed,
    })),
  }
}

/** Stats for a timeframe; `entries` is this phone's own history (used without the plugin). */
export function useStats(t: Timeframe, entries: ListenEntry[]) {
  const key = `${currentServer()?.id}|${JSON.stringify(t)}`
  const server = fullMode() && !!currentServer()
  const [state, setState] = useState<{ key: string; data?: Stats; error?: string }>({ key })
  useEffect(() => {
    if (!server) return
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < 2 * 60_000) return setState({ key, data: hit.data })
    let live = true
    setState({ key })
    fromServer(t).then(
      (data) => {
        cache.set(key, { at: Date.now(), data })
        if (live) setState({ key, data })
      },
      // no plugin (or it can't be reached): this phone's numbers
      (e) => live && setState({ key, error: (e as Error).message }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, server])
  const onServer = server && !(state.key === key && state.error)
  const local = useMemo(() => (onServer ? undefined : stats(entries, ...span(t))), [onServer, entries, key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (onServer) return { data: state.key === key ? state.data : undefined, loading: state.key !== key || !state.data }
  return { data: local, loading: false }
}
