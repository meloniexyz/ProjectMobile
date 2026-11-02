import type { BaseItemDto, QueryResult } from '../../core/jellyfin'
import type { AccountStatus, Entity, RemotePlaylist, Track } from '../../core/types'
import type { SavedWork } from '../../core/works'
import { currentServer, fullMode, jf, serverById, tokenOf } from '../jellyfin'
import type { Quality } from '../settings'
import type { StreamPlan } from './types'

/**
 * Jellyfin as one more source, next to YouTube Music, SoundCloud and Spotify (Full mode only).
 * A song's id is `<saved server id>~<item id>`, the same as on Windows, so playlists with server
 * songs play on both, each song from its own server.
 */
const TICKS = 10_000_000
const FIELDS = 'MediaSources,DateCreated,ParentId'

export const jellyfinTrackId = (serverId: string, itemId: string) => `${serverId}~${itemId}`
const split = (id: string) => {
  const i = id.indexOf('~')
  return i < 0 ? { serverId: undefined, itemId: id } : { serverId: id.slice(0, i), itemId: id.slice(i + 1) }
}

function toTrack(it: BaseItemDto, serverId: string): Track {
  const imageOf = it.AlbumId && it.AlbumPrimaryImageTag ? it.AlbumId : it.ImageTags?.Primary ? it.Id : undefined
  const id = jellyfinTrackId(serverId, it.Id)
  return {
    uid: `jellyfin:${id}`,
    source: 'jellyfin',
    id,
    title: it.Name || 'Untitled',
    artist: it.Artists?.join(', ') || it.AlbumArtist || 'Unknown artist',
    album: it.Album ?? '',
    albumArtist: it.AlbumArtist ?? undefined,
    duration: it.RunTimeTicks ? it.RunTimeTicks / TICKS : 0,
    // the same address as on Windows; lib/jellyfin.ts artworkUri() turns it into the server's
    artwork: imageOf ? `media://jellyfin/${serverId}/Items/${imageOf}/Images/Primary?maxHeight=400&quality=90` : undefined,
    trackNo: it.IndexNumber ?? undefined,
    discNo: it.ParentIndexNumber ?? undefined,
    year: it.ProductionYear ?? undefined,
    // Jellyfin's gain targets -18 LUFS; Negusify levels to -14
    gainDb: it.NormalizationGain != null ? Math.round((it.NormalizationGain + 4) * 10) / 10 : undefined,
  }
}

const tracks = (r: QueryResult<BaseItemDto>, serverId: string) => r.Items.filter((i) => i.Type === 'Audio' || !i.Type).map((i) => toTrack(i, serverId))

/** What a stream ends up as, by the file's codec/container (what iOS plays as it is). */
const DIRECT: Record<string, { ext: StreamPlan['ext']; codec: StreamPlan['codec']; name: string }> = {
  flac: { ext: 'flac', codec: 'flac', name: 'FLAC' },
  alac: { ext: 'm4a', codec: 'alac', name: 'ALAC' },
  aac: { ext: 'm4a', codec: 'aac', name: 'AAC' },
  mp3: { ext: 'mp3', codec: 'mp3', name: 'MP3' },
}
/** lossy steps for Low and Mid (Spotify-like); Best gets the original file */
const LOSSY_KBPS: Record<Exclude<Quality, 'best'>, number> = { low: 128, mid: 256 }

// ---------- the server's library (Library → Jellyfin → Tracks / Albums), same sorts as Negusify on Windows ----------

