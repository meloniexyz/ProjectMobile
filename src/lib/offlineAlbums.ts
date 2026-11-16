import type { Entity, Track } from '../core/types'
import type { SavedWork } from '../core/works'
import { jellyfin } from './sources'
import { JsonFile } from './storage'

/**
 * Album pages of downloaded Jellyfin songs, kept on the phone so "Go to album" and the album page
 * work offline: the whole song list (the ones not downloaded show greyed out), cover and saved works.
 */

export interface SavedAlbum {
  entity: Entity
  tracks: Track[]
  works: SavedWork[]
}

const file = new JsonFile<{ albums: Record<string, SavedAlbum>; trackAlbum: Record<string, string> }>('offline-albums.json', { albums: {}, trackAlbum: {} })

export const savedAlbum = (albumId: string): SavedAlbum | undefined => file.get().albums[albumId]
export const savedAlbumOf = (trackUid: string): SavedAlbum | undefined => {
  const id = file.get().trackAlbum[trackUid]
  return id ? savedAlbum(id) : undefined
}

export function saveAlbum(a: SavedAlbum) {
  const cur = file.get()
  const trackAlbum = { ...cur.trackAlbum }
  for (const t of a.tracks) trackAlbum[t.uid] = a.entity.id
  file.set({ albums: { ...cur.albums, [a.entity.id]: a }, trackAlbum })
}

let filling = false
/** Saves the album of every downloaded Jellyfin song that has none saved yet (online; failures are retried next time). */
export async function saveAlbumsOf(tracks: Track[]) {
  if (filling) return
  filling = true
  try {
    for (const t of tracks) {
      if (t.source !== 'jellyfin' || savedAlbumOf(t.uid)) continue
      try {
        const album = (await jellyfin.trackRefs(t.id)).album
        if (!album) continue
        const [songs, works] = await Promise.all([jellyfin.albumTracks(album.id), jellyfin.albumWorks(album.id)])
        saveAlbum({ entity: album, tracks: songs, works })
      } catch (err) {
        console.warn('[offline albums]', t.title, err)
        return // probably offline: try again later
      }
    }
  } finally {
    filling = false
  }
}

/** Forgets albums none of whose songs are downloaded any more. */
export function pruneAlbums(downloaded: (uid: string) => boolean) {
  const cur = file.get()
  const keep = Object.values(cur.albums).filter((a) => a.tracks.some((t) => downloaded(t.uid)))
  if (keep.length === Object.keys(cur.albums).length) return
  const ids = new Set(keep.map((a) => a.entity.id))
  file.set({
    albums: Object.fromEntries(keep.map((a) => [a.entity.id, a])),
    trackAlbum: Object.fromEntries(Object.entries(cur.trackAlbum).filter(([, id]) => ids.has(id))),
  })
}
