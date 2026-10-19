import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlayer } from '../lib/player'
import { useSettings } from '../lib/settings'
import { MiniPlayer } from './MiniPlayer'

/** Screens that have their own playing bar (tabs) or are the player itself. */
const OWN_BAR = new Set(['(tabs)', 'player', 'queue', 'spotify-login'])

/**
 * Wraps every page (playlists, settings, profiles...) with its own playing bar at the bottom, like
 * Spotify. Being part of the page, the bar slides away with it when you swipe back, instead of
 * staying on top of Home's own bar.
 */
export function PageWithPlayingBar({ route, children }: { route: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      {children}
      {OWN_BAR.has(route.split('/')[0]!) ? null : <PageBar />}
    </View>
  )
}

function PageBar() {
  const insets = useSafeAreaInsets()
  const { uiStyle } = useSettings()
  const hasTrack = usePlayer((s) => s.index >= 0 && !!s.queue[s.index])
  if (!hasTrack) return null
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 8) }}>
      <MiniPlayer variant={uiStyle === 'glass' ? 'glass' : 'bar'} />
    </View>
  )
}
