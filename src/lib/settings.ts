import type { EqSettings } from '../core/types'
import { createStore, useStore } from '../core/store'
import type { TimeUnit } from '../core/format'
import { JsonFile } from './storage'

/** Spotify-style quality steps. What each means per source is in quality.ts. */
export type Quality = 'low' | 'mid' | 'best'

/**
 * Jellyfin songs: the original file, CD-quality lossless (hi-res brought down to 16-bit / 44.1-48 kHz
 * by the server), or an MP3 the server makes on the fly.
 */
export type JellyfinQuality = 'original' | 'cd' | 'mp3-320' | 'mp3-256' | 'mp3-128'
export type AnyQuality = Quality | JellyfinQuality
const JF_RANK: Record<JellyfinQuality, number> = { 'mp3-128': 0, 'mp3-256': 1, 'mp3-320': 2, cd: 3, original: 4 }
const LEGACY_JF: Record<Quality, JellyfinQuality> = { low: 'mp3-128', mid: 'mp3-256', best: 'original' }
const STREAM_RANK: Record<Quality, number> = { low: 0, mid: 1, best: 2 }
const isJf = (q: AnyQuality): q is JellyfinQuality => q in JF_RANK
/** A Jellyfin step from any setting (songs cached before the Jellyfin settings used Low / Mid / Best). */
export const asJellyfin = (q: AnyQuality): JellyfinQuality => (isJf(q) ? q : LEGACY_JF[q])
/** A streaming step from any setting. */
export const asStreaming = (q: AnyQuality): Quality => (isJf(q) ? (JF_RANK[q] >= 2 ? 'best' : JF_RANK[q] === 1 ? 'mid' : 'low') : q)
/** Is a copy at `have` good enough for `want`? */
export function atLeast(have: AnyQuality, want: AnyQuality) {
  if (isJf(have) || isJf(want)) return JF_RANK[asJellyfin(have)] >= JF_RANK[asJellyfin(want)]
  return STREAM_RANK[have] >= STREAM_RANK[want]
}

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
  /** Jellyfin songs: their own steps (lossless files are far bigger than the services' streams) */
  jellyfinWifiQuality: JellyfinQuality
  jellyfinCellularQuality: JellyfinQuality
  jellyfinDownloadQuality: JellyfinQuality
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
  /** 'glass' = native iOS look: Apple's real Liquid Glass on the tab bar, playing bar, sheets, buttons and player */
  uiStyle: 'classic' | 'glass'
  /** set once the app has switched an older install to Liquid Glass (0.1.7), so choosing Classic afterwards sticks */
  glassIntroduced?: boolean
  /** set once every quality setting was raised to the best (0.1.7), so lowering one afterwards sticks */
  bestQualityIntroduced?: boolean
  /** where Spotify songs play from: the better copy for your quality setting, or a preferred service first */
  spotifySource: 'auto' | 'youtube' | 'soundcloud'
  /** Streaming: the streaming services and local files only. Full: plus a Jellyfin server. null until chosen at first start */
  mode: 'streaming' | 'full' | null
  /** History → Stats: the largest unit listening time is shown in */
  statsUnit: TimeUnit
  /** Search: the platforms and kinds of results picked in its dropdowns (empty = the default) */
  searchPlatforms: string[]
  searchTypes: string[]
}

export const DEFAULT_MOBILE_SETTINGS: MobileSettings = {
  wifiQuality: 'best',
  cellularQuality: 'best',
  downloadQuality: 'best',
  downloadOnCellular: false,
  offlineMode: false,
  jellyfinWifiQuality: 'original',
  jellyfinCellularQuality: 'original',
  jellyfinDownloadQuality: 'original',
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
  uiStyle: 'glass',
  spotifySource: 'auto',
  mode: null,
  statsUnit: 'hour',
  searchPlatforms: [],
  searchTypes: [],
}

export const LOUDNESS_LUFS: Record<MobileSettings['loudnessLevel'], number> = { quiet: -23, normal: -14, loud: -11 }

const file = new JsonFile<Partial<MobileSettings>>('settings.json', {})
export const settingsStore = createStore<{ settings: MobileSettings }>({ settings: DEFAULT_MOBILE_SETTINGS })

export function initSettings() {
  const settings: MobileSettings = { ...DEFAULT_MOBILE_SETTINGS, ...file.load() }
  // 0.1.7: Liquid Glass becomes the look on iPhone; switch older installs over once
  if (!settings.glassIntroduced) {
    settings.uiStyle = 'glass'
    settings.glassIntroduced = true
    file.set(settings)
  }
  // 0.1.7: the best each service offers, on Wi-Fi, mobile data and downloads (lossless from Jellyfin)
  if (!settings.bestQualityIntroduced) {
    Object.assign(settings, {
      wifiQuality: 'best',
      cellularQuality: 'best',
      downloadQuality: 'best',
      jellyfinWifiQuality: 'original',
      jellyfinCellularQuality: 'original',
      jellyfinDownloadQuality: 'original',
      bestQualityIntroduced: true,
    })
    file.set(settings)
  }
  settingsStore.set({ settings })
}

export const getSettings = () => settingsStore.get().settings
export const useSettings = () => useStore(settingsStore, (s) => s.settings)

export function updateSettings(patch: Partial<MobileSettings>) {
  const settings = { ...getSettings(), ...patch }
  settingsStore.set({ settings })
  file.set(settings)
}
