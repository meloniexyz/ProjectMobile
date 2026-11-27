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

/**
 * FruitGlass theme only: the backdrop behind a page, like the Windows app's (CoverBackdrop.tsx there).
 * A black base, with the picture heavily blurred and dimmed, washing down from the top and melting
 * into the base. The picture is the playing song's cover, or on a profile page that profile's banner
 * (`picture`), or its banner colour when it has no banner (`color`).
 * Each page draws its own copy (an opaque one), so the page underneath never shows through while you
 * swipe back.
 */
export function FruitBackdrop({ picture, color }: { picture?: string | null; color?: string }) {
  const c = useColors()
  const cover = usePlayer((s) => s.queue[s.index]?.track.artwork)
  if (c.skin !== 'fruitglass') return null
  // a profile page shows its banner; every other page the song that's playing
  const uri = picture !== undefined || color ? picture : artworkUri(cover)
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
      {uri ? (
        <Image
          source={{ uri }}
          // a little bigger than the area, so the blur's soft edges fall outside it
          style={{ position: 'absolute', top: -60, left: -60, right: -60, height: '78%', opacity: 0.55 }}
          contentFit="cover"
          blurRadius={60}
          cachePolicy="disk"
          transition={380}
        />
      ) : color ? (
        <LinearGradient colors={[alpha(color, 0.5), alpha(color, 0.18), 'transparent']} locations={[0, 0.4, 0.75]} style={StyleSheet.absoluteFill} />
      ) : null}
      {/* dim it so text reads easily, then fade it into the black base */}
      <LinearGradient
        colors={['rgba(0,0,0,0.30)', 'rgba(0,0,0,0.50)', 'rgba(0,0,0,0.88)', '#000']}
        locations={[0, 0.35, 0.68, 0.85]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

/** A profile page's backdrop: its banner, else its banner colour (like its card). FruitGlass only. */
export function ProfileBackdrop({ profile: p }: { profile: Pick<ShownProfile, 'banner' | 'colors' | 'handle' | 'displayName'> }) {
  return <FruitBackdrop picture={p.banner} color={p.banner ? undefined : (p.colors?.[0] ?? defaultProfileColor(p.handle || p.displayName))} />
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
