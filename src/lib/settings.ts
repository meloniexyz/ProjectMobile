import type { EqSettings } from '../core/types'
import { createStore, useStore } from '../core/store'
import { JsonFile } from './storage'

/** Spotify-style quality steps. What each means per source is in quality.ts. */
export type Quality = 'low' | 'mid' | 'best'

export interface MobileSettings {
  /** streaming quality on Wi-Fi */
  wifiQuality: Quality
  /** streaming quality on mobile data */
  cellularQuality: Quality
  /** quality of songs saved for offline listening */
  downloadQuality: Quality
  /** let offline downloads run on mobile data (off = Wi-Fi only, like Spotify) */
  downloadOnCellular: boolean
  /** only play what's downloaded; no network use at all for music */
  offlineMode: boolean
  /** room for recently played songs (MB); played songs are kept so replays use no data */
  cacheLimitMb: number
  /** loudness all songs are leveled to, like Spotify's Quiet / Normal / Loud */
  loudnessLevel: 'quiet' | 'normal' | 'loud'
  normalize: boolean
  eq: EqSettings
  theme: string
  accent: string | null
  /** Home → New releases skips songs and videos longer than this (minutes; 0 = no limit) */
  newReleasesMaxMinutes: number
  /** logo style (app icon and in-app logo), in the accent colour: see lib/logo.ts */
  logo: string
  showLyrics: boolean
  /** hide local audio under 30 s (samples, voice memos) */
  hideShortClips: boolean
  /** 'glass' = native iOS look: Liquid Glass tab bar, glass playing bar and sheets */
  uiStyle: 'classic' | 'glass'
  /** where Spotify songs play from: the better copy for your quality setting, or a preferred service first */
  spotifySource: 'auto' | 'youtube' | 'soundcloud'
}

export const DEFAULT_MOBILE_SETTINGS: MobileSettings = {
  wifiQuality: 'best',
  cellularQuality: 'mid',
  downloadQuality: 'best',
  downloadOnCellular: false,
  offlineMode: false,
  cacheLimitMb: 1024,
  loudnessLevel: 'normal',
  normalize: true,
  eq: { enabled: false, bands: 7, gains: [0, 0, 0, 0, 0, 0, 0], preset: 'Flat', custom: [] },
  theme: 'amoled',
  accent: '#ff4d5e',
  newReleasesMaxMinutes: 8,
  logo: 'mark-onsurface',
  showLyrics: true,
  hideShortClips: true,
  uiStyle: 'classic',
  spotifySource: 'auto',
}

export const LOUDNESS_LUFS: Record<MobileSettings['loudnessLevel'], number> = { quiet: -23, normal: -14, loud: -11 }

const file = new JsonFile<Partial<MobileSettings>>('settings.json', {})
export const settingsStore = createStore<{ settings: MobileSettings }>({ settings: DEFAULT_MOBILE_SETTINGS })

export function initSettings() {
  settingsStore.set({ settings: { ...DEFAULT_MOBILE_SETTINGS, ...file.load() } })
}

export const getSettings = () => settingsStore.get().settings
export const useSettings = () => useStore(settingsStore, (s) => s.settings)

export function updateSettings(patch: Partial<MobileSettings>) {
  const settings = { ...getSettings(), ...patch }
  settingsStore.set({ settings })
  file.set(settings)
}
