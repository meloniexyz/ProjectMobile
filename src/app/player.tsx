import { GlassContainer, GlassView } from 'expo-glass-effect'
import { Image } from 'expo-image'
import { goTo, SheetHost } from '../components/Overlays'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fmtTime } from '../core/format'
import { LyricsCard, SongInfoCard } from '../components/Lyrics'
import { Swipeable } from '../components/Swipe'
import { Slider } from '../components/Slider'
import { Artwork, Icon, IconButton, SourceRoute, Txt } from '../components/ui'
import { cycleRepeat, next, prev, seek, toggle, toggleShuffle, usePlayer } from '../lib/player'
import { useSettings } from '../lib/settings'
import { useGoBack } from '../lib/nav'
import { useGlass } from '../lib/glass'
import { artworkUri } from '../lib/jellyfin'
import { useColors, ui } from '../lib/theme'
import { openSaveSheet, openTrackSheet } from '../lib/ui'

export default function PlayerScreen() {
  const closePlayer = useGoBack()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const settings = useSettings()
  const glass = useGlass()
  const track = usePlayer((s) => s.queue[s.index]?.track)
  const playing = usePlayer((s) => s.playing)
  const loading = usePlayer((s) => s.loading)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const quality = usePlayer((s) => s.quality)
  const via = usePlayer((s) => s.via)
  const error = usePlayer((s) => s.error)
  const [preview, setPreview] = useState<number | null>(null)
  // height of the scroll area: the player fills it, lyrics and song info come below
  const [viewport, setViewport] = useState(0)

  if (!track) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }}>
        <Txt tone="text2">Nothing playing</Txt>
        <IconButton name="chevron-down" label="Close player" onPress={closePlayer} />
      </View>
    )
  }

  const art = Math.min(width - ui.pad * 2, 420)
  const shown = preview ?? position
  const backdrop = glass ? artworkUri(track.artwork) : null
  const chip = { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, flexDirection: 'row', gap: 4, alignItems: 'center' } as const
  const playToggle = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      testID="player-toggle"
      onPress={toggle}
      style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, backgroundColor: glass ? 'transparent' : c.text, alignItems: 'center', justifyContent: 'center', opacity: pressed && !glass ? 0.8 : 1 })}
    >
      {loading ? (
        <ActivityIndicator color={glass ? c.text : c.bg} />
      ) : (
        <Icon name={playing ? 'pause' : 'play'} size={32} color={glass ? c.text : c.bg} style={playing ? undefined : { marginLeft: 3 }} />
      )}
    </Pressable>
  )
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Liquid Glass: the cover, blurred, fills the screen so the glass controls have something to bend */}
      {backdrop ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Image source={{ uri: backdrop }} style={{ flex: 1 }} contentFit="cover" blurRadius={70} cachePolicy="disk" transition={300} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.42)' }} />
        </View>
      ) : null}
      {/* top bar stays put while the lyrics scroll */}
      <Swipeable onDown={closePlayer} follow="none" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: glass ? 14 : 8, paddingTop: insets.top + 4, paddingBottom: 6, backgroundColor: glass ? 'transparent' : c.bg }}>
        <IconButton name="chevron-down" size={glass ? 24 : 28} label="Close player" onPress={closePlayer} glass />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt tone="text2" size={11} weight="700">
            PLAYING FROM
          </Txt>
          <View style={{ marginTop: 3 }}>
            <SourceRoute source={track.source} via={via} size={14} names />
          </View>
        </View>
        <IconButton name="ellipsis-horizontal" label="More" onPress={() => openTrackSheet(track)} glass />
      </Swipeable>
      <ScrollView onLayout={(e) => setViewport(e.nativeEvent.layout.height)} contentContainerStyle={{ paddingBottom: insets.bottom + 40, gap: 18 }}>
        {/* cover at the top, song and controls at the bottom of the screen */}
        <View style={{ minHeight: viewport, justifyContent: 'space-between', paddingTop: 8, paddingBottom: insets.bottom + 12, gap: 18 }}>
        {/* tap the cover: its album; swipe it: left / right = next / previous, down = close */}
        <Swipeable onLeft={next} onRight={prev} onDown={closePlayer} style={{ alignItems: 'center' }}>
          <Pressable accessibilityRole="link" accessibilityLabel="Go to album" disabled={!track.album} onPress={() => void goTo(track, 'album')}>
            <Artwork src={track.artwork} size={art} radius={8} />
          </Pressable>
        </Swipeable>

        <View style={{ gap: 18 }}>

        <View style={{ paddingHorizontal: ui.pad, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Pressable accessibilityRole="link" accessibilityLabel={`${track.title}, go to album`} onPress={() => {
              closePlayer()
              void goTo(track, track.album ? 'album' : 'artist')
            }}>
              <Txt size={22} weight="800" lines={1}>
                {track.title}
              </Txt>
            </Pressable>
            <Pressable accessibilityRole="link" accessibilityLabel={`${track.artist}, go to artist`} onPress={() => {
              closePlayer()
              void goTo(track, 'artist')
            }}>
              <Txt tone="text2" size={16} lines={1}>
                {track.artist}
              </Txt>
            </Pressable>
          </View>
          <IconButton name={glass ? 'add' : 'add-circle-outline'} size={glass ? 24 : 30} label="Save to playlist" onPress={() => openSaveSheet(track)} glass />
        </View>

        <View style={{ paddingHorizontal: ui.pad }}>
          <Slider
            label="Seek"
            value={duration ? shown / duration : 0}
            disabled={!duration || loading}
            onChange={(v) => setPreview(v * duration)}
            onCommit={(v) => {
              seek(v * duration)
              setPreview(null)
            }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt tone="text2" size={12}>
              {fmtTime(shown)}
            </Txt>
            <Txt tone="text2" size={12}>
              {fmtTime(duration)}
            </Txt>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: ui.pad + 4 }}>
          <IconButton name="shuffle" size={24} color={shuffle ? c.accent : c.text} label={shuffle ? 'Shuffle on' : 'Shuffle off'} onPress={toggleShuffle} />
          {glass ? (
            // previous / play / next: glass pieces that flow into each other, like iOS 26's own controls
            <GlassContainer spacing={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <IconButton name="play-skip-back" size={26} label="Previous" onPress={prev} glass />
              <GlassView isInteractive glassEffectStyle="regular" colorScheme="dark" tintColor={/^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent + '55' : undefined} style={{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' }}>
                {playToggle}
              </GlassView>
              <IconButton name="play-skip-forward" size={26} label="Next" onPress={next} glass />
            </GlassContainer>
          ) : (
            <>
              <IconButton name="play-skip-back" size={34} label="Previous" onPress={prev} />
              {playToggle}
              <IconButton name="play-skip-forward" size={34} label="Next" onPress={next} />
            </>
          )}
          <View>
            <IconButton name="repeat" size={24} color={repeat !== 'off' ? c.accent : c.text} label={`Repeat ${repeat}`} onPress={cycleRepeat} />
            {repeat === 'one' ? (
              <Txt size={9} weight="900" tone="accent" style={{ position: 'absolute', right: 2, top: 2 }}>
                1
              </Txt>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: ui.pad, flexWrap: 'wrap' }}>
          {quality ? (
            glass ? (
              <GlassView glassEffectStyle="regular" colorScheme="dark" style={chip}>
                <Txt size={12} weight="600" testID="quality-chip">
                  {quality}
                </Txt>
              </GlassView>
            ) : (
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.bg3 }}>
                <Txt tone="text2" size={12} weight="600" testID="quality-chip">
                  {quality}
                </Txt>
              </View>
            )
          ) : null}
          {glass ? (
            <GlassView isInteractive glassEffectStyle="regular" colorScheme="dark" style={{ borderRadius: 999 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Open queue" onPress={() => router.push('/queue')} style={chip}>
                <Icon name="list" size={14} color={c.text} />
                <Txt size={12} weight="600">
                  Queue
                </Txt>
              </Pressable>
            </GlassView>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Open queue" onPress={() => router.push('/queue')} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.bg3, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <Icon name="list" size={14} color={c.text2} />
              <Txt tone="text2" size={12} weight="600">
                Queue
              </Txt>
            </Pressable>
          )}
        </View>
        {error ? (
          <Txt tone="text2" size={13} style={{ textAlign: 'center', paddingHorizontal: ui.pad }}>
            {error}
          </Txt>
        ) : null}

        </View>
        </View>

        {settings.showLyrics ? <LyricsCard track={track} /> : null}
        <SongInfoCard track={track} />
      </ScrollView>
      <SheetHost />
    </View>
  )
}
