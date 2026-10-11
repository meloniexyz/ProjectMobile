import { useMemo } from 'react'
import type { TextStyle } from 'react-native'
import { themeById, THEMES, ACCENT_SWATCHES, type Theme } from '../core/themes'
import { useSettings, getSettings } from './settings'

export { THEMES, ACCENT_SWATCHES }

export interface Colors extends Theme {
  accent: string
  /** text on top of the accent colour */
  accentInk: string
  /** accent at low opacity, for highlights */
  accentSoft: string
}

const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const inkFor = (accent: string) => {
  const l = luminance(accent)
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#0c0a18' : '#ffffff'
}
export const alpha = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

export function colorsFor(themeId: string, accentOverride: string | null): Colors {
  const t = themeById(themeId)
  const accent = accentOverride || t.accent
  return { ...t, accent, accentInk: inkFor(accent), accentSoft: alpha(accent, 0.16) }
}

export function useColors(): Colors {
  const s = useSettings()
  return useMemo(() => colorsFor(s.theme, s.accent), [s.theme, s.accent])
}

export const currentColors = () => colorsFor(getSettings().theme, getSettings().accent)

const INTER: Record<string, string> = {
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_800ExtraBold',
}
/** Font for the theme's skin: the Feishin theme uses Inter (one font file per weight on iOS). */
export function fontFor(c: Colors, weight?: TextStyle['fontWeight']): TextStyle {
  if (c.skin !== 'feishin') return { fontWeight: weight }
  return { fontFamily: INTER[String(weight ?? '400')] ?? 'Inter_400Regular' }
}

/** Spacing / type scale used everywhere. */
export const ui = {
  pad: 16,
  radius: 8,
  font: { title: 28, h2: 20, body: 15, small: 13, tiny: 11 },
}
