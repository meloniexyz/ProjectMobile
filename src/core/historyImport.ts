// Shared by Negusify (Windows) and Negusify for iPhone (iOS): keep every copy identical.
import type { ListenEntry, Track } from './types'

/**
 * Importing listening history from other services' data exports:
 * - Spotify "Extended streaming history" (Streaming_History_Audio_*.json): every play since the
 *   account was made, with the song's Spotify id and exactly how long it played
 * - Spotify "Account data" (StreamingHistory_music_*.json / StreamingHistory*.json): the last year,
 *   title + artist + time played
 * - Google Takeout YouTube history (watch-history.json, JSON format): YouTube Music plays with the
 *   video id and time; how long each song is gets looked up (assumed played to the end)
 * SoundCloud has no downloadable listening history.
 */

export type ImportKind = 'spotify-extended' | 'spotify-account' | 'youtube-music'

export interface ImportedPlay {
  source: 'spotify' | 'youtube'
  /** Spotify track id / YouTube video id ('' when the export doesn't say) */
  id: string
  title: string
  artist: string
  album?: string
  /** when it stopped playing (ms) */
  endedAt: number
  /** seconds heard; null when the export doesn't say (YouTube: looked up as the song's length) */
  listened: number | null
}

export interface ParsedFile {
  kind: ImportKind | null
  plays: ImportedPlay[]
  /** podcasts, videos that aren't YouTube Music, entries without a song */
  skipped: number
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Reads one export file (its text); kind null when it isn't a listening history we know. */
export function parseHistoryFile(text: string): ParsedFile {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { kind: null, plays: [], skipped: 0 }
  }
  if (!Array.isArray(data) || !data.length) return { kind: null, plays: [], skipped: 0 }
  const first = data.find((x) => x && typeof x === 'object') as Record<string, unknown> | undefined
  if (!first) return { kind: null, plays: [], skipped: 0 }
  const plays: ImportedPlay[] = []
  let skipped = 0

  if ('ms_played' in first && 'ts' in first) {
    for (const r of data as Record<string, unknown>[]) {
      const title = str(r.master_metadata_track_name)
      const uri = str(r.spotify_track_uri)
      const endedAt = Date.parse(str(r.ts))
      if (!title || !Number.isFinite(endedAt)) {
        skipped++ // podcast episode, audiobook or a broken row
        continue
      }
      plays.push({
        source: 'spotify',
        id: uri.startsWith('spotify:track:') ? uri.slice('spotify:track:'.length) : '',
        title,
        artist: str(r.master_metadata_album_artist_name) || 'Unknown Artist',
        album: str(r.master_metadata_album_album_name) || undefined,
        endedAt,
        listened: Math.max(0, Number(r.ms_played) || 0) / 1000,
      })
    }
    return { kind: 'spotify-extended', plays, skipped }
  }

  if ('msPlayed' in first && 'endTime' in first) {
    for (const r of data as Record<string, unknown>[]) {
      const title = str(r.trackName)
      // "2024-03-05 21:14" in UTC
      const endedAt = Date.parse(`${str(r.endTime).replace(' ', 'T')}:00Z`)
      if (!title || !Number.isFinite(endedAt) || ('episodeName' in r && !('trackName' in r))) {
        skipped++
        continue
      }
      plays.push({ source: 'spotify', id: '', title, artist: str(r.artistName) || 'Unknown Artist', endedAt, listened: Math.max(0, Number(r.msPlayed) || 0) / 1000 })
    }
    return { kind: 'spotify-account', plays, skipped }
  }

  if ('time' in first && ('titleUrl' in first || 'header' in first || 'products' in first)) {
    for (const r of data as Record<string, unknown>[]) {
      const url = str(r.titleUrl)
      const id = url.match(/[?&]v=([\w-]{11})/)?.[1] ?? ''
      const endedAt = Date.parse(str(r.time))
      const music = str(r.header) === 'YouTube Music' || /^https?:\/\/music\.youtube\.com\//.test(url)
      if (!music || !id || !Number.isFinite(endedAt)) {
        skipped++ // regular YouTube videos, searches, ads, removed videos
        continue
      }
      const channel = Array.isArray(r.subtitles) ? str((r.subtitles[0] as Record<string, unknown> | undefined)?.name) : ''
      plays.push({
        source: 'youtube',
        id,
        // "Watched X" in English; other languages word it differently, so the real title is looked up too
        title: str(r.title).replace(/^Watched\s+/, ''),
        artist: channel.replace(/\s+-\s+Topic$/, '') || 'Unknown Artist',
        endedAt,
        listened: null,
      })
    }
    return { kind: 'youtube-music', plays, skipped }
  }