export type TrackSort = 'title' | 'artist' | 'album' | 'added' | 'duration' | 'plays'
export type AlbumSort = 'name' | 'artist' | 'year' | 'added' | 'plays'
export type ArtistSort = 'name' | 'added' | 'plays'
export type Dir = 'asc' | 'desc'
const TRACK_SORT: Record<Exclude<TrackSort, 'plays'>, string> = {
  title: 'SortName',
  album: 'Album,ParentIndexNumber,IndexNumber,SortName',
  artist: 'Artist,Album,ParentIndexNumber,IndexNumber,SortName',
  added: 'DateCreated,SortName',
  duration: 'Runtime,SortName',
}
const ALBUM_SORT: Record<Exclude<AlbumSort, 'plays'>, string> = {
  name: 'SortName',
  artist: 'AlbumArtist,SortName',
  year: 'ProductionYear,SortName',
  added: 'DateCreated,SortName',
}

function libraryQuery() {
  const s = currentServer()
  if (!s) throw new Error('Add a Jellyfin server in Settings → Servers')
  return { s, query: { userId: s.userId, ParentId: s.libraryId ?? undefined, Recursive: true, EnableTotalRecordCount: true } }
}

const toArtist = (a: BaseItemDto, serverId: string): Entity => ({
  source: 'jellyfin',
  kind: 'artist',
  id: jellyfinTrackId(serverId, a.Id),
  name: a.Name || 'Artist',
  subtitle: a.AlbumCount ? `${a.AlbumCount} album${a.AlbumCount === 1 ? '' : 's'}` : 'Artist',
  artwork: a.ImageTags?.Primary ? `media://jellyfin/${serverId}/Items/${a.Id}/Images/Primary?maxHeight=400&quality=90` : undefined,
})

const toAlbum = (it: BaseItemDto, serverId: string): Entity => ({
  source: 'jellyfin',
  kind: 'album',
  id: jellyfinTrackId(serverId, it.Id),
  name: it.Name || 'Album',
  subtitle: [it.AlbumArtist, it.ProductionYear].filter(Boolean).join(' · '),
  artwork: it.ImageTags?.Primary ? `media://jellyfin/${serverId}/Items/${it.Id}/Images/Primary?maxHeight=400&quality=90` : undefined,
})

/** Play counts from the plugin's listening history (null: no plugin on this server), kept 5 minutes. */
const counts: Record<string, { at: number; ids: string[] | null }> = {}
async function ranked(kind: 'track' | 'album' | 'artist'): Promise<string[] | null> {
  const s = currentServer()
  if (!s) return null
  const key = `${s.id}:${kind}`
  if (counts[key] && Date.now() - counts[key].at < 5 * 60_000) return counts[key].ids
  let ids: string[] | null = null
  try {
    const list: { id?: string; n: number }[] =
      kind === 'artist'
        ? // all-time playtime, the same ranking as Stats → Top artists
          (await jf<{ ArtistId?: string; SecondsPlayed: number }[]>('/HQPlayer/stats/playtime', { query: { by: 'artist', limit: 100000 } })).map((a) => ({ id: a.ArtistId, n: a.SecondsPlayed }))
        : (await jf<{ ItemId?: string; AlbumId?: string; PlayCount: number; Seconds?: number }[]>(`/HQPlayer/stats/${kind}-play-counts`)).map((c) => ({
            id: kind === 'track' ? c.ItemId : c.AlbumId,
            n: kind === 'album' ? (c.Seconds ?? c.PlayCount) : c.PlayCount,
          }))
    ids = list
      .filter((c) => c.id && c.n > 0)
      .sort((a, b) => b.n - a.n)
      .map((c) => c.id!)
  } catch {
    ids = null // no plugin (or it's down): "Most played" isn't offered
  }
  counts[key] = { at: Date.now(), ids }
  return ids
}

/** Does the server in use have the plugin (so "Most played" can be offered)? */
export const hasPlayCounts = async () => (await ranked('track')) !== null

