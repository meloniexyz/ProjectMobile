import { FlatList, Pressable, TextInput, useWindowDimensions, View } from 'react-native'
import { openEntity } from '../../components/EntityList'
import { Artwork, Empty, ErrorText, Header, Icon, IconButton, Spinner, Txt } from '../../components/ui'
import type { Entity } from '../../core/types'
import { ALBUM_SORTS, ARTIST_SORTS, useServerLibrary } from '../../lib/serverLibrary'
import { useColors, ui } from '../../lib/theme'
import { SortChips } from './tracks'

/** Library → Jellyfin → Albums: every album on the server in use, two per row. */
export default function ServerAlbums() {
  return <ServerGrid kind="albums" />
}

/** Albums or artists of the server in use, two per row, searchable and sortable (artists round). */
export function ServerGrid({ kind }: { kind: 'albums' | 'artists' }) {
  const c = useColors()
  const lib = useServerLibrary(kind)
  const noun = kind === 'albums' ? 'album' : 'artist'
  const { width } = useWindowDimensions()
  const gap = 14
  const size = Math.floor((width - ui.pad * 2 - gap) / 2)
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={kind === 'albums' ? 'Albums' : 'Artists'} />
      <View style={{ marginHorizontal: ui.pad, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg3, borderRadius: 8, paddingHorizontal: 12 }}>
        <Icon name="search" size={18} color={c.text2} />
        <TextInput
          accessibilityLabel={`Search ${kind}`}
          value={lib.query}
          onChangeText={lib.setQuery}
          placeholder={`Search ${kind}`}
          placeholderTextColor={c.text3}
          returnKeyType="search"
          autoCorrect={false}
          style={{ flex: 1, color: c.text, fontSize: 15, paddingVertical: 9 }}
        />
        {lib.query ? <IconButton name="close-circle" size={18} color={c.text2} label="Clear search" onPress={() => lib.setQuery('')} /> : null}
      </View>
      <FlatList
        data={lib.items}
        keyExtractor={(a: Entity) => a.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        numColumns={2}
        columnWrapperStyle={{ gap, paddingHorizontal: ui.pad }}
        contentContainerStyle={{ gap: 16, paddingBottom: 140 }}
        onEndReached={lib.more}
        onEndReachedThreshold={1.5}
        onRefresh={lib.reload}
        refreshing={false}
        ListHeaderComponent={
          <>
            <SortChips<string> options={(kind === 'albums' ? ALBUM_SORTS : ARTIST_SORTS).filter(([k]) => k !== 'plays' || lib.plays)} sort={lib.sort} dir={lib.dir} choose={(s) => lib.choose(s as never)} total={lib.total} noun={noun} />
            {lib.total === null && !lib.error ? <Spinner /> : null}
            {lib.error ? <ErrorText text={lib.error} onRetry={lib.reload} /> : null}
          </>
        }
        ListEmptyComponent={lib.total === 0 ? <Empty icon={kind === 'albums' ? 'disc-outline' : 'mic-outline'} title={lib.searching ? `No ${kind} match` : lib.sort === 'plays' ? 'No plays recorded yet' : `No ${kind} on this server`} /> : null}
        renderItem={({ item: a }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={a.name} onPress={() => openEntity(a)} style={{ width: size, gap: 6 }}>
            <Artwork src={a.artwork} size={size} radius={kind === 'albums' ? 8 : size / 2} />
            <Txt weight="600" size={14} lines={1}>
              {a.name}
            </Txt>
            {a.subtitle ? (
              <Txt tone="text2" size={12} lines={1}>
                {a.subtitle}
              </Txt>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  )
}
