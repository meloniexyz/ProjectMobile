import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons'
import { THEMES } from '../core/themes'
import { LOGO_IMAGES } from './logoImages'
import { getSettings, settingsStore, useSettings } from './settings'

/**
 * The ProjectM logo follows your accent colour: the M or round M, on the theme surface, dark, or
 * charcoal. App icons are built into the app per theme colour, so a custom accent uses the
 * closest of the 13 (your exact colour inside the app on Windows).
 */
export const LOGO_VARIANTS = [
  { id: 'mark-onsurface', name: 'M · surface' },
  { id: 'mark-darkm', name: 'M · dark' },
  { id: 'mark-charcoal', name: 'M · charcoal' },
  { id: 'avatar-onsurface', name: 'Round · surface' },
  { id: 'avatar-darkm', name: 'Round · dark' },
  { id: 'avatar-charcoal', name: 'Round · charcoal' },
] as const

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The theme whose logo colour is closest to the accent (the theme itself when it uses its own). */
export function logoColor(theme: string, accent: string | null) {
  if (!accent) return theme
  const [r, g, b] = rgb(accent)
  let best = theme
  let dist = Infinity
  for (const t of THEMES) {
    const [tr, tg, tb] = rgb(t.accent)
    // weighted for the eye; the current theme wins ties so its surface colour matches
    const d = 2 * (r - tr) ** 2 + 4 * (g - tg) ** 2 + 3 * (b - tb) ** 2 - (t.id === theme ? 1 : 0)
    if (d < dist) {
      dist = d
      best = t.id
    }
  }
  return best
}

export const logoImage = (color: string, variant: string) => LOGO_IMAGES[`${color}-${variant}`] ?? LOGO_IMAGES[`amoled-${variant}`]

export function useLogo() {
  const s = useSettings()
  return logoImage(logoColor(s.theme, s.accent), s.logo)
}

const iconName = (color: string, variant: string) =>
  `${color}_${variant.replace('-', '_')}`
    .split('_')
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('')

/** assets/icon.png: the red M on its surface (AMOLED with the red accent, the default look) */
const BUILT_IN_ICON = 'CrimsonMarkOnsurface'

/** Keeps the home screen icon in step with the logo (iOS shows a short notice when it changes). */
export function startAppIconSync() {
  if (!supportsAlternateIcons) return
  let pending: ReturnType<typeof setTimeout> | null = null
  const apply = () => {
    const s = getSettings()
    const name = iconName(logoColor(s.theme, s.accent), s.logo)
    // the built-in icon is this one already, so it needs no switch (and no iOS notice)
    const wanted = name === BUILT_IN_ICON ? null : name
    if ((getAppIconName() ?? null) === wanted) return
    setAlternateAppIcon(wanted as never).catch((e) => console.warn('[icon]', e))
  }
  // wait until picking a colour has settled, so iOS asks once
  const later = () => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(apply, 1500)
  }
  later()
  let last = ''
  settingsStore.subscribe(() => {
    const s = getSettings()
    const key = `${s.theme}|${s.accent}|${s.logo}`
    if (key !== last) {
      last = key
      later()
    }
  })
}
