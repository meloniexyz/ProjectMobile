import { Pressable, View } from 'react-native'
import { formatListeningSeconds, plural, type TimeUnit } from '../core/format'
import type { Tally } from '../lib/history'
import { playTracks } from '../lib/player'
import { useColors, ui } from '../lib/theme'
import { openTrackSheet } from '../lib/ui'
import { openEntity } from './EntityList'
import { Artwork, Txt } from './ui'

export type StatsList = 'tracks' | 'artists' | 'albums'
export type Metric = 'time' | 'plays'

/** What each list ranks by until changed (same as Windows): tracks by plays, artists and albums by playtime. */
export const DEFAULT_METRIC: Record<StatsList, Metric> = { tracks: 'plays', artists: 'time', albums: 'time' }

export function ranked(items: Tally[], metric: Metric) {
  return [...items].sort((a, b) => (metric === 'time' ? b.seconds - a.seconds : b.plays - a.plays || b.seconds - a.seconds))
}

/** One ranked row: tap plays a track or opens the artist / album, long-press opens the song sheet. */
export function StatRow({ t, i, list, metric, unit }: { t: Tally; i: number; list: StatsList; metric: Metric; unit: TimeUnit }) {
  const c = useColors()
  const open = t.track ? () => playTracks([t.track!]) : t.entity ? () => openEntity(t.entity!) : undefined
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.label}
      onPress={open}
      onLongPress={t.track ? () => openTrackSheet(t.track!) : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: ui.pad, paddingVertical: 5, backgroundColor: pressed && open ? c.hover : 'transparent' })}
    >
      <Txt tone="text3" size={13} style={{ minWidth: 18, textAlign: 'right' }}>
        {i + 1}
      </Txt>
      <Artwork src={t.artwork} size={40} radius={list === 'artists' ? 20 : 4} />
      <View style={{ flex: 1 }}>
        <Txt weight="600" lines={1}>
          {t.label}
        </Txt>
        {t.sub ? (
          <Txt tone="text2" size={12} lines={1}>
            {t.sub}
          </Txt>
        ) : null}
      </View>
      <Txt tone="text2" size={12}>
        {metric === 'time' ? formatListeningSeconds(t.seconds, unit) : plural(t.plays, 'play')}
      </Txt>
    </Pressable>
  )
}