export const jellyfin = {
  status(): AccountStatus {
    const s = currentServer()
    const signedIn = !!s && !!tokenOf(s.id)
    return { connected: fullMode() && signedIn, userName: s ? `${s.userName} on ${s.name}` : null }
  },

  async liked(): Promise<Track[]> {
    const s = currentServer()
    if (!s) return []
    const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, Recursive: true, IncludeItemTypes: 'Audio', Filters: 'IsFavorite', SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 5000, Fields: FIELDS } })
    return tracks(r, s.id)
  },

  async playlists(): Promise<RemotePlaylist[]> {
    const s = currentServer()
    if (!s) return []
    const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, Recursive: true, IncludeItemTypes: 'Playlist', SortBy: 'SortName', Fields: 'ChildCount' } })
    return r.Items.map((p) => ({
      id: jellyfinTrackId(s.id, p.Id),
      name: p.Name || 'Playlist',
      artwork: p.ImageTags?.Primary ? `media://jellyfin/${s.id}/Items/${p.Id}/Images/Primary?maxHeight=400` : undefined,
      owner: s.name,
      total: p.ChildCount ?? 0,
      editable: true,
    }))
  },

  async playlistTracks(id: string): Promise<Track[]> {
    const { serverId, itemId } = split(id)
    const s = serverById(serverId) ?? currentServer()
    if (!s) return []
    const r = await jf<QueryResult<BaseItemDto>>(`/Playlists/${itemId}/Items`, { query: { userId: s.userId, Fields: FIELDS }, serverId: s.id })
    return tracks(r, s.id)
  },

  async search(query: string, limit = 30): Promise<Track[]> {
    const s = currentServer()
    if (!s || !jellyfin.status().connected) return []
    const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, SearchTerm: query, IncludeItemTypes: 'Audio', Recursive: true, Limit: limit, Fields: FIELDS } })
    return tracks(r, s.id)
  },

  /** A page of the server's songs. */
  async tracksPage(start: number, limit: number, sort: TrackSort, dir: Dir): Promise<{ items: Track[]; total: number }> {
    const { s, query } = libraryQuery()
    if (sort === 'plays') {
      const ids = (await ranked('track')) ?? []
      const page = ids.slice(start, start + limit)
      if (!page.length) return { items: [], total: ids.length }
      const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, Ids: page.join(','), Fields: FIELDS } })
      const byId = new Map(tracks(r, s.id).map((t) => [t.id, t]))
      return { items: page.map((id) => byId.get(jellyfinTrackId(s.id, id))).filter((t): t is Track => !!t), total: ids.length }
    }
    const r = await jf<QueryResult<BaseItemDto>>('/Items', {
      query: { ...query, IncludeItemTypes: 'Audio', SortBy: TRACK_SORT[sort], SortOrder: dir === 'desc' ? 'Descending' : 'Ascending', StartIndex: start, Limit: limit, Fields: FIELDS },
    })
    return { items: tracks(r, s.id), total: r.TotalRecordCount }
  },

  /** A page of the server's albums (albums left with no songs are skipped), optionally only those matching `search`. */
  async albumsPage(start: number, limit: number, sort: AlbumSort, dir: Dir, search?: string): Promise<{ items: Entity[]; total: number }> {
    const { s, query } = libraryQuery()
    // the plugin's ranking can't be searched: Name while searching
    if (search) sort = sort === 'plays' ? 'name' : sort
    if (sort === 'plays') {
      const ids = (await ranked('album')) ?? []
      const page = ids.slice(start, start + limit)
      if (!page.length) return { items: [], total: ids.length }
      const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, Ids: page.join(','), Fields: 'ChildCount' } })
      const byId = new Map(r.Items.map((i) => [i.Id.replace(/-/g, ''), i]))
      return { items: page.map((id) => byId.get(id.replace(/-/g, ''))).filter((i): i is BaseItemDto => !!i).map((i) => toAlbum(i, s.id)), total: ids.length }
    }
    const r = await jf<QueryResult<BaseItemDto>>('/Items', {
      query: { ...query, SearchTerm: search || undefined, IncludeItemTypes: 'MusicAlbum', SortBy: ALBUM_SORT[sort], SortOrder: dir === 'desc' ? 'Descending' : 'Ascending', StartIndex: start, Limit: limit, Fields: 'ChildCount' },
    })
    return { items: r.Items.filter((i) => i.ChildCount !== 0).map((i) => toAlbum(i, s.id)), total: r.TotalRecordCount }
  },

  /** A page of the server's album artists, optionally only those matching `search` (Most played falls back to Name while searching). */
  async artistsPage(start: number, limit: number, sort: ArtistSort, dir: Dir, search?: string): Promise<{ items: Entity[]; total: number }> {
    const { s } = libraryQuery()
    if (search && sort === 'plays') sort = 'name'
    if (sort === 'plays') {
      const ids = (await ranked('artist')) ?? []
      const page = ids.slice(start, start + limit)
      if (!page.length) return { items: [], total: ids.length }
      const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, Ids: page.join(',') } })
      const byId = new Map(r.Items.map((i) => [i.Id.replace(/-/g, ''), i]))
      return { items: page.map((id) => byId.get(id.replace(/-/g, ''))).filter((i): i is BaseItemDto => !!i).map((i) => toArtist(i, s.id)), total: ids.length }
    }
    const r = await jf<QueryResult<BaseItemDto>>('/Artists/AlbumArtists', {
      query: {
        userId: s.userId,
        ParentId: s.libraryId ?? undefined,
        SearchTerm: search || undefined,
        SortBy: sort === 'added' ? 'DateCreated,SortName' : 'SortName',
        SortOrder: dir === 'desc' ? 'Descending' : 'Ascending',
        StartIndex: start,
        Limit: limit,
        EnableTotalRecordCount: true,
      },
    })
    return { items: r.Items.map((i) => toArtist(i, s.id)), total: r.TotalRecordCount }
  },

  /** Songs of one server by item id (History), keyed by item id without dashes; songs gone from the server are missing. */
  async tracksByIds(serverId: string, itemIds: string[], onBatch?: (found: Map<string, Track>) => void): Promise<Map<string, Track>> {
    const out = new Map<string, Track>()
    const s = serverById(serverId)
    if (!s) return out
    // 50 ids a request, 4 requests at a time; a request that fails only loses its own songs
    const chunks: string[][] = []
    for (let i = 0; i < itemIds.length; i += 50) chunks.push(itemIds.slice(i, i + 50))
    for (let i = 0; i < chunks.length; i += 4) {
      const got = await Promise.allSettled(
        chunks.slice(i, i + 4).map((ids) => jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, Ids: ids.join(','), Fields: FIELDS }, serverId: s.id })),
      )
      for (const r of got) if (r.status === 'fulfilled') for (const it of r.value.Items) out.set(it.Id.replace(/-/g, ''), toTrack(it, s.id))
      onBatch?.(out)
    }
    return out
  },

  /** A song's album and first artist on its server (song menu → Go to album / Go to artist). */
  async trackRefs(trackId: string): Promise<{ album?: Entity; artist?: Entity }> {
    const { serverId, itemId } = split(trackId)
    const s = serverById(serverId) ?? currentServer()
    if (!s) return {}
    const it = (await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, Ids: itemId }, serverId: s.id })).Items[0]
    if (!it) return {}
    const a = it.ArtistItems?.[0] ?? it.AlbumArtists?.[0]
    return {
      album: it.AlbumId
        ? {
            source: 'jellyfin',
            kind: 'album',
            id: jellyfinTrackId(s.id, it.AlbumId),
            name: it.Album || 'Album',
            subtitle: it.AlbumArtist ?? undefined,
            artwork: it.AlbumPrimaryImageTag ? `media://jellyfin/${s.id}/Items/${it.AlbumId}/Images/Primary?maxHeight=400&quality=90` : undefined,
          }
        : undefined,
      artist: a?.Id
        ? { source: 'jellyfin', kind: 'artist', id: jellyfinTrackId(s.id, a.Id), name: a.Name || 'Artist', artwork: `media://jellyfin/${s.id}/Items/${a.Id}/Images/Primary?maxHeight=400&quality=90` }
        : undefined,
    }
  },

  /** Search → Artists → Jellyfin: the server's artists (open with artistTracks). */
  async searchArtists(query: string): Promise<Entity[]> {
    const s = currentServer()
    if (!s || !jellyfin.status().connected) return []
    const r = await jf<QueryResult<BaseItemDto>>('/Artists', { query: { userId: s.userId, ParentId: s.libraryId ?? undefined, SearchTerm: query, Limit: 30 } })
    return r.Items.map((a) => toArtist(a, s.id))
  },

  /** Search → Albums → Jellyfin: the server's albums (open with albumTracks). */
  async searchAlbums(query: string): Promise<Entity[]> {
    const s = currentServer()
    if (!s || !jellyfin.status().connected) return []
    const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, ParentId: s.libraryId ?? undefined, Recursive: true, IncludeItemTypes: 'MusicAlbum', SearchTerm: query, Limit: 30 } })
    return r.Items.map((a) => toAlbum(a, s.id))
  },

  /** Search → Playlists → Jellyfin: the server's playlists (they open like any server playlist). */
  async searchPlaylists(query: string): Promise<Entity[]> {
    const s = currentServer()
    if (!s || !jellyfin.status().connected) return []
    const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, Recursive: true, IncludeItemTypes: 'Playlist', SearchTerm: query, Limit: 30, Fields: 'ChildCount' } })
    return r.Items.map((p) => ({
      source: 'jellyfin',
      kind: 'playlist',
      id: jellyfinTrackId(s.id, p.Id),
      name: p.Name || 'Playlist',
      subtitle: p.ChildCount ? `${p.ChildCount} songs` : 'Playlist',
      artwork: p.ImageTags?.Primary ? `media://jellyfin/${s.id}/Items/${p.Id}/Images/Primary?maxHeight=400` : undefined,
    }))
  },

  /** An artist's songs on the server, album by album. */
  async artistTracks(artistId: string): Promise<Track[]> {
    const { serverId, itemId } = split(artistId)
    const s = serverById(serverId) ?? currentServer()
    if (!s) return []
    const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, ArtistIds: itemId, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'ProductionYear,Album,ParentIndexNumber,IndexNumber,SortName', Fields: FIELDS }, serverId: s.id })
    return tracks(r, s.id)
  },

  /** An album's songs in disc and track order. */
  async albumTracks(albumId: string): Promise<Track[]> {
    const { serverId, itemId } = split(albumId)
    const s = serverById(serverId) ?? currentServer()
    if (!s) return []
    const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, ParentId: itemId, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'ParentIndexNumber,IndexNumber,SortName', Fields: FIELDS }, serverId: s.id })
    return tracks(r, s.id)
  },

  /** Works saved for an album with the plugin's metadata editor (none without the plugin). */
  async albumWorks(albumId: string): Promise<SavedWork[]> {
    const { serverId, itemId } = split(albumId)
    const s = serverById(serverId) ?? currentServer()
    if (!s) return []
    return jf<SavedWork[]>('/HQPlayer/works', { query: { albumId: itemId.replace(/-/g, '') }, serverId: s.id }).catch(() => [])
  },

  async isLiked(ids: string[]): Promise<boolean[]> {
    const s = currentServer()
    if (!s || !ids.length) return ids.map(() => false)
    const items = ids.map((x) => split(x).itemId)
    const r = await jf<QueryResult<BaseItemDto>>('/Items', { query: { userId: s.userId, Ids: items.join(','), Fields: 'UserData' } })
    const fav = new Set(r.Items.filter((i) => i.UserData?.IsFavorite).map((i) => i.Id.replace(/-/g, '')))
    return items.map((x) => fav.has(x.replace(/-/g, '')))
  },

  async setLiked(id: string, liked: boolean) {
    const { serverId, itemId } = split(id)
    await jf(`/UserFavoriteItems/${itemId}`, { method: liked ? 'POST' : 'DELETE', serverId })
  },

  async addToPlaylist(playlistId: string, trackId: string) {
    const p = split(playlistId)
    const t = split(trackId)
    const s = serverById(p.serverId)
    if (!s) throw new Error('That server is no longer saved')
    await jf(`/Playlists/${p.itemId}/Items`, { method: 'POST', query: { ids: t.itemId, userId: s.userId }, serverId: s.id })
  },

  /**
   * How to download a song. Best: the original file when iOS plays it (FLAC, ALAC, AAC, MP3), else the
   * server converts it to FLAC (DSD, APE, WavPack...). Low / Mid: the server makes an MP3 at 128 / 256
   * kbps, unless the file is already that small.
   */
  async plan(id: string, quality: Quality): Promise<StreamPlan> {
    const { serverId, itemId } = split(id)
    const s = serverById(serverId)
    if (!s) throw new Error('This song is on a Jellyfin server that is no longer saved')
    const token = tokenOf(s.id)
    if (!token) throw new Error(`Sign in to ${s.name} again (Settings → Servers)`)
    const item = await jf<BaseItemDto>(`/Items/${itemId}`, { query: { userId: s.userId, Fields: FIELDS }, serverId: s.id })
    const src = item.MediaSources?.[0]
    const audio = src?.MediaStreams?.find((m) => m.Type === 'Audio')
    const codec = (audio?.Codec ?? '').toLowerCase()
    const kbps = Math.round((audio?.BitRate ?? src?.Bitrate ?? 0) / 1000)
    const gainDb = item.NormalizationGain != null ? Math.round((item.NormalizationGain + 4) * 10) / 10 : undefined
    const rate = audio?.SampleRate ? `${Math.round(audio.SampleRate / 100) / 10} kHz` : ''
    const bits = audio?.BitDepth ? `${audio.BitDepth}-bit` : ''
    const bytes = src?.Size ?? undefined
    const direct = codec.startsWith('pcm') ? null : DIRECT[codec]
    const lossy = codec === 'mp3' || codec === 'aac'
    const key = `api_key=${encodeURIComponent(token)}`

    if (quality !== 'best' && !(lossy && kbps && kbps <= LOSSY_KBPS[quality] + 8)) {
      const target = LOSSY_KBPS[quality]
      return {
        source: 'jellyfin',
        id,
        kind: 'file',
        url: `${s.url}/Audio/${itemId}/stream.mp3?audioCodec=mp3&audioBitRate=${target * 1000}&${key}`,
        ext: 'mp3',
        codec: 'mp3',
        kbps: target,
        quality: `MP3 · ${target} kbps`,
        gainDb,
      }
    }
    if (direct) {
      return {
        source: 'jellyfin',
        id,
        kind: 'file',
        url: `${s.url}/Audio/${itemId}/stream?static=true&${key}`,
        ext: direct.ext,
        codec: direct.codec,
        kbps: kbps || 1000,
        quality: [direct.name, lossy ? (kbps ? `${kbps} kbps` : '') : bits, lossy ? '' : rate].filter(Boolean).join(' · '),
        bytes,
        gainDb,
      }
    }
    // WAV, DSD, APE...: the server sends FLAC (lossless, much smaller than WAV)
    const from = codec.startsWith('pcm') ? 'WAV' : codec.startsWith('dsd') ? 'DSD' : codec.toUpperCase() || 'the original'
    return {
      source: 'jellyfin',
      id,
      kind: 'file',
      url: `${s.url}/Audio/${itemId}/stream.flac?audioCodec=flac&${key}`,
      ext: 'flac',
      codec: 'flac',
      kbps: kbps || 1000,
      quality: [`FLAC from ${from}`, bits, rate].filter(Boolean).join(' · '),
      gainDb,
    }
  },
}
