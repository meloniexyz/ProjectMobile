import { FontAwesome, Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useGoBack } from '../lib/nav'
import type { ComponentProps, ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { SourceId } from '../core/types'
import { SOURCES } from '../lib/sources'
import { fontFor, useColors, ui } from '../lib/theme'

export type IconName = ComponentProps<typeof Ionicons>['name']

export function Icon({ name, size = 22, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const c = useColors()
  return <Ionicons name={name} size={size} color={color ?? c.text} style={style} />
}

export function Txt({
  children,
  style,
  tone = 'text',
  size = ui.font.body,
  weight,
  lines,
  testID,
}: {
  testID?: string
  children: ReactNode
  style?: StyleProp<TextStyle>
  tone?: 'text' | 'text2' | 'text3' | 'accent'
  size?: number
  weight?: TextStyle['fontWeight']
  lines?: number
}) {
  const c = useColors()
  const color = tone === 'accent' ? c.accent : c[tone]
  return (
    <Text testID={testID} numberOfLines={lines} style={[{ color, fontSize: size, ...fontFor(c, weight) }, style]}>
      {children}
    </Text>
  )
}

/** Cover art with a placeholder; images are kept on disk so they're only downloaded once. */
export function Artwork({ src, size, radius = 4, style }: { src?: string | null; size: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors()
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, backgroundColor: c.bg3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {src ? (
        <Image source={{ uri: src }} style={{ width: size, height: size }} contentFit="cover" cachePolicy="disk" recyclingKey={src} transition={120} />
      ) : (
        <Ionicons name="musical-note" size={size * 0.42} color={c.text3} />
      )}
    </View>
  )
}

export function SourceDot({ source, size = 8 }: { source: SourceId; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: SOURCES[source].color }} />
}

export function IconButton({
  name,
  onPress,
  size = 22,
  color,
  label,
  disabled,
  style,
}: {
  name: IconName
  onPress: () => void
  size?: number
  color?: string
  label: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={label}
      hitSlop={10}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ padding: 6, opacity: disabled ? 0.35 : pressed ? 0.55 : 1 }, style]}
    >
      <Ionicons name={name} size={size} color={color ?? c.text} />
    </Pressable>
  )
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  busy,
  small,
  style,
}: {
  title: string
  onPress: () => void
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: IconName
  disabled?: boolean
  busy?: boolean
  small?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const c = useColors()
  const feishin = c.skin === 'feishin'
  // Feishin: white rounded-rectangle buttons instead of accent pills
  const bg = kind === 'primary' ? (feishin ? '#ffffff' : c.accent) : kind === 'secondary' ? c.bg3 : 'transparent'
  const fg = kind === 'primary' ? (feishin ? '#000000' : c.accentInk) : kind === 'danger' ? '#ff5d6c' : c.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={title}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: bg,
          borderRadius: feishin ? 9 : 999,
          paddingHorizontal: small ? 14 : 20,
          paddingVertical: small ? 7 : 11,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
          borderWidth: kind === 'ghost' ? StyleSheet.hairlineWidth : 0,
          borderColor: c.line2,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: small ? 13 : 15, ...fontFor(c, '700') }}>{title}</Text>
    </Pressable>
  )
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress: () => void; color?: string }) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`chip-${label}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: c.skin === 'feishin' ? 6 : 999,
        backgroundColor: active ? (c.skin === 'feishin' ? c.text : c.accent) : c.bg3,
      }}
    >
      {color ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} /> : null}
      <Text style={{ color: active ? (c.skin === 'feishin' ? '#000000' : c.accentInk) : c.text, fontSize: 13, ...fontFor(c, '600') }}>{label}</Text>
    </Pressable>
  )
}

/** Screen header with a back button (for pushed screens). */
export function Header({ title, right, back = true }: { title?: string; right?: ReactNode; back?: boolean }) {
  const c = useColors()
  const goBack = useGoBack()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg }}>
      {back ? <IconButton name="chevron-back" size={26} label="Back" onPress={goBack} /> : <View style={{ width: 8 }} />}
      <Txt size={17} weight="700" lines={1} style={{ flex: 1, marginLeft: 4 }}>
        {title ?? ''}
      </Txt>
      {right}
    </View>
  )
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: ui.pad, marginTop: 22, marginBottom: 10 }}>
      <Txt size={ui.font.h2} weight="800">
        {title}
      </Txt>
      {right}
    </View>
  )
}

export function Empty({ icon = 'musical-notes-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 10 }}>
      <Icon name={icon} size={40} />
      <Txt size={17} weight="700" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {text ? (
        <Txt tone="text2" size={14} style={{ textAlign: 'center' }}>
          {text}
        </Txt>
      ) : null}
      {action}
    </View>
  )
}

/** A tappable settings-style row. */
export function Row({
  title,
  sub,
  icon,
  left,
  right,
  onPress,
  chevron,
  testID,
}: {
  title: string
  sub?: string
  icon?: IconName
  left?: ReactNode
  right?: ReactNode
  onPress?: () => void
  chevron?: boolean
  testID?: string
}) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      testID={testID ?? title}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: ui.pad,
        paddingVertical: 11,
        backgroundColor: pressed ? c.hover : 'transparent',
      })}
    >
      {left ?? (icon ? <Icon name={icon} size={22} color={c.text2} /> : null)}
      <View style={{ flex: 1 }}>
        <Txt size={15} weight="600" lines={1}>
          {title}
        </Txt>
        {sub ? (
          <Txt tone="text2" size={13} lines={2} style={{ marginTop: 2 }}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-forward" size={18} color={c.text3} /> : null}
    </Pressable>
  )
}

export function Divider() {
  const c = useColors()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line2, marginHorizontal: ui.pad }} />
}

export function Spinner() {
  const c = useColors()
  return <ActivityIndicator color={c.text2} style={{ margin: 24 }} />
}

export function ErrorText({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={{ padding: ui.pad, gap: 10, alignItems: 'flex-start' }}>
      <Txt tone="text2" size={14}>
        {text}
      </Txt>
      {onRetry ? <Button title="Try again" small kind="secondary" onPress={onRetry} /> : null}
    </View>
  )
}

/** The platform's logo in its colour. */
export function SourceIcon({ source, size = 14 }: { source: SourceId; size?: number }) {
  const color = SOURCES[source].color
  if (source === 'spotify') return <FontAwesome name="spotify" size={size} color={color} />
  if (source === 'youtube') return <FontAwesome name="youtube-play" size={size} color={color} />
  if (source === 'soundcloud') return <FontAwesome name="soundcloud" size={size * 1.1} color={color} />
  return <Ionicons name="folder" size={size} color={color} />
}

/** Where a song is from, and where it's actually playing from: e.g. Spotify → YouTube. */
export function SourceRoute({ source, via, size = 14, names = false }: { source: SourceId; via?: SourceId | null; size?: number; names?: boolean }) {
  const c = useColors()
  const label = (s: SourceId) =>
    names ? (
      <Txt size={size - 1} weight="700" tone="text2">
        {SOURCES[s].short}
      </Txt>
    ) : null
  return (
    <View
      accessibilityLabel={via ? `${SOURCES[source].name} song, playing from ${SOURCES[via].name}` : SOURCES[source].name}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
    >
      <SourceIcon source={source} size={size} />
      {label(source)}
      {via && via !== source ? (
        <>
          <Ionicons name="arrow-forward" size={size - 2} color={c.text3} />
          <SourceIcon source={via} size={size} />
          {label(via)}
        </>
      ) : null}
    </View>
  )
}
