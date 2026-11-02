import { refreshStatuses } from './accounts'
import { updateSettings } from './settings'

/** Streaming or Full, as on Windows (Settings → Mode there too). */
export type AppMode = 'streaming' | 'full'

export const MODES: { id: AppMode; title: string; text: string }[] = [
  {
    id: 'streaming',
    title: 'Streaming',
    text: 'YouTube Music, SoundCloud, Spotify and the music files on this phone, with your Negusify account. No server needed.',
  },
  {
    id: 'full',
    title: 'Full',
    text: 'Everything in Streaming, plus your Jellyfin music server: its library, favourites and playlists, played in full quality. Adds Servers to Settings.',
  },
]

export function setMode(mode: AppMode) {
  updateSettings({ mode })
  // Jellyfin shows up (or goes away) in Home, Library and Search
  refreshStatuses()
}
