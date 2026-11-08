import { initAccounts } from './accounts'
import { repairFlacLengths } from './audioCache'
import { initDownloads } from './downloads'
import { initHistory } from './history'
import { initLibrary } from './library'
import { startNetworkWatch } from './net'
import { startPlayer } from './player'
import { initSettings } from './settings'
import { initMatches, youtube } from './sources'
import { ensureDirs } from './storage'
import { initSync } from './sync'
import { initServers } from './jellyfin'
import { startJellyfinReports } from './jellyfinReports'
import { startAppIconSync } from './logo'

let booted = false

/** Loads saved data and starts the background parts, once, before the first screen renders. */
export function boot() {
  if (booted) return
  booted = true
  ensureDirs()
  initSettings()
  initHistory()
  startNetworkWatch()
  initLibrary()
  initServers()
  initAccounts()
  initDownloads()
  initMatches()
  startPlayer()
  initSync()
  startJellyfinReports()
  startAppIconSync()
  // get YouTube's playback token while the app is in front (it lasts hours)
  setTimeout(() => youtube.warmUp(), 1500)
  // older downloads of server-converted FLAC have no length, so they couldn't be seeked
  setTimeout(() => repairFlacLengths(), 3000)
}
