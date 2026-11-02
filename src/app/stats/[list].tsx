import { useLocalSearchParams } from 'expo-router'
import { FlatList, View } from 'react-native'
import { DEFAULT_METRIC, ranked, StatRow, type Metric, type StatsList } from '../../components/StatRow'
import { Empty, Header, Spinner } from '../../components/ui'
import { useHistoryEntries } from '../../lib/serverHistory'
import { rangeLabel, PRESETS, useStats, type Timeframe } from '../../lib/serverStats'
import { useSettings } from '../../lib/settings'
import { useColors } from '../../lib/theme'

const TITLES: Record<StatsList, string> = { tracks: 'Top tracks', artists: 'Top artists', albums: 'Top albums' }

/** History → Stats → a section title: the whole ranked list for the same timeframe. */
export default function StatsListScreen() {
  const c = useColors()
  const p = useLocalSearchParams<{ list: StatsList; tf: string; metric?: Metric }>()
  const tf: Timeframe = JSON.parse(p.tf ?? '{"period":"week"}')
  const unit = useSettings().statsUnit
  const { data, loading } = useStats(tf, useHistoryEntries())
  const metric = p.metric ?? DEFAULT_METRIC[p.list]
  const items = data ? ranked(data[p.list], metric) : []
  const when = tf.period === 'week' ? PRESETS[0].label : tf.period === 'all' ? PRESETS[3].label : rangeLabel(tf)
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={`${TITLES[p.list]} · ${when}`} />
      {loading ? (
        <Spinner />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.key}
          contentContainerStyle={{ paddingBottom: 160 }}
          initialNumToRender={30}
          renderItem={({ item, index }) => <StatRow t={item} i={index} list={p.list} metric={metric} unit={unit} />}
          ListEmptyComponent={<Empty icon="time-outline" title="Nothing played in this timeframe" />}
        />
      )}
    </View>
  )
}
