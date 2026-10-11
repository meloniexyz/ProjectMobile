import { useSegments } from 'expo-router'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlayer } from '../lib/player'
import { useSettings } from '../lib/settings'
import { MiniPlayer } from './MiniPlayer'

/** Screens that have their own playing bar (tabs) or are the player itself. */
const OWN_BAR = new Set(['(tabs)', 'player', 'queue', 'spotify-login'])

/** The playing bar at the bottom of every other screen (playlists, settings, history...), like Spotify. */
export function GlobalPlayingBar() {
  const segments = useSegments()
  const insets = useSafeAreaInsets()
  const { uiStyle } = useSettings()
  const hasTrack = usePlayer((s) => s.index >= 0 && !!s.queue[s.index])
  const first = segments[0] ?? '(tabs)'
  if (!hasTrack || OWN_BAR.has(first)) return null
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 8) }}>
      <MiniPlayer variant={uiStyle === 'glass' ? 'glass' : 'bar'} />
    </View>
  )
}
