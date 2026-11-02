import type { ListenEntry, Track } from '../core/types'
import { createStore, useStore } from '../core/store'
import { currentServer, fullMode, jf } from './jellyfin'
import { historyStore } from './history'
import { jellyfin, jellyfinTrackId } from './sources/jellyfin'
import { JsonFile } from './storage'

/**
 * Full mode, same as Negusify on Windows:
 * - YouTube Music, SoundCloud and Spotify plays go into the server's listening history (POST
 *   /ProjectX/Sync/ExternalPlay; Jellyfin songs are recorded by the server itself), waiting here while
 *   the server can't be reached.
 * - History shows the server's history (every app and device, streaming plays included) instead of
 *   this phone's own log, so Timeline and Stats cover both.
 */

type Streaming = 'youtube' | 'soundcloud' | 'spotify'
const STREAMING: readonly string[] = ['youtube', 'soundcloud', 'spotify']

interface Report {
  source: Streaming
  id: string
  title: string
  artists: string[]
  album?: string
  durationMs: number
  playedMs: number
  startedAt: string
  device: string
}
const pending = new JsonFile<Report[]>('server-plays.json', [])

/** The plugin's bar for a play: 10% of the song or 30 s, whichever comes first. */
const countsAsPlay = (heard: number, duration: number) => heard >= (duration > 0 ? Math.min(duration * 0.1, 30) : 30)

/** A play just ended (history.ts). */
export function reportServerPlay(e: ListenEntry) {
  if (!fullMode() || !currentServer() || !STREAMING.includes(e.track.source) || !countsAsPlay(e.listened, e.duration)) return
  pending.set([
    ...pending.load(),
    {
      source: e.track.source as Streaming,
      id: e.track.id,
      title: e.track.title,
      artists: e.track.artist.split(/,\s*/).filter(Boolean),
      album: e.track.album || undefined,
      durationMs: Math.round(e.duration * 1000),
      playedMs: Math.round(e.listened * 1000),
      startedAt: new Date(e.startedAt).toISOString(),
      device: 'Negusify iPhone',
    },
  ].slice(-2000))
  void sendServerPlays()
}

let sending = false
/** Sends what's waiting, oldest first; stops at the first failure (tried again on the next play or sync). */
export async function sendServerPlays() {
  if (sending || !fullMode() || !currentServer()) return
  sending = true
  try {
    for (let list = pending.load(); list.length; list = pending.load()) {
      try {
        await jf('/ProjectX/Sync/ExternalPlay', { method: 'POST', body: list[0] })
      } catch (e) {
        // offline, signed out or a server error: try later; anything else was refused for good, so drop it
        if (/Can't reach|didn't answer|signed you out|Sign in to|answered 5\d\d/.test((e as Error).message)) return
      }
      pending.set(pending.load().slice(1))
    }
  } finally {
    sending = false
  }
}

// ---------- the server's history ----------

interface Row {
  ItemId: string
  TrackTitle?: string
  ArtistNames?: string
  AlbumName?: string
  AlbumId?: string
  TrackDurationSeconds: number
  StartedAt: string
  EndedAt?: string
  DurationPlayed: number
  Source?: string | null
  ExternalId?: string | null
}

const names = (json?: string) => {
  try {
    const v = json ? JSON.parse(json) : []
    return Array.isArray(v) ? v.map(String) : [String(v)]
  } catch {
    return json ? [json] : []
  }
}

/** A song from one of the plugin's rows (plays, track stats): streaming songs by service id, server songs with the album cover. */
export function serverTrack(
  r: { ItemId: string; TrackTitle?: string; ArtistNames?: string; AlbumName?: string; AlbumId?: string | null; TrackDurationSeconds?: number; Source?: string | null; ExternalId?: string | null },
  serverId: string,
): Track | null {
  const artist = names(r.ArtistNames).join(', ') || 'Unknown artist'
  if (r.Source) {
    if (!STREAMING.includes(r.Source) || !r.ExternalId) return null
    return { uid: `${r.Source}:${r.ExternalId}`, source: r.Source as Streaming, id: r.ExternalId, title: r.TrackTitle ?? '', artist, album: r.AlbumName ?? '', duration: r.TrackDurationSeconds ?? 0 }
  }
  const id = jellyfinTrackId(serverId, r.ItemId.replace(/-/g, ''))
  return {
    uid: `jellyfin:${id}`,
    source: 'jellyfin',
    id,
    title: r.TrackTitle ?? '',
    artist,
    album: r.AlbumName ?? '',
    duration: r.TrackDurationSeconds ?? 0,
    artwork: r.AlbumId ? `media://jellyfin/${serverId}/Items/${r.AlbumId.replace(/-/g, '')}/Images/Primary?maxHeight=400&quality=90` : undefined,
  }
}

