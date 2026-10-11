import { router, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'
import type { RemotePlaylist, SourceId, Track } from '../../../core/types'
import { CollectionHeader } from '../../../components/CollectionHeader'
import { TrackList } from '../../../components/TrackRow'
import { Button, Empty, ErrorText, Header, Spinner } from '../../../components/ui'
import { cachedList, fetchers, keys, useList } from '../../../lib/accounts'
import { updateCollection } from '../../../lib/downloads'
import { createPlaylist } from '../../../lib/library'
import { SOURCES } from '../../../lib/sources'
import { useColors, ui } from '../../../lib/theme'
import { toast } from '../../../lib/ui'

export default function RemotePlaylistScreen() {
  const c = useColors()
  const { source, id, name } = useLocalSearchParams<{ source: SourceId; id: string; name?: string }>()
  const key = keys.playlist(source, id)
  const { data, loading, error, refresh } = useList<Track[]>(key, fetchers.playlistTracks(source, id))
  const meta = cachedList<RemotePlaylist[]>(keys.playlists(source))?.find((p) => p.id === id)
  const tracks = data ?? []
  const dlKey = `remote:${source}:${id}`
  useEffect(() => {
    if (data) updateCollection(dlKey, data)
  }, [data, dlKey])
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={meta?.name ?? name ?? 'Playlist'} />
      <TrackList
        tracks={tracks}
        onRefresh={refresh}
        refreshing={loading && !!data}
        header={
          <>
            <CollectionHeader
              title={meta?.name ?? name ?? 'Playlist'}
              sub={`${SOURCES[source]?.name}${meta?.owner ? ` · ${meta.owner}` : ''}`}
              artwork={meta?.artwork ?? tracks[0]?.artwork}
              tracks={tracks}
              downloadKey={dlKey}
            />
            {/* a ProjectM copy can mix in songs from any service, and syncs to your other devices */}
            <Button
              title="Save to my playlists"
              icon="add-circle-outline"
              kind="ghost"
              small
              disabled={!tracks.length}
              style={{ alignSelf: 'flex-start', marginHorizontal: ui.pad, marginBottom: 8 }}
              onPress={() => {
                const pid = createPlaylist(tracks, meta?.name ?? name)
                toast('Saved to your playlists')
                router.push({ pathname: '/playlist/[id]', params: { id: pid } })
              }}
            />
            {loading && !data ? <Spinner /> : null}
            {error ? <ErrorText text={error} onRetry={refresh} /> : null}
          </>
        }
        empty={!loading && !error && data ? <Empty title="This playlist is empty" /> : null}
      />
    </View>
  )
}
