import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { defaultProfileColor } from '../core/profile-colors'
import { artworkUri } from '../lib/jellyfin'
import type { ShownProfile } from '../lib/sync'
import { usePlayer } from '../lib/player'
import { alpha, useColors } from '../lib/theme'

type Point = { x: number; y: number }
/**
 * Which way the cover's colour spreads on each kind of page, the same choices as the Windows app
 * (SPREAD in CoverBackdrop.tsx there): where the glow comes from (`from` → `to`), and which part of
 * the cover shows (`part`).
 *  0 home: a wash across the top          1 search, settings: from the top left
 *  2 library, messages, servers: top right  3 playlists, albums: top left, the cover's middle
 *  4 history, stats, local files: a band through the middle
 *  5 artists, profiles: from the right edge  6 a profile's banner: a wash across the top
 */
const SPREADS: { from: Point; to: Point; part: 'center' | 'left' | 'right' | 'top' | 'bottom'; band?: boolean }[] = [
  { from: { x: 0.5, y: 0 }, to: { x: 0.5, y: 1 }, part: 'center' },
  { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, part: 'left' },
  { from: { x: 1, y: 0 }, to: { x: 0, y: 1 }, part: 'right' },
  { from: { x: 0.15, y: 0.1 }, to: { x: 0.9, y: 1 }, part: 'center' },
  { from: { x: 0.5, y: 0 }, to: { x: 0.5, y: 1 }, part: 'bottom', band: true },
  { from: { x: 1, y: 0.3 }, to: { x: 0, y: 0.75 }, part: 'top' },
  { from: { x: 0.5, y: 0 }, to: { x: 0.5, y: 1 }, part: 'center' },
]

/** The spread for a page, by its route (the first part of the address). */
export function spreadFor(route: string): number {
  const r = route.split('/')[0]!
  if (r === 'index' || r === '(tabs)') return 0
  if (r === 'search' || r === 'settings' || r === 'mode') return 1
  if (r === 'library' || r === 'messages' || r === 'chat' || r === 'jellyfin') return 2
  if (r === 'playlist' || r === 'remote' || r === 'liked') return 3
  if (r === 'history' || r === 'leaderboard' || r === 'stats' || r === 'local' || r === 'downloads') return 4
  if (r === 'entity' || r === 'person') return 5
  return 0
}

/**
 * FruitGlass theme only: the backdrop behind a page, like the Windows app's (CoverBackdrop.tsx there).
 * The picture, heavily blurred and dimmed, fills the whole page (a faint tint of its colour everywhere,
 * like the Windows app's base colour) and glows brighter from one side, which depends on the page
 * (`spread`). It never fades to plain black, and has no edge anywhere.
 * The picture is the playing song's cover, or on a profile page that profile's banner (`picture`), or
 * its banner colour when it has no banner (`color`).
 * Each page draws its own copy (an opaque one), so the page underneath never shows through while you
 * swipe back.
 */
export function FruitBackdrop({ picture, color, spread = 0 }: { picture?: string | null; color?: string; spread?: number }) {
  const c = useColors()
  const cover = usePlayer((s) => s.queue[s.index]?.track.artwork)
  if (c.skin !== 'fruitglass') return null
  // a profile page shows its banner; every other page the song that's playing
  const uri = picture !== undefined || color ? picture : artworkUri(cover)
  const s = SPREADS[spread] ?? SPREADS[0]!
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
      {uri ? (
        <Image
          source={{ uri }}
          // bigger than the page on every side: the blur softens the picture but not its outline,
          // so the outline has to fall outside the screen
          style={{ position: 'absolute', top: -90, left: -90, right: -90, bottom: -90, opacity: 0.62 }}
          contentFit="cover"
          contentPosition={s.part}
          blurRadius={70}
          cachePolicy="disk"
          transition={380}
        />
      ) : color ? (
        <LinearGradient colors={[alpha(color, 0.5), alpha(color, 0.26)]} start={s.from} end={s.to} style={StyleSheet.absoluteFill} />
      ) : null}
      {/* shade it: lightest where the glow comes from, darker away from it, never solid black (the
          colour stays faintly everywhere, like the Windows app's base) so text reads easily */}
      <LinearGradient
        colors={s.band ? ['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.24)', 'rgba(0,0,0,0.74)'] : ['rgba(0,0,0,0.20)', 'rgba(0,0,0,0.48)', 'rgba(0,0,0,0.74)']}
        locations={s.band ? [0, 0.42, 1] : [0, 0.5, 1]}
        start={s.from}
        end={s.to}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

/**
 * The backdrop for a tab (Home, Search, Your Library). The tabs draw their own: in the Liquid Glass
 * look they are iOS's own tabs, which paint over anything behind them.
 */
export function TabBackdrop({ route }: { route: string }) {
  return <FruitBackdrop spread={spreadFor(route)} />
}

/** A profile page's backdrop: its banner, else its banner colour (like its card). FruitGlass only. */
export function ProfileBackdrop({ profile: p }: { profile: Pick<ShownProfile, 'banner' | 'colors' | 'handle' | 'displayName'> }) {
  return <FruitBackdrop spread={6} picture={p.banner} color={p.banner ? undefined : (p.colors?.[0] ?? defaultProfileColor(p.handle || p.displayName))} />
}

/**
 * A see-through panel for the FruitGlass theme: frosted (blurs what's behind it) with a faint white
 * tint, like the Windows app's glass panels. Any other theme gets a plain panel in `solid`.
 */
export function Frosted({ solid, tint = 0.06, intensity = 50, style, children }: { solid: string; tint?: number; intensity?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const c = useColors()
  if (c.skin !== 'fruitglass') return <View style={[{ backgroundColor: solid }, style]}>{children}</View>
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${tint})` }]} />
      {children}
    </View>
  )
}