function toEntry(r: Row, serverId: string, i: number): ListenEntry | null {
  const track = serverTrack(r, serverId)
  if (!track) return null
  const startedAt = Date.parse(r.StartedAt)
  return {
    id: `server-${i}-${startedAt}`,
    track,
    startedAt,
    endedAt: r.EndedAt ? Date.parse(r.EndedAt) : startedAt + r.DurationPlayed * 1000,
    segments: [[0, r.DurationPlayed]],
    listened: r.DurationPlayed,
    duration: r.TrackDurationSeconds,
  }
}

/** null: show this phone's own history (Streaming mode, or a server without the plugin). */
export const serverHistoryStore = createStore<{ entries: ListenEntry[] | null; loading: boolean }>({ entries: null, loading: false })
export const useServerHistory = () => useStore(serverHistoryStore, (s) => s)

const PAGE = 500
const MAX = 5000

/** Loads the newest plays (up to 5000, which Timeline and Stats work from). */
export async function loadServerHistory() {
  const s = currentServer()
  if (!fullMode() || !s) return serverHistoryStore.set({ entries: null, loading: false })
  serverHistoryStore.set((st) => ({ ...st, loading: true }))
  void sendServerPlays()
  try {
    const out: ListenEntry[] = []
    for (let offset = 0; offset < MAX; offset += PAGE) {
      const p = await jf<{ Items: Row[]; Total: number }>('/HQPlayer/stats/plays', { query: { offset, limit: PAGE } })
      p.Items.forEach((r, i) => {
        const e = toEntry(r, s.id, offset + i)
        if (e) out.push(e)
      })
      if (offset + PAGE >= p.Total) break
    }
    serverHistoryStore.set({ entries: out, loading: false })
    void withCovers(out, s.id)
  } catch {
    // no plugin on this server (or it can't be reached): this phone's own history
    serverHistoryStore.set({ entries: null, loading: false })
  }
}

/**
 * The plugin's rows only carry a cover when the play's album was resolved (not for imported plays), and
 * streaming plays never do: Jellyfin songs become the server's own songs (same cover and details as on
 * their album page, also when played from History), streaming songs take the cover this phone has.
 * Streaming covers show right away, Jellyfin ones as each batch of songs arrives.
 */
async function withCovers(entries: ListenEntry[], serverId: string) {
  const art = new Map(historyStore.get().entries.filter((e) => e.track.artwork).map((e) => [e.track.uid, e.track.artwork]))
  const itemId = (e: ListenEntry) => e.track.id.slice(e.track.id.indexOf('~') + 1).replace(/-/g, '')
  let current = entries
  const apply = (songs: Map<string, Track>) => {
    if (serverHistoryStore.get().entries !== current) return // reloaded meanwhile
    current = entries.map((e) => {
      if (e.track.source === 'jellyfin') {
        const t = songs.get(itemId(e))
        return t ? { ...e, track: t } : e
      }
      const artwork = art.get(e.track.uid)
      return artwork && !e.track.artwork ? { ...e, track: { ...e.track, artwork } } : e
    })
    serverHistoryStore.set({ entries: current, loading: false })
  }
  apply(new Map())
  await jellyfin.tracksByIds(serverId, [...new Set(entries.filter((e) => e.track.source === 'jellyfin').map(itemId))], apply)
}

/** History's plays: the server's (Full mode with the plugin) or this phone's own. */
export function useHistoryEntries() {
  const own = useStore(historyStore, (s) => s.entries)
  return useServerHistory().entries ?? own
}
