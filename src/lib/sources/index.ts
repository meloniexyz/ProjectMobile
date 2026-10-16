import type { Entity, EntityKind, EntityPage, SourceId, Track } from '../../core/types'
import { getSettings, type Quality } from '../settings'
import { JsonFile } from '../storage'
import { soundcloud } from './soundcloud'
import { spotify } from './spotify'
import type { StreamPlan } from './types'
import { youtube } from './youtube'

export { soundcloud, spotify, youtube }
export type { StreamPlan }

export interface SourceInfo {
  name: string
  short: string
  color: string
}

export const SOURCES: Record<SourceId, SourceInfo> = {
  local: { name: 'Local Files', short: 'Local', color: '#8b7cff' },
  youtube: { name: 'YouTube Music', short: 'YouTube', color: '#ff0033' },
  soundcloud: { name: 'SoundCloud', short: 'SoundCloud', color: '#ff5500' },
  spotify: { name: 'Spotify', short: 'Spotify', color: '#1ed760' },
}

export const SEARCH_SOURCES: SourceId[] = ['youtube', 'soundcloud', 'spotify']

export function search(source: SourceId, q: string, limit = 30): Promise<Track[]> {
  if (source === 'youtube') return youtube.search(q, limit)
  if (source === 'soundcloud') return soundcloud.search(q, limit)
  if (source === 'spotify') return spotify.search(q, limit)
  return Promise.resolve([])
}

// ---------- Spotify songs: play the same recording from YouTube Music or SoundCloud ----------

/** Efficiency of each codec relative to MP3, for comparing streams across services. */
const CODEC_EFFICIENCY = { aac: 1.15, mp3: 1 } as const
const effective = (p: StreamPlan) => p.kbps * CODEC_EFFICIENCY[p.codec]

/** Matches found earlier, so a Spotify song is only searched for once (saves data). */
const matches = new JsonFile<Record<string, { source: 'youtube' | 'soundcloud'; track: Track }>>('alternatives-v2.json', {}) // v2: matched with the explicit/clean rules

export interface Resolved {
  plan: StreamPlan
  /** the track actually downloaded (differs from the requested one for Spotify songs) */
  via: Track | null
}

/** YouTube's "confirm you're not a bot" wall (VPNs / data-center networks). */
export const isBotWall = (err: unknown) => /confirm you.re not a bot|sign in to confirm/i.test(String((err as Error)?.message ?? err))
/** after a bot wall, skip YouTube for a while instead of waiting on it for every song */
let youtubeBlockedUntil = 0
export const youtubeBlocked = () => Date.now() < youtubeBlockedUntil

type Candidate = { id: 'youtube' | 'soundcloud'; track: Track; plan: StreamPlan; score: number }

/** The best streamable copy of a song on one service (tries the 3 closest matches), or a reason why not. */
async function copyOn(id: 'youtube' | 'soundcloud', target: { title: string; artist: string; duration: number }, quality: Quality, why: string[]) {
  const name = SOURCES[id].short
  if (id === 'youtube' && youtubeBlocked()) {
    why.push(`${name}: blocked on this connection (VPN?)`)
    return null
  }
  const src = id === 'youtube' ? youtube : soundcloud
  const list = await src.matches(target).catch((e: Error) => {
    why.push(`${name}: ${e.message}`)
    return null
  })
  if (!list) return null
  if (!list.length) {
    why.push(`${name}: no matching recording`)
    return null
  }
  // the closest copy may not be streamable (e.g. label uploads that only SoundCloud's app can play)
  for (const m of list.slice(0, 3)) {
    try {
      return { id, track: m.track, plan: await src.plan(m.track.id, quality), score: m.score } as Candidate
    } catch (e) {
      why.push(`${name}: ${(e as Error).message}`)
      if (id === 'youtube' && isBotWall(e)) {
        youtubeBlockedUntil = Date.now() + 10 * 60_000
        return null
      }
    }
  }
  return null
}

/**
 * Where to get a song's audio at the given quality.
 * - YouTube songs: from YouTube; if YouTube refuses this connection, the same recording from SoundCloud.
 * - Spotify songs: following "Spotify songs play from": the better copy for your quality setting
 *   (both searched; on "best" the better-sounding wins, on "low"/"mid" the smaller), or a preferred
 *   service first with the other as backup.
 */
