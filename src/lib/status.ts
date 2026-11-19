import { ActionSheetIOS, AppState } from 'react-native'
import type { PickedStatus, Status } from '../core/account'
import { createStore, useStore } from '../core/store'
import { checkIn as putCheckIn, syncStore } from './sync'
import { toast } from './ui'

/**
 * Discord-style status (same as the desktop app): online, idle, do not disturb, or invisible.
 * - checks in every minute while the app is open, so friends see you online; once the app has been
 *   closed or in the background for a few minutes you show offline (iPhone apps can't check in from
 *   the background)
 * - the status you pick is saved on your account, so every device shows the same one
 * - do not disturb: no buzz or banner for new messages
 */
export const statusStore = createStore<{ mine: PickedStatus | null; friends: Record<string, Status> }>({ mine: null, friends: {} })

export const STATUS_LABEL: Record<Status | PickedStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  invisible: 'Invisible',
  offline: 'Offline',
}
export const STATUS_COLOR: Record<Status, string> = { online: '#23a55a', idle: '#f0b232', dnd: '#f23f43', offline: '#80848e' }

export const shownMine = (s: PickedStatus | null): Status | null => (s === 'invisible' ? 'offline' : s)
export const isDnd = () => statusStore.get().mine === 'dnd'

export function noteStatuses(list: { handle?: string | null; status?: Status }[]) {
  const next = { ...statusStore.get().friends }
  let changed = false
  for (const x of list) {
    if (!x.handle || !x.status || next[x.handle] === x.status) continue
    next[x.handle] = x.status
    changed = true
  }
  if (changed) statusStore.set({ friends: next })
}

export const useFriendStatus = (handle?: string | null) => useStore(statusStore, (s) => (handle ? s.friends[handle] : undefined))
export const useMyStatus = () => useStore(statusStore, (s) => s.mine)

async function checkIn(status?: PickedStatus) {
  if (!syncStore.get().loggedIn) return statusStore.set({ mine: null })
  try {
    const r = await putCheckIn(status)
    statusStore.set({ mine: r?.status ?? null })
  } catch (e) {
    if (status) toast(`Couldn't change your status: ${(e as Error)?.message ?? e}`)
  }
}

export function setMyStatus(s: PickedStatus) {
  statusStore.set({ mine: s })
  void checkIn(s)
}

const PICKS: PickedStatus[] = ['online', 'idle', 'dnd', 'invisible']
/** The status picker (tap your status in the side panel). */
export function openStatusPicker() {
  const mine = statusStore.get().mine
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: 'Set your status',
      message: 'Do Not Disturb mutes message buzzes; Invisible shows you offline.',
      options: [...PICKS.map((s) => `${s === mine ? '✓ ' : ''}${STATUS_LABEL[s]}`), 'Cancel'],
      cancelButtonIndex: PICKS.length,
    },
    (i) => {
      if (i < PICKS.length) setMyStatus(PICKS[i])
    },
  )
}

let started = false
export function startStatus() {
  if (started) return
  started = true
  void checkIn()
  setInterval(() => {
    if (AppState.currentState === 'active') void checkIn()
  }, 60_000)
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void checkIn()
  })
  let was = syncStore.get().loggedIn
  syncStore.subscribe(() => {
    const now = syncStore.get().loggedIn
    if (now !== was) {
      statusStore.set({ friends: {} })
      void checkIn()
    }
    was = now
  })
}
