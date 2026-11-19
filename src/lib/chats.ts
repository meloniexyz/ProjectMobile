import type { SharedSong } from '../core/account'
import { createStore } from '../core/store'
import type { Track } from '../core/types'
import { chats, syncStore } from './sync'

/**
 * Messages between friends: how many are unread (the side panel badge, checked every 30 s while
 * logged in) and a song waiting to be sent (song menu → Send to a friend; the Messages screen sends
 * it to whoever you pick). Same as the desktop app.
 */
export const chatStore = createStore<{ unread: number; pending: SharedSong | null }>({ unread: 0, pending: null })

export function refreshUnread() {
  if (!syncStore.get().loggedIn) return chatStore.set({ unread: 0 })
  chats().then(
    (r) => chatStore.set({ unread: r.unread }),
    () => {}, // server without messages yet, or offline: no badge
  )
}

let started = false
export function startChatPolling() {
  if (started) return
  started = true
  refreshUnread()
  setInterval(refreshUnread, 30_000)
  let was = syncStore.get().loggedIn
  syncStore.subscribe(() => {
    const now = syncStore.get().loggedIn
    if (now !== was) refreshUnread()
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
