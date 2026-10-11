import { Linking, AppState } from 'react-native'
import { createStore } from '../core/store'
import { finishDeviceLogin, GitHubSync, mergePlaylists, startDeviceLogin, syncOnce, SyncError, type SyncDoc, type SyncStatus } from '../core/sync'
import { getPlaylists, setSyncedPlaylists } from './library'
import { JsonFile, secrets } from './storage'

/** Playlist sync with ProjectM on Windows and other phones, through a private GitHub repo (see core/sync.ts). */

const TOKEN = 'github-sync'
const deletedFile = new JsonFile<Record<string, number>>('deleted-playlists.json', {})

export const syncStore = createStore<SyncStatus>({ connected: false, syncing: false })

let gh: GitHubSync | null = null
let running: Promise<void> | null = null
let again = false
let timer: ReturnType<typeof setTimeout> | null = null
let loginId = 0

const set = (patch: Partial<SyncStatus>) => syncStore.set(patch)

export function initSync() {
  const token = secrets.get(TOKEN)
  if (token) {
    gh = new GitHubSync(token)
    set({ connected: true })
    void syncNow()
  }
  setInterval(() => void syncNow(), 2 * 60 * 1000)
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void syncNow()
  })
}

/** A playlist was deleted on this phone: remember it so other devices delete it too. */
export function markPlaylistDeleted(id: string) {
  deletedFile.set({ ...deletedFile.get(), [id]: Date.now() })
}

/** Playlists changed on this phone: sync a few seconds later. */
export function playlistsChanged() {
  if (!gh) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), 3000)
}

export async function connectSync() {
  const id = ++loginId
  set({ error: undefined })
  try {
    const code = await startDeviceLogin()
    set({ code: { userCode: code.user_code, url: code.verification_uri } })
    const token = await finishDeviceLogin(code, () => id !== loginId)
    const client = new GitHubSync(token)
    const account = await client.account()
    await secrets.set(TOKEN, token)
    gh = client
    set({ connected: true, account, code: undefined })
    await syncNow()
  } catch (e) {
    if (id === loginId) set({ code: undefined, error: (e as Error).message })
  }
}

export const openSyncPage = () => {
  const url = syncStore.get().code?.url
  if (url) void Linking.openURL(url)
}

export function cancelSyncLogin() {
  loginId++
  set({ code: undefined })
}

export async function disconnectSync() {
  loginId++
  gh = null
  await secrets.set(TOKEN, null)
  set({ connected: false, account: undefined, lastSync: undefined, error: undefined, code: undefined })
}

/** Runs one sync (or queues another if one is already running). */
export function syncNow(): Promise<void> {
  if (!gh) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = run().finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

async function run() {
  const client = gh
  if (!client) return
  set({ syncing: true })
  try {
    if (!syncStore.get().account) set({ account: await client.account() })
    await syncOnce(
      client,
      () => ({ playlists: getPlaylists(), deleted: deletedFile.get() }),
      (r) => {
        // edits made while we were online win if they're newer
        const online: SyncDoc = { v: 1, updatedAt: 0, playlists: r.playlists, deleted: r.deleted }
        const m = mergePlaylists(getPlaylists(), deletedFile.get(), online)
        deletedFile.set(m.deleted)
        if (m.localChanged) setSyncedPlaylists(m.playlists)
        if (m.upload) again = true
      },
      'iPhone',
    )
    set({ syncing: false, lastSync: Date.now(), error: undefined })
  } catch (e) {
    if (e instanceof SyncError && e.signedOut) await disconnectSync()
    set({ syncing: false, error: (e as Error).message })
  }
}
