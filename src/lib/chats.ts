import * as Haptics from 'expo-haptics'
import type { SharedSong } from '../core/account'
import { createStore } from '../core/store'
import type { Track } from '../core/types'
import { getSettings, updateSettings } from './settings'
import { chats, syncStore } from './sync'
import { isDnd, noteStatuses } from './status'
import { toast } from './ui'

/**
 * Messages between friends, outside the chat screens (same as the desktop app):
 * - checks for new messages every 15 s while the app is open and logged in
 * - a new message in a chat that isn't muted (and isn't the one on screen): a buzz and a banner
 * - the side panel shows how many are unread (muted chats count too; muting only stops the buzz
 *   and the banner)
 * - a song waiting to be sent (song menu → Send to a friend; the Messages screen sends it to
 *   whoever you pick)
 */
export const chatStore = createStore<{ unread: number; pending: SharedSong | null; open: string | null }>({ unread: 0, pending: null, open: null })

export const isMuted = (handle: string) => getSettings().mutedChats?.includes(handle) ?? false
export function toggleMute(handle: string) {
  const muted = getSettings().mutedChats ?? []
  updateSettings({ mutedChats: muted.includes(handle) ? muted.filter((h) => h !== handle) : [...muted, handle] })
}

/** last message id seen per chat; new ones above it buzz (the first check only takes note) */
const seen = new Map<string, number>()
let first = true

export function refreshUnread() {
  if (!syncStore.get().loggedIn) return chatStore.set({ unread: 0 })
  chats().then(
    (r) => {
      const open = chatStore.get().open
      for (const c of r.chats) {
        const h = c.user.handle
        if (!h) continue
        const before = seen.get(h)
        seen.set(h, Math.max(before ?? 0, c.last.id))
        if (first || c.last.mine || (before !== undefined && c.last.id <= before) || !c.unread || isMuted(h) || isDnd() || open === h) continue
        const name = c.user.displayName || `@${h}`
        const what = c.last.text || (c.last.track ? `🎵 ${c.last.track.title}` : '')
        toast(`${name}: ${what}`)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      }
      first = false
      noteStatuses(r.chats.map((c) => ({ handle: c.user.handle, status: c.status })))
      chatStore.set({ unread: r.unread })
    },
    () => {}, // server without messages yet, or offline: no badge
  )
}

let started = false
export function startChatPolling() {
  if (started) return
  started = true
  refreshUnread()
  setInterval(refreshUnread, 15_000)
  let was = syncStore.get().loggedIn
  syncStore.subscribe(() => {
    const now = syncStore.get().loggedIn
    if (now !== was) {
      first = true
      seen.clear()
      refreshUnread()
    }
    was = now
  })
}

/** The song as a message carries it: only what the card needs, and only covers others can load. */
export function songForMessage(t: Track): SharedSong {
  return {
    uid: t.uid,
    source: t.source,
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: t.artwork?.startsWith('http') ? t.artwork : undefined,
    duration: t.duration,
  }
}

export const shareToFriend = (t: Track) => chatStore.set({ pending: songForMessage(t) })
