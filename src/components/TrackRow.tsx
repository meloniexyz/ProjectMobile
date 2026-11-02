import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, FlatList, Pressable, View, type ListRenderItem } from 'react-native'
import type { Track } from '../core/types'
import { fmtTime } from '../core/format'
import { splitMovement, type WorkGroup } from '../core/works'
import { addToPlaylist, createPlaylist, libStore } from '../lib/library'
import { toast } from '../lib/ui'
import { Sheet } from './Overlays'
import { useStore } from '../core/store'
import { cacheStore, isDownloaded } from '../lib/audioCache'
import { addToQueue, availableNow, playNext, playTracks, usePlayer } from '../lib/player'
import { SwipeToQueue } from './Swipe'
import { useConnection } from '../lib/net'
import { useColors, ui } from '../lib/theme'
import { openTrackSheet } from '../lib/ui'
import { useSettings } from '../lib/settings'
import { Artwork, Icon, IconButton, SourceIcon, Txt, type IconName } from './ui'

/** Three little bars for the playing song (animated on the GPU: transform only). */
export function Bars({ playing }: { playing: boolean }) {
  const c = useColors()
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0.4))).current
  useEffect(() => {
    if (!playing) {
      vals.forEach((v) => v.stopAnimation())
      return
    }
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 380 + i * 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 380 + i * 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [playing, vals])
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14, width: 14 }}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 3, height: 14, backgroundColor: c.accent, borderRadius: 1, transform: [{ translateY: 7 }, { scaleY: v }, { translateY: -7 }] }} />
      ))}
    </View>
  )
}