  return { kind: null, plays: [], skipped: 0 }
}

const squash = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '')
/** The same song across exports and Negusify's own plays: title + first artist. */
export const songOf = (title: string, artist: string) => `${squash(title)}|${squash(artist.split(/,|&| feat\.? | ft\.? /i)[0] ?? '')}`

/** Looked-up details of a YouTube video (title, artist, length), when found. */
export type VideoInfo = { title: string; artist: string; duration: number }

/**
 * Turns imported plays into history entries. Plays already in the history are skipped: the same
 * import twice (the ids are stable), and songs Negusify itself played through the Spotify app,
 * which Spotify's export lists too (same song ending within 3 minutes).
 * Plays under 1 second are dropped (Spotify lists skipped-at-once songs).
 */
export function toEntries(plays: ImportedPlay[], existing: ListenEntry[], videos: Map<string, VideoInfo | null>): { entries: ListenEntry[]; duplicates: number } {
  const ids = new Set(existing.map((e) => e.id))
  // Negusify's own plays by song, for spotting the same play in Spotify's export
  const own = new Map<string, number[]>()
  for (const e of existing) {
    if (e.id.startsWith('imp-')) continue
    const k = songOf(e.track.title, e.track.artist)
    const list = own.get(k)
    if (list) list.push(e.endedAt)
    else own.set(k, [e.endedAt])
  }
  // longest play of each song: the best guess of its length when the export doesn't say
  const longest = new Map<string, number>()
  for (const p of plays) {
    const k = p.source + (p.id || songOf(p.title, p.artist))
    if (p.listened !== null) longest.set(k, Math.max(longest.get(k) ?? 0, p.listened))
  }

  const entries: ListenEntry[] = []
  let duplicates = 0
  for (const p of plays) {
    const v = p.source === 'youtube' ? videos.get(p.id) : undefined
    const title = v?.title || p.title
    const artist = v?.artist || p.artist
    const listened = p.listened ?? v?.duration ?? 0
    if (listened < 1) continue
    const key = p.id || squash(`${title}${artist}`).slice(0, 40)
    const id = `imp-${p.source}-${p.endedAt}-${key}`
    if (ids.has(id)) {
      duplicates++
      continue
    }
    const near = own.get(songOf(title, artist))
    if (near?.some((t) => Math.abs(t - p.endedAt) < 3 * 60_000)) {
      duplicates++
      continue
    }
    ids.add(id)
    const duration = Math.max(listened, v?.duration ?? longest.get(p.source + (p.id || songOf(p.title, p.artist))) ?? listened)
    const trackId = p.id || `name:${squash(`${title}|${artist}`).slice(0, 60)}`
    const track: Track = {
      uid: `${p.source}:${trackId}`,
      source: p.source,
      id: trackId,
      title,
      artist,
      album: p.album ?? (p.source === 'youtube' ? 'YouTube Music' : 'Spotify'),
      duration,
      artwork: p.source === 'youtube' ? `https://i.ytimg.com/vi/${p.id}/hqdefault.jpg` : undefined,
    }
    entries.push({
      id,
      track,
      startedAt: p.endedAt - listened * 1000,
      endedAt: p.endedAt,
      segments: [[0, listened]],
      listened,
      duration,
    })
  }
  return { entries, duplicates }
}

/** "Spotify (all time)", for the import summary. */
export const IMPORT_NAMES: Record<ImportKind, string> = {
  'spotify-extended': 'Spotify extended streaming history',
  'spotify-account': 'Spotify account data (last year)',
  'youtube-music': 'YouTube Music (Google Takeout)',
}