export async function resolvePlan(track: Track, quality: Quality): Promise<Resolved> {
  if (track.source === 'soundcloud') return { plan: await soundcloud.plan(track.id, quality), via: null }
  const target = { title: track.title, artist: track.artist, duration: track.duration }
  if (track.source === 'youtube') {
    if (!youtubeBlocked()) {
      try {
        return { plan: await youtube.plan(track.id, quality), via: null }
      } catch (err) {
        if (!isBotWall(err)) throw err
        youtubeBlockedUntil = Date.now() + 10 * 60_000
      }
    }
    const why: string[] = []
    const sc = await copyOn('soundcloud', target, quality, why)
    if (!sc) throw new Error(`YouTube refused this connection (often a VPN), and SoundCloud has no copy (${why.join('; ')})`)
    return { plan: sc.plan, via: sc.track }
  }
  if (track.source !== 'spotify') throw new Error('Local songs play from the phone')

  const pref = getSettings().spotifySource
  const known = matches.get()[track.uid]
  if (known && (pref === 'auto' || known.source === pref) && !(known.source === 'youtube' && youtubeBlocked())) {
    const src = known.source === 'youtube' ? youtube : soundcloud
    const plan = await src.plan(known.track.id, quality).catch(() => null)
    if (plan) return { plan, via: known.track }
  }

  const why: string[] = []
  let chosen: Candidate | null = null
  if (pref === 'auto') {
    const found = (await Promise.all((['youtube', 'soundcloud'] as const).map((id) => copyOn(id, target, quality, why)))).filter(
      (c): c is Candidate => c !== null,
    )
    found.sort((a, b) => {
      const q = quality === 'best' ? effective(b.plan) - effective(a.plan) : effective(a.plan) - effective(b.plan)
      return Math.abs(q) > Math.max(effective(a.plan), effective(b.plan)) * 0.08 ? q : b.score - a.score
    })
    chosen = found[0] ?? null
  } else {
    const other = pref === 'youtube' ? 'soundcloud' : 'youtube'
    chosen = (await copyOn(pref, target, quality, why)) ?? (await copyOn(other, target, quality, why))
  }
  if (!chosen) throw new Error(`No playable copy of this Spotify song on YouTube Music or SoundCloud (${why.join('; ')})`)
  matches.set({ ...matches.get(), [track.uid]: { source: chosen.id, track: chosen.track } })
  return { plan: chosen.plan, via: chosen.track }
}

/** Forget a remembered match (e.g. it turned out to be the wrong recording). */
export function forgetMatch(uid: string) {
  const next = { ...matches.get() }
  delete next[uid]
  matches.set(next)
}

export function cleanError(err: unknown): Error {
  const e = err instanceof Error ? err : new Error(String(err))
  e.message = e.message.replace(/^(\w*Error: )+/, '')
  return e
}

// ---------- search tabs and new releases ----------

/** Search tabs besides Songs. Spotify has no profile search; SoundCloud's artists are its profiles. */
export const ENTITY_TABS: { kind: EntityKind; label: string; sources: SourceId[] }[] = [
  { kind: 'artist', label: 'Artists', sources: ['spotify', 'youtube'] },
  { kind: 'playlist', label: 'Playlists', sources: ['spotify', 'youtube', 'soundcloud'] },
  { kind: 'profile', label: 'Profiles', sources: ['soundcloud', 'youtube'] },
]

const entitySources = { spotify, youtube, soundcloud } as const

export function searchEntities(source: SourceId, query: string, kind: EntityKind): Promise<Entity[]> {
  const s = entitySources[source as keyof typeof entitySources]
  return s ? s.searchEntities(query, kind) : Promise.resolve([])
}

export function entityPage(e: Entity): Promise<EntityPage> {
  // a single song or video from new releases carries its own track
  if (e.tracks?.length) return Promise.resolve({ tracks: e.tracks, playlists: [] })
  const s = entitySources[e.source as keyof typeof entitySources]
  if (!s) return Promise.reject(new Error(`${e.source} can't open this`))
  return s.entityPage(e)
}

/** New releases from the people you follow on each connected platform; kept for 3 hours. */
let releases: { at: number; max: number; list: Promise<{ items: Entity[]; problems: string[] }> } | null = null
export function newReleases(maxMinutes: number, force = false) {
  const max = maxMinutes * 60
  if (!releases || force || releases.max !== max || Date.now() - releases.at > 3 * 3600_000) {
    releases = {
      at: Date.now(),
      max,
      list: (async () => {
        const problems: string[] = []
        const lists = await Promise.all(
          (['spotify', 'youtube', 'soundcloud'] as const).map((id) =>
            // each source returns nothing when you are not signed in there
            entitySources[id].newReleases(max).catch((e: Error) => {
              console.warn('[new releases]', id, e)
              if (id === 'spotify' && /403|forbidden|scope|insufficient/i.test(e.message)) problems.push('spotify-permission')
              return [] as Entity[]
            }),
          ),
        )
        // Spotify first, then SoundCloud, then YouTube; newest first within each
        const items = [lists[0], lists[2], lists[1]].flatMap((l) => [...l].sort((a, b) => (b.releasedAt ?? 0) - (a.releasedAt ?? 0)))
        return { items, problems }
      })(),
    }
  }
  return releases.list
}
