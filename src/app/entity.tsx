import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { CollectionHeader } from '../components/CollectionHeader'
import { EntityRow } from '../components/EntityList'
import { TrackList } from '../components/TrackRow'
import { Button, Empty, ErrorText, Header, Spinner, Txt } from '../components/ui'
import type { Entity, EntityPage } from '../core/types'
import { createPlaylist } from '../lib/library'
import { cleanError, entityPage, SOURCES } from '../lib/sources'
import { useColors, ui } from '../lib/theme'
import { toast } from '../lib/ui'

/** An artist, playlist or profile from search or New releases: its songs and (for people) playlists. */
export default function EntityScreen() {
  const c = useColors()
  const { e: raw } = useLocalSearchParams<{ e: string }>()
  const e = JSON.parse(raw) as Entity
  const [page, setPage] = useState<EntityPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    entityPage(e).then(
      (p) => {
        setPage(p)
        setLoading(false)
      },
      (err) => {
        const msg = cleanError(err).message
        setError(e.source === 'spotify' && /403|forbidden/i.test(msg) ? "Spotify doesn't let apps read this (it's probably made by Spotify)." : msg)
        setLoading(false)
      },
    )
  }, [raw])
  useEffect(load, [load])

  const tracks = page?.tracks ?? []
  const kindName = e.kind === 'artist' ? 'artist' : e.kind === 'playlist' ? 'playlist' : e.source === 'youtube' ? 'channel' : 'profile'
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={e.name} />
      <TrackList
        tracks={tracks}
        onRefresh={load}
        refreshing={loading && !!page}
        header={
          <>
            <CollectionHeader
              title={e.name}
              sub={`${SOURCES[e.source].name} ${kindName}${e.subtitle ? ` · ${e.subtitle}` : ''}`}
              artwork={e.artwork ?? tracks[0]?.artwork}
              tracks={tracks}
              downloadKey={e.kind === 'playlist' ? `entity:${e.source}:${e.id}` : undefined}
            />
            {e.kind === 'playlist' && tracks.length ? (
              <Button
                title="Save to my playlists"
                icon="add-circle-outline"
                kind="ghost"
                small
                style={{ alignSelf: 'flex-start', marginHorizontal: ui.pad, marginBottom: 8 }}
                onPress={() => {
                  const id = createPlaylist(tracks, e.name)
                  toast('Saved to your playlists')
                  router.push({ pathname: '/playlist/[id]', params: { id } })
                }}
              />
            ) : null}
            {loading && !page ? <Spinner /> : null}
            {error ? <ErrorText text={error} onRetry={load} /> : null}
          </>
        }
        footer={
          page?.playlists.length ? (
            <View style={{ marginTop: 16 }}>
              <Txt size={18} weight="800" style={{ paddingHorizontal: ui.pad, marginBottom: 4 }}>
                {e.kind === 'artist' ? 'Albums and playlists' : 'Playlists'}
              </Txt>
              {page.playlists.map((p) => (
                <EntityRow key={`${p.source}:${p.id}`} entity={p} />
              ))}
            </View>
          ) : null
        }
        empty={!loading && !error && page && !page.playlists.length ? <Empty icon="musical-notes-outline" title="Nothing here yet" /> : null}
      />
    </View>
  )
}
