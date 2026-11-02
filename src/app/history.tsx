import DateTimePicker from '@react-native-community/datetimepicker'
import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, ScrollView, View } from 'react-native'
import type { ListenEntry } from '../core/types'
import { fmtTime, formatListeningSeconds, type TimeUnit } from '../core/format'
import { useStore } from '../core/store'
import { Dropdown, Sheet, type DropdownOption } from '../components/Overlays'
import { DEFAULT_METRIC, ranked, StatRow, type Metric, type StatsList } from '../components/StatRow'
import { Artwork, Button, Chip, Empty, Header, Icon, Spinner, Txt } from '../components/ui'
import { clearHistory, formatRanges, historyStore } from '../lib/history'
import { loadServerHistory, useServerHistory } from '../lib/serverHistory'
import { dayString, parseDay, PRESETS, rangeLabel, useStats, type Timeframe } from '../lib/serverStats'
import { updateSettings, useSettings } from '../lib/settings'
import { playTracks } from '../lib/player'
import { SOURCES } from '../lib/sources'
import { useColors, ui } from '../lib/theme'
import { openTrackSheet } from '../lib/ui'

const dayLabel = (t: number) => {
  const d = new Date(t)
  const today = new Date()
  const yest = new Date(Date.now() - 864e5)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

type Item = { kind: 'day'; label: string; key: string } | { kind: 'entry'; e: ListenEntry; key: string }

export default function History() {
  const c = useColors()
  const own = useStore(historyStore, (s) => s.entries)
  // Full mode with the plugin: the server's history (streaming and Jellyfin plays, every device and app)
  const server = useServerHistory()
  useEffect(() => {
    void loadServerHistory()
  }, [])
  const entries = server.entries ?? own
  const [tab, setTab] = useState<'timeline' | 'stats'>('timeline')
  const items = useMemo(() => {
    const out: Item[] = []
    let last = ''
    for (const e of entries.slice(0, 1500)) {
      const label = dayLabel(e.startedAt)
      if (label !== last) {
        out.push({ kind: 'day', label, key: `d-${e.startedAt}` })
        last = label
      }
      out.push({ kind: 'entry', e, key: e.id })
    }
    return out
  }, [entries])

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header
        title="Listening history"
        right={
          !server.entries && entries.length ? (
            <Button
              small
              kind="ghost"
              title="Clear"
              onPress={() =>
                Alert.alert('Clear listening history?', 'Every recorded play is removed from this phone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: clearHistory },
                ])
              }
            />
          ) : null
        }
      />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: ui.pad, paddingBottom: 8 }}>
        <Chip label="Timeline" active={tab === 'timeline'} onPress={() => setTab('timeline')} />
        <Chip label="Stats" active={tab === 'stats'} onPress={() => setTab('stats')} />
      </View>
      {server.loading && !server.entries ? (
        <Spinner />
      ) : !entries.length ? (
        <Empty icon="time-outline" title="Nothing played yet" text="Every song you play shows up here, with the parts you listened to." />
      ) : tab === 'timeline' ? (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ paddingBottom: 160 }}
          onRefresh={server.entries ? () => void loadServerHistory() : undefined}
          refreshing={server.loading && !!server.entries}
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <Txt size={15} weight="800" style={{ paddingHorizontal: ui.pad, paddingTop: 16, paddingBottom: 6 }}>
                {item.label}
              </Txt>
            ) : (
              <Pressable
                onPress={() => playTracks([item.e.track])}
                onLongPress={() => openTrackSheet(item.e.track)}
                style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: ui.pad, paddingVertical: 6, backgroundColor: pressed ? c.hover : 'transparent' })}
              >
                <Artwork src={item.e.track.artwork} size={44} />
                <View style={{ flex: 1 }}>
                  <Txt weight="600" lines={1}>
                    {item.e.track.title}
                  </Txt>
                  <Txt tone="text2" size={12} lines={1}>
                    {item.e.track.artist} · {SOURCES[item.e.track.source].short}
                    {item.e.via ? ` → ${SOURCES[item.e.via].short}` : ''}
                  </Txt>
                  <Txt tone="text3" size={12} lines={1}>
                    {formatRanges(item.e.segments, fmtTime) || 'a few seconds'}
                  </Txt>
                </View>
                <Txt tone="text3" size={12}>
                  {clock(item.e.startedAt)}
                </Txt>
              </Pressable>
            )
          }
        />
      ) : (
        <Stats entries={entries} />
      )}
    </View>
  )
}

const UNITS: DropdownOption<TimeUnit>[] = [
  { value: 'day', label: 'Days' },
  { value: 'hour', label: 'Hours' },
  { value: 'minute', label: 'Minutes' },
]
const METRICS: DropdownOption<Metric>[] = [
  { value: 'time', label: 'Playtime' },
  { value: 'plays', label: 'Plays' },
]

