import { ScrollView, View } from 'react-native'
import { TrackList } from '../../components/TrackRow'
import { Chip, Empty, ErrorText, Header, Spinner, Txt } from '../../components/ui'
import { TRACK_SORTS, useServerLibrary } from '../../lib/serverLibrary'
import { useColors, ui } from '../../lib/theme'

/** Library → Jellyfin → Tracks: every song on the server in use. */
export default function ServerTracks() {
  const c = useColors()
  const lib = useServerLibrary('tracks')
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Tracks" />
      <TrackList
        tracks={lib.items}
        onEndReached={lib.more}
        onRefresh={lib.reload}
        header={
          <>
            <SortChips options={TRACK_SORTS.filter(([k]) => k !== 'plays' || lib.plays)} sort={lib.sort} dir={lib.dir} choose={lib.choose} total={lib.total} noun="track" />
            {lib.total === null && !lib.error ? <Spinner /> : null}
            {lib.error ? <ErrorText text={lib.error} onRetry={lib.reload} /> : null}
          </>
        }
        empty={lib.total === 0 ? <Empty title={lib.sort === 'plays' ? 'No plays recorded yet' : 'No tracks on this server'} /> : null}
      />
    </View>
  )
}

/** Sort chips: tap one to sort by it, tap it again to flip the direction (Most played is always most first). */
export function SortChips<S extends string>(p: { options: [S, string][]; sort: S; dir: 'asc' | 'desc'; choose: (s: S) => void; total: number | null; noun: string }) {
  return (
    <View style={{ gap: 6, paddingBottom: 6 }}>
      {p.total !== null ? (
        <Txt tone="text2" size={13} style={{ paddingHorizontal: ui.pad }}>
          {p.total.toLocaleString()} {p.noun}
          {p.total === 1 ? '' : 's'}
        </Txt>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: ui.pad }}>
        {p.options.map(([k, label]) => (
          <Chip key={k} label={k === p.sort && k !== 'plays' ? `${label} ${p.dir === 'asc' ? '↑' : '↓'}` : label} active={k === p.sort} onPress={() => p.choose(k)} />
        ))}
      </ScrollView>
    </View>
  )
}
