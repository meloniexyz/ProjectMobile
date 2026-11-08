import * as Network from 'expo-network'
import { createStore, useStore } from '../core/store'
import type { Track } from '../core/types'
import { getSettings, type AnyQuality } from './settings'

export type Connection = 'wifi' | 'cellular' | 'offline'

export const netStore = createStore<{ connection: Connection }>({ connection: 'wifi' })

function classify(s: Network.NetworkState): Connection {
  if (s.isConnected === false || s.type === Network.NetworkStateType.NONE) return 'offline'
  if (s.type === Network.NetworkStateType.CELLULAR) return 'cellular'
  return 'wifi' // Wi-Fi, Ethernet, VPN over Wi-Fi...: treat as unmetered
}

let started = false
export function startNetworkWatch() {
  if (started) return
  started = true
  Network.getNetworkStateAsync().then(
    (s) => netStore.set({ connection: classify(s) }),
    () => {},
  )
  Network.addNetworkStateListener((s) => netStore.set({ connection: classify(s) }))
}

export const connection = () => netStore.get().connection
export const useConnection = () => useStore(netStore, (s) => s.connection)

/** May music use the network right now (offline mode off and connected)? */
export const canStream = () => !getSettings().offlineMode && connection() !== 'offline'
export const onWifi = () => connection() === 'wifi'

/** The streaming quality that applies on the current connection. */
/** The streaming quality for a song right now (Jellyfin songs have their own setting). */
export function streamQuality(track?: Pick<Track, 'source'>): AnyQuality {
  const s = getSettings()
  if (track?.source === 'jellyfin') return onWifi() ? s.jellyfinWifiQuality : s.jellyfinCellularQuality
  return onWifi() ? s.wifiQuality : s.cellularQuality
}

/** The download quality for a song. */
export const downloadQualityFor = (track: Pick<Track, 'source'>): AnyQuality => (track.source === 'jellyfin' ? getSettings().jellyfinDownloadQuality : getSettings().downloadQuality)