export function TrackRow({
  track,
  onPress,
  playlistId,
  index,
  showSource = true,
  title,
  indent,
}: {
  track: Track
  onPress: () => void
  playlistId?: string
  index?: number
  showSource?: boolean
  /** shown instead of the song's title (a movement inside a work group) */
  title?: string
  /** a movement of the work above */
  indent?: boolean
}) {
  const c = useColors()
  const currentUid = usePlayer((s) => s.queue[s.index]?.track.uid)
  const playing = usePlayer((s) => s.playing)
  useStore(cacheStore, (s) => s.version)
  useConnection()
  useSettings()
  const active = currentUid === track.uid
  const downloaded = track.source !== 'local' && isDownloaded(track.uid)
  const available = availableNow(track)
  return (
    // swipe right: add to queue (like Spotify)
    <SwipeToQueue color={c.accent} onQueue={() => addToQueue([track])}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${track.title} by ${track.artist}`}
      testID={`track-${index ?? 0}`}
      onPress={onPress}
      onLongPress={() => openTrackSheet(track, { playlistId })}
      // no flash on rows you just scroll past
      unstable_pressDelay={70}
      delayLongPress={380}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingLeft: ui.pad + (indent ? 16 : 0),
        paddingRight: ui.pad,
        paddingVertical: 7,
        // solid, so the queue icon behind only shows while you swipe
        backgroundColor: pressed ? c.hover : c.bg,
        opacity: available ? 1 : 0.38,
      })}
    >
      <Artwork src={track.artwork} size={48} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {active ? <Bars playing={playing} /> : null}
          <Txt size={15} weight="600" lines={1} tone={active ? 'accent' : 'text'} style={{ flexShrink: 1 }}>
            {title ?? track.title}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
          {downloaded ? <Icon name="arrow-down-circle" size={13} color={c.accent} /> : null}
          {showSource ? <SourceIcon source={track.source} size={11} /> : null}
          <Txt tone="text2" size={13} lines={1} style={{ flexShrink: 1 }}>
            {track.artist}
            {track.duration ? ` · ${fmtTime(track.duration)}` : ''}
          </Txt>
        </View>
      </View>
      <IconButton name="ellipsis-horizontal" size={20} color={c.text2} label={`More for ${track.title}`} onPress={() => openTrackSheet(track, { playlistId })} />
    </Pressable>
    </SwipeToQueue>
  )
}

/** A list of songs; tapping one plays the list from there. */
export function TrackList({
  tracks,
  groups,
  header,
  footer,
  playlistId,
  onRefresh,
  refreshing,
  empty,
  onEndReached,
}: {
  tracks: Track[]
  header?: React.ReactElement | null
  footer?: React.ReactElement | null
  playlistId?: string
  onRefresh?: () => void
  refreshing?: boolean
  empty?: React.ReactElement | null
  /** long lists loaded a page at a time (Library → Jellyfin → Tracks) */
  onEndReached?: () => void
  /** classical works: a header above each group, its movements indented */
  groups?: WorkGroup[]
}) {
  const rows = useMemo<ListItem[]>(() => {
    if (!groups?.length) return tracks.map((t, i) => ({ kind: 'track', i, key: `${t.uid}:${i}` }))
    const out: ListItem[] = []
    const inGroup = new Map<number, WorkGroup>()
    for (const g of groups) for (let k = 0; k < g.count; k++) inGroup.set(g.start + k, g)
    tracks.forEach((t, i) => {
      const g = inGroup.get(i)
      if (g?.start === i) out.push({ kind: 'work', g, key: `work:${i}` })
      out.push({ kind: 'track', i, key: `${t.uid}:${i}`, movement: g ? (splitMovement(t.title)?.movement ?? t.title) : undefined })
    })
    return out
  }, [tracks, groups])
  const render: ListRenderItem<ListItem> = ({ item }) =>
    item.kind === 'work' ? (
      <WorkHeader group={item.g} tracks={tracks} />
    ) : (
      <TrackRow
        track={tracks[item.i]}
        index={item.i}
        playlistId={playlistId}
        title={item.movement}
        indent={item.movement !== undefined}
        onPress={() => playTracks(tracks, item.i)}
      />
    )
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={render}
      ListHeaderComponent={header}
      ListFooterComponent={footer ?? <View style={{ height: 140 }} />}
      ListEmptyComponent={empty}
      onRefresh={onRefresh}
      refreshing={refreshing ?? false}
      onEndReached={onEndReached}
      onEndReachedThreshold={1.5}
      initialNumToRender={14}
      windowSize={9}
      removeClippedSubviews
    />
  )
}

type ListItem = { kind: 'track'; i: number; key: string; movement?: string } | { kind: 'work'; g: WorkGroup; key: string }

/** A work above its movements: play from it, its total length; hold for the whole work's actions. */
function WorkHeader({ group: g, tracks }: { group: WorkGroup; tracks: Track[] }) {
  const c = useColors()
  const [sheet, setSheet] = useState(false)
  const playlists = useStore(libStore, (s) => s.playlists)
  const members = tracks.slice(g.start, g.start + g.count)
  const total = members.reduce((sum, t) => sum + (t.duration || 0), 0)
  const done = (text: string) => {
    setSheet(false)
    toast(text)
  }
  const action = (label: string, icon: IconName, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 13, backgroundColor: pressed ? c.hover : 'transparent' })}
    >
      <Icon name={icon} size={22} color={c.text2} />
      <Txt size={16} weight="500">
        {label}
      </Txt>
    </Pressable>
  )
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${g.title}, ${g.count} movements`}
        onLongPress={() => setSheet(true)}
        delayLongPress={380}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: ui.pad, paddingTop: 14, paddingBottom: 6, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: pressed ? c.hover : c.bg })}
      >
        <IconButton name="play-circle" size={28} color={c.text} label={`Play ${g.title}`} onPress={() => playTracks(tracks, g.start)} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={15} weight="800" lines={2}>
            {g.title}
          </Txt>
          {g.live ? (
            <Txt tone="accent" size={11} weight="800">
              LIVE
            </Txt>
          ) : null}
        </View>
        <Txt tone="text2" size={13}>
          {fmtTime(total)}
        </Txt>
      </Pressable>
      <Sheet visible={sheet} onClose={() => setSheet(false)}>
        <Txt size={16} weight="800" lines={2} style={{ paddingHorizontal: 20, paddingBottom: 2 }}>
          {g.title}
        </Txt>
        <Txt tone="text2" size={13} style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          {g.count} movements · {fmtTime(total)}
        </Txt>
        {action('Play this work', 'play', () => {
          setSheet(false)
          playTracks(members, 0)
        })}
        {action('Play next', 'play-forward', () => {
          playNext(members)
          done('Playing next')
        })}
        {action('Add to queue', 'list', () => {
          addToQueue(members)
          done('Added to queue')
        })}
        {playlists.map((p) =>
          action(`Add to ${p.name}`, 'add-circle-outline', () => {
            addToPlaylist(p.id, members)
            done(`Added to ${p.name}`)
          }),
        )}
        {action('New playlist with this work', 'add', () => {
          createPlaylist(members, g.title)
          done('Saved to your playlists')
        })}
      </Sheet>
    </>
  )
}