function Stats({ entries }: { entries: ListenEntry[] }) {
  const c = useColors()
  const unit = useSettings().statsUnit
  // a preset (index into PRESETS) or a custom range
  const [preset, setPreset] = useState<number | null>(0)
  const [custom, setCustom] = useState<Timeframe | null>(null)
  const [picking, setPicking] = useState(false)
  const [metrics, setMetrics] = useState(DEFAULT_METRIC)
  const tf = useMemo(() => (preset !== null ? PRESETS[preset].tf() : custom!), [preset, custom])
  const { data: s, loading } = useStats(tf, entries)

  const section = (list: StatsList, title: string) => {
    const metric = metrics[list]
    const items = s ? ranked(s[list], metric).slice(0, 10) : []
    if (!items.length) return null
    return (
      <View style={{ marginTop: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: ui.pad, marginBottom: 6, gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, see all`}
            onPress={() => router.push({ pathname: '/stats/[list]', params: { list, tf: JSON.stringify(tf), metric } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}
          >
            <Txt size={18} weight="800">
              {title}
            </Txt>
            <Icon name="chevron-forward" size={18} color={c.text2} />
          </Pressable>
          <Dropdown
            title={`Rank ${title.toLowerCase().replace('top ', '')} by`}
            label={METRICS.find((m) => m.value === metric)!.label}
            options={METRICS}
            value={[metric]}
            onChange={([m]) => setMetrics((x) => ({ ...x, [list]: m }))}
          />
        </View>
        {items.map((t, i) => (
          <StatRow key={t.key} t={t} i={i} list={list} metric={metric} unit={unit} />
        ))}
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: ui.pad }}>
        {PRESETS.map((p, i) => (
          <Chip key={p.label} label={p.label} active={preset === i} onPress={() => setPreset(i)} />
        ))}
        <Chip label={preset === null && custom ? rangeLabel(custom) : 'Custom'} active={preset === null} onPress={() => setPicking(true)} />
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: ui.pad, marginTop: 14 }}>
        <View style={{ flex: 1, backgroundColor: c.bg3, borderRadius: 10, padding: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt tone="text2" size={12}>
              Listening time
            </Txt>
            <Dropdown title="Show time in" label={UNITS.find((u) => u.value === unit)!.label} options={UNITS} value={[unit]} onChange={([u]) => updateSettings({ statsUnit: u })} />
          </View>
          <Txt size={20} weight="800">
            {s ? formatListeningSeconds(s.seconds, unit) : '…'}
          </Txt>
        </View>
        <View style={{ flex: 0.6, backgroundColor: c.bg3, borderRadius: 10, padding: 14, gap: 4 }}>
          <Txt tone="text2" size={12} style={{ paddingVertical: 7 }}>
            Plays
          </Txt>
          <Txt size={20} weight="800">
            {s ? s.plays.toLocaleString() : '…'}
          </Txt>
        </View>
      </View>
      {loading && !s ? <Spinner /> : null}
      {s && !s.tracks.length ? <Empty icon="time-outline" title="Nothing played in this timeframe" /> : null}
      {section('tracks', 'Top tracks')}
      {section('artists', 'Top artists')}
      {section('albums', 'Top albums')}
      <CustomRange
        visible={picking}
        initial={custom ?? tf}
        onClose={() => setPicking(false)}
        onPick={(t) => {
          setCustom(t)
          setPreset(null)
          setPicking(false)
        }}
      />
    </ScrollView>
  )
}

/** Custom timeframe: a from and a to day (both included). */
function CustomRange({ visible, initial, onClose, onPick }: { visible: boolean; initial: Timeframe; onClose: () => void; onPick: (t: Timeframe) => void }) {
  const [from, setFrom] = useState(new Date())
  const [to, setTo] = useState(new Date())
  useEffect(() => {
    if (!visible) return
    setFrom(initial.from ? parseDay(initial.from) : new Date(Date.now() - 6 * 864e5))
    setTo(initial.to ? parseDay(initial.to) : new Date())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])
  const row = (label: string, value: Date, set: (d: Date) => void, min?: Date) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 }}>
      <Txt size={16} weight="600">
        {label}
      </Txt>
      <DateTimePicker value={value} mode="date" display="compact" minimumDate={min} maximumDate={new Date()} themeVariant="dark" onChange={(_, d) => d && set(d)} />
    </View>
  )
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt size={18} weight="800" style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        Custom timeframe
      </Txt>
      {row('From', from, (d) => {
        setFrom(d)
        if (d > to) setTo(d)
      })}
      {row('To', to, setTo, from)}
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Button title="Show stats" onPress={() => onPick({ from: dayString(from), to: dayString(to) })} />
      </View>
    </Sheet>
  )
}
