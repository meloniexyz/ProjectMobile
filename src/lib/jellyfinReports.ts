import { fullMode, jf } from './jellyfin'
import { getPlayer, subscribePlayer } from './player'

/**
 * Full mode: tells the Jellyfin server when one of its songs starts, plays (every 10 s, and on pause
 * or seek) and stops, like Negusify on Windows. Jellyfin keeps its own history from these, and so do
 * the HQPlayer plugin's listening history and stats.
 */
const TICKS = 10_000_000
let current: { uid: string; serverId: string; itemId: string; session: string } | null = null
let lastProgress = 0
let lastPaused = false
let lastPos = 0

function send(path: string, extra: Record<string, unknown>) {
  const o = current
  if (!o) return
  const body = { ItemId: o.itemId, MediaSourceId: o.itemId, PlaySessionId: o.session, PlayMethod: 'DirectPlay', CanSeek: true, ...extra }
  jf(path, { method: 'POST', body, serverId: o.serverId }).catch(() => {})
}

const newSession = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

export function startJellyfinReports() {
  subscribePlayer(() => {
    const p = getPlayer()
    const item = p.queue[p.index]
    const t = item && p.activeKey === item.key ? item.track : null
    const uid = t?.source === 'jellyfin' && fullMode() ? t.uid : null
    if (current && current.uid !== uid) {
      send('/Sessions/Playing/Stopped', { PositionTicks: Math.round(lastPos * TICKS) })
      current = null
    }
    if (!uid || !t) return
    if (!current && p.playing) {
      const i = t.id.indexOf('~')
      current = { uid, serverId: t.id.slice(0, i), itemId: t.id.slice(i + 1), session: newSession() }
      lastProgress = Date.now()
      lastPaused = false
      lastPos = p.position
      send('/Sessions/Playing', { PositionTicks: Math.round(p.position * TICKS), IsPaused: false })
      return
    }
    if (!current) return
    const seeked = Math.abs(p.position - lastPos) > 5
    lastPos = p.position
    if (p.playing === lastPaused || seeked || Date.now() - lastProgress > 10_000) {
      lastPaused = !p.playing
      lastProgress = Date.now()
      send('/Sessions/Playing/Progress', { PositionTicks: Math.round(p.position * TICKS), IsPaused: !p.playing, EventName: seeked ? 'TimeUpdate' : p.playing ? 'Unpause' : 'Pause' })
    }
  })
}
