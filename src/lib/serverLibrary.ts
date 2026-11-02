import { useCallback, useEffect, useRef, useState } from 'react'
import { cleanError, jellyfin } from './sources'
import { hasPlayCounts, type AlbumSort, type ArtistSort, type Dir, type TrackSort } from './sources/jellyfin'
import { JsonFile } from './storage'

/**
 * Library → Jellyfin → Tracks / Albums / Artists: the server's whole library, a page at a time as you scroll,
 * sorted like Negusify on Windows (the sort you pick is remembered).
 */

const sortFile = new JsonFile<{ tracks: { sort: TrackSort; dir: Dir }; albums: { sort: AlbumSort; dir: Dir }; artists?: { sort: ArtistSort; dir: Dir } }>('library-sort.json', {
  tracks: { sort: 'title', dir: 'asc' },
  albums: { sort: 'name', dir: 'asc' },
})

export const TRACK_SORTS: [TrackSort, string][] = [
  ['title', 'Title'],
  ['artist', 'Artist'],
  ['album', 'Album'],
  ['added', 'Date added'],
  ['duration', 'Duration'],
  ['plays', 'Most played'],
]
export const ALBUM_SORTS: [AlbumSort, string][] = [
  ['name', 'Name'],
  ['artist', 'Album artist'],
  ['year', 'Year'],
  ['added', 'Date added'],
  ['plays', 'Most played'],
]
export const ARTIST_SORTS: [ArtistSort, string][] = [
  ['name', 'Name'],
  ['added', 'Date added'],
  ['plays', 'Most played'],
]

const PAGE = 100

export function useServerLibrary<K extends 'tracks' | 'albums' | 'artists'>(kind: K) {
  type Item = K extends 'tracks' ? Awaited<ReturnType<typeof jellyfin.tracksPage>>['items'][number] : Awaited<ReturnType<typeof jellyfin.albumsPage>>['items'][number]
  type Sort = K extends 'tracks' ? TrackSort : K extends 'albums' ? AlbumSort : ArtistSort
  const [order, setOrder] = useState(() => (sortFile.load()[kind] ?? { sort: 'name', dir: 'asc' }) as { sort: Sort; dir: Dir })
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [plays, setPlays] = useState(false)
  // Albums / Artists: what's typed in the search box, applied 300 ms after the last key
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])
  const busy = useRef(false)
  const gen = useRef(0)

  // "Most played" needs the plugin's listening history
  useEffect(() => {
    hasPlayCounts().then(setPlays)
  }, [])
  const sort = (order.sort === 'plays' && !plays ? (kind === 'tracks' ? 'title' : 'name') : order.sort) as Sort

  const more = useCallback(
    async (reset = false) => {
      if (busy.current && !reset) return
      const start = reset ? 0 : items.length
      if (!reset && total !== null && start >= total) return
      const g = reset ? ++gen.current : gen.current
      busy.current = true
      setError(null)
      try {
        const r =
          kind === 'tracks'
            ? await jellyfin.tracksPage(start, PAGE, sort as TrackSort, order.dir)
            : kind === 'albums'
              ? await jellyfin.albumsPage(start, PAGE, sort as AlbumSort, order.dir, search)
              : await jellyfin.artistsPage(start, PAGE, sort as ArtistSort, order.dir, search)
        if (g !== gen.current) return
        setItems((cur) => [...(reset ? [] : cur), ...(r.items as Item[])])
        setTotal(r.total)
      } catch (e) {
        if (g === gen.current) setError(cleanError(e).message)
      } finally {
        if (g === gen.current) busy.current = false
      }
    },
    [items.length, total, kind, sort, order.dir, search],
  )

  // a new sort or search starts the list over
  useEffect(() => {
    busy.current = false
    setItems([])
    setTotal(null)
    void more(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order.dir, search])

  const choose = (next: Sort) => {
    // same as Windows: newest first for dates, otherwise A-Z; picking the current sort flips it
    const dir: Dir = next === order.sort ? (order.dir === 'asc' ? 'desc' : 'asc') : next === 'added' || next === 'year' ? 'desc' : 'asc'
    const o = { sort: next, dir }
    setOrder(o)
    sortFile.set({ ...sortFile.load(), [kind]: o })
  }

  return { items, total, error, sort, dir: order.dir, choose, plays, query, setQuery, searching: !!search, more: () => void more(), reload: () => void more(true) }
}
