import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { router } from 'expo-router'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { next, toggle, usePlayer } from '../lib/player'
import { useColors } from '../lib/theme'
import { openSaveSheet } from '../lib/ui'
import { Artwork, IconButton, SourceRoute, Txt } from './ui'

/**
 * The playing bar, like Spotify's: what's playing (and from where), play/pause and save.
 * Tap to open the full player.
 *  - 'bar': solid bar (classic look)
 *  - 'glass': floating Liquid Glass bar (native look, outside the tab bar)
 *  - 'accessory': inside iOS's tab bar accessory slot (the system draws the glass);
 *    `inline` is the compact version shown when the tab bar shrinks while scrolling
 */
export function MiniPlayer({ variant = 'bar', inline = false }: { variant?: 'bar' | 'glass' | 'accessory'; inline?: boolean }) {
  const c = useColors()
  const track = usePlayer((s) => s.queue[s.index]?.track)
  const playing = usePlayer((s) => s.playing)
  const loading = usePlayer((s) => s.loading)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const via = usePlayer((s) => s.via)
  if (!track) return null
  const progress = duration ? Math.min(1, position / duration) : 0

  const playButton = loading ? (
    <ActivityIndicator color={c.text} style={{ width: inline ? 30 : 38 }} />
  ) : (
    <IconButton name={playing ? 'pause' : 'play'} size={inline ? 22 : 28} label={playing ? 'Pause' : 'Play'} onPress={toggle} />
  )

  const content = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open player"
      testID="mini-player"
      onPress={() => router.push('/player')}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: inline ? 10 : 8, paddingVertical: inline ? 4 : 8, gap: 10 }}
    >
      <Artwork src={track.artwork} size={inline ? 28 : 40} radius={inline ? 14 : 6} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={inline ? 13 : 14} weight="700" lines={1}>
          {track.title}
        </Txt>
        {!inline ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SourceRoute source={track.source} via={via} size={11} />
            <Txt tone="text2" size={12} lines={1} style={{ flexShrink: 1 }}>
              {track.artist}
            </Txt>
          </View>
        ) : null}
      </View>
      {!inline ? <IconButton name="add-circle-outline" size={26} label="Save" onPress={() => openSaveSheet(track)} /> : null}
      {playButton}
      {inline ? <IconButton name="play-forward" size={20} label="Next" onPress={next} /> : null}
    </Pressable>
  )

  const progressLine =
    variant === 'accessory' ? null : (
      <View style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 10, marginBottom: 1, borderRadius: 1 }}>
        <View style={{ height: 2, width: `${progress * 100}%`, backgroundColor: c.text, borderRadius: 1 }} />
      </View>
    )

  if (variant === 'accessory') return content

  if (variant === 'glass' && isLiquidGlassAvailable()) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive colorScheme="dark" style={{ marginHorizontal: 10, marginBottom: 6, borderRadius: 22, overflow: 'hidden' }}>
        {content}
        {progressLine}
      </GlassView>
    )
  }

  return (
    <View style={{ marginHorizontal: 8, marginBottom: 6, borderRadius: variant === 'glass' ? 22 : 8, backgroundColor: c.elev, overflow: 'hidden' }}>
      {content}
      {progressLine}
    </View>
  )
}
