import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { currentLine, lineWords } from '../core/lyricsWords'
import { useChosenLyrics } from '../components/Lyrics'
import { Icon, IconButton, Txt } from '../components/ui'
import { artworkUri } from '../lib/jellyfin'
import { useGoBack } from '../lib/nav'
import { next, prev, seek, toggle, usePlayer } from '../lib/player'
import type { Track } from '../core/types'

/**
 * The full lyrics screen (like the desktop's, after Liner): the cover blurred into slowly moving
 * colour behind, the words lighting up one by one as they're sung, and the lines gliding up half a
 * second before the next one starts, the lines further down following a little later, like a wave.
 * Tap a line to jump there; swipe down or the arrow to close.
 */
export default function LyricsScreen() {
  const close = useGoBack()
  const insets = useSafeAreaInsets()
  const track = usePlayer((s) => s.queue[s.index]?.track)
  const playing = usePlayer((s) => s.playing)
  if (!track) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <Txt tone="text2">Nothing playing</Txt>
        <IconButton name="chevron-down" label="Close lyrics" onPress={close} />
      </View>
    )
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlowingCover uri={artworkUri(track.artwork) ?? undefined} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 4, paddingHorizontal: 12, gap: 10 }}>
        <IconButton name="chevron-down" label="Close lyrics" onPress={close} />
        <View style={{ flex: 1 }}>
          <Txt size={15} weight="700" lines={1} style={{ color: '#fff' }}>
            {track.title}
          </Txt>
          <Txt size={13} lines={1} style={{ color: 'rgba(255,255,255,0.7)' }}>
            {track.artist}
          </Txt>
        </View>
      </View>
      <Lines key={track.uid} track={track} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 36, paddingBottom: insets.bottom + 14, paddingTop: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous" onPress={prev} hitSlop={12}>
          <Icon name="play-skip-back" size={26} color="#fff" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={toggle} hitSlop={12}>
          <Icon name={playing ? 'pause' : 'play'} size={36} color="#fff" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={next} hitSlop={12}>
          <Icon name="play-skip-forward" size={26} color="#fff" />
        </Pressable>
      </View>
    </View>
  )
}

/**
 * The background: the cover, blurred to colour, as two big copies turning slowly in opposite
 * directions (so the colours drift and swirl into each other), under a 40% shade for the words.
 */
function FlowingCover({ uri }: { uri?: string }) {
  const { width, height } = useWindowDimensions()
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 120000, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [spin])
  const size = Math.max(width, height) * 1.5
  const layer = (dir: number, dx: number, dy: number, opacity: number) => (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        left: (width - size) / 2 + dx,
        top: (height - size) / 2 + dy,
        opacity,
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: dir > 0 ? ['0deg', '360deg'] : ['360deg', '0deg'] }) }, { scale: 1.1 }],
      }}
    >
      <Image source={uri ? { uri } : undefined} style={{ flex: 1 }} contentFit="cover" blurRadius={60} cachePolicy="disk" transition={1000} />
    </Animated.View>
  )
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {layer(1, -width * 0.25, -height * 0.15, 1)}
      {layer(-1, width * 0.3, height * 0.25, 0.75)}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
    </View>
  )
}

const LINE_FONT = 28
const isGap = (t: string) => !t.trim() || /^[♪♫\s]+$/.test(t)

/** How long a line glides to its place (Liner's timing): ¾ s, longer the further from the line moved to. */
function glideMs(fromAnchor: number, forward: boolean) {
  const n = Math.abs(fromAnchor)
  const behind = (fromAnchor < 0 && forward) || (fromAnchor > 0 && !forward)
  return Math.round(behind ? 750 + Math.min(n, 6) * 20 : 750 + Math.log(n + 2) * 80 + (n + 1) * 20)
}

function Lines({ track }: { track: Track }) {
  const { lyrics, offset } = useChosenLyrics(track)
  const position = usePlayer((s) => s.position)
  const synced = lyrics?.synced ?? null
  const at = position + offset
  const current = useMemo(() => (synced ? currentLine(synced, at) : -1), [synced, at])
  // the list moves half a second before the next line starts; that line sits at 37% of the height
  const anchor = useMemo(() => (synced ? currentLine(synced, at + 0.5) : -1), [synced, at])
  const words = useMemo(() => synced?.map((l, i) => lineWords(l, synced[i + 1]?.time)) ?? [], [synced])

  const [boxH, setBoxH] = useState(0)
  const tops = useRef<Record<number, { y: number; h: number }>>({})
  const [laidOut, setLaidOut] = useState(0)
  const moves = useRef<Animated.Value[]>([])
  const lastY = useRef(0)
  if (synced && moves.current.length !== synced.length) moves.current = synced.map(() => new Animated.Value(0))

  useEffect(() => {
    if (!synced || !boxH) return
    const line = tops.current[Math.max(0, anchor)]
    if (!line) return
    const y = boxH * 0.37 - line.y - line.h / 2
    const forward = y < lastY.current
    const first = laidOut === synced.length && lastY.current === 0
    lastY.current = y
    moves.current.forEach((v, i) =>
      first
        ? v.setValue(y)
        : Animated.timing(v, { toValue: y, duration: glideMs(i - Math.max(0, anchor), forward), easing: Easing.bezier(0.86, 0, 0.2, 1), useNativeDriver: true }).start(),
    )
  }, [anchor, boxH, laidOut, synced])

  if (!lyrics || !synced) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
        <Txt size={20} weight="700" style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 30 }}>
          {lyrics?.instrumental ? 'Instrumental' : lyrics?.plain ?? 'No synced lyrics for this song.'}
        </Txt>
      </View>
    )
  }
  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
      {synced.map((line, i) => {
        const state = i === current ? 'now' : 'other'
        const ws = words[i]
        return (
          <Animated.View
            key={i}
            onLayout={(e) => {
              const had = !!tops.current[i]
              tops.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }
              if (!had) setLaidOut((n) => n + 1)
            }}
            style={{ transform: [{ translateY: moves.current[i] ?? 0 }], paddingHorizontal: 24, paddingVertical: 14 }}
          >
            <Pressable onPress={() => seek(Math.max(0, line.time - offset))}>
              {isGap(line.text) ? (
                <Dots line={line.time} end={synced[i + 1]?.time ?? line.time + 4} at={at} now={state === 'now'} />
              ) : (
                <Text style={{ fontSize: LINE_FONT, fontWeight: '700', lineHeight: LINE_FONT * 1.35, color: 'rgba(255,255,255,0.32)' }}>
                  {ws.map((w, k) => (
                    <Text key={k} style={state === 'now' && w.time <= at ? { color: '#fff', textShadowColor: 'rgba(255,255,255,0.45)', textShadowRadius: 10 } : undefined}>
                      {k ? ' ' : ''}
                      {w.text}
                    </Text>
                  ))}
                </Text>
              )}
            </Pressable>
          </Animated.View>
        )
      })}
      {/* the top and bottom of the list fade into the background */}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.45)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '18%' }} />
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.45)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '22%' }} />
    </View>
  )
}

/** An instrumental gap: three dots lighting up one after another until the next line. */
function Dots({ line, end, at, now }: { line: number; end: number; at: number; now: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, height: LINE_FONT * 1.35, alignItems: 'center' }}>
      {[0, 1, 2].map((k) => {
        const lit = now && at >= line + ((end - line) * k) / 3
        return <View key={k} style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: lit ? '#fff' : 'rgba(255,255,255,0.3)' }} />
      })}
    </View>
  )
}
