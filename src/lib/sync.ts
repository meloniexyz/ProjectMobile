import Constants from 'expo-constants'
import { File } from 'expo-file-system'
import { fetch as expoFetch } from 'expo/fetch'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { AppState } from 'react-native'
import * as account from '../core/account'
import { fromB64, setPbkdf2, toB64 } from '../core/keys'
import { hasNativeAudio, NativeAudio } from '../../modules/projectm-audio'
import type { AccountDevice, AccountSession, DeviceInfo } from '../core/account'
import { createStore } from '../core/store'
import { mergePlaylists, type SyncDoc } from '../core/sync'
import type { Playlist } from '../core/types'
import { getPlaylists, saveCoverBytes, setSyncedPlaylists } from './library'
import { JsonFile, secrets } from './storage'

/** ProjectM account on this phone: same playlists as ProjectM on your PCs and other phones (see core/account.ts). */

export interface ProjectMAccountStatus {
  loggedIn: boolean
  email?: string
  syncing: boolean
  lastSync?: number
  error?: string
  /** logged out by the server (password changed elsewhere, removed from the devices list) */
  needsLogin?: boolean
}

const SESSION = 'projectm-account'
/** the old GitHub playlist sync's token (ProjectMobile 1.3.x), removed on first login */
const GITHUB_TOKEN = 'github-sync'
const deletedFile = new JsonFile<Record<string, number>>('deleted-playlists.json', {})
const deviceFile = new JsonFile<{ id?: string }>('device.json', {})
/** local cover file <-> uploaded cover (projectm-cover:<sha256>) */
const coverMap = new JsonFile<Record<string, string>>('cover-map.json', {})

export const syncStore = createStore<ProjectMAccountStatus>({ loggedIn: false, syncing: false })

let session: AccountSession | null = null
let running: Promise<void> | null = null
let again = false
let timer: ReturnType<typeof setTimeout> | null = null

const set = (patch: Partial<ProjectMAccountStatus>) => syncStore.set(patch)

/** iOS's own PBKDF2: in JavaScript a password takes ~30 s on a phone, natively well under one. */
export function enableNativeKeys() {
  if (hasNativeAudio) setPbkdf2(async (pw, salt, iterations, length) => fromB64(await NativeAudio.pbkdf2Sha256(toB64(pw), toB64(salt), iterations, length)))
}

export function initSync() {
  account.setAccountFetch(expoFetch as unknown as typeof fetch)
  enableNativeKeys()
  const raw = secrets.get(SESSION)
  if (raw) {
    try {
      session = JSON.parse(raw) as AccountSession
      set({ loggedIn: true, email: session.email })
      void syncNow()
    } catch {
      // unreadable: stay logged out
    }
  }
  setInterval(() => void syncNow(), 2 * 60 * 1000)
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void syncNow()
  })
}

function device(): DeviceInfo {
  let id = deviceFile.get().id
  if (!id) {
    id = crypto.randomUUID()
    deviceFile.set({ id }, true)
  }
  return { id, name: Constants.deviceName || 'iPhone', platform: 'ios' }
}

async function begin(s: AccountSession) {
  session = s
  await secrets.set(SESSION, JSON.stringify(s))
  // GitHub playlist sync is replaced by the account: its playlists are already on this phone
  await secrets.set(GITHUB_TOKEN, null)
  set({ loggedIn: true, email: s.email, needsLogin: false, error: undefined })
  await syncNow()
}

// ---------- account actions (Settings → Account) ----------

export async function signUp(email: string, password: string) {
  const { session: s, recoveryCode } = await account.signUp(email, password, device())
  await begin(s)
  return { recoveryCode }
}

export async function logIn(email: string, password: string) {
  await begin(await account.logIn(email, password, device()))
}

export async function recover(email: string, code: string, newPassword: string) {
  const { session: s, recoveryCode } = await account.recover(email, code, newPassword, device())
  await begin(s)
  return { recoveryCode }
}

/** Forgot password, no device logged in and no recovery code: after the server owner allowed it. */
export async function ownerReset(email: string, newPassword: string) {
  const { session: s, recoveryCode } = await account.ownerReset(email, newPassword, device())
  await begin(s)
  return { recoveryCode }
}

/** New password from this logged-in phone (no old password needed). */
export const changePassword = (next: string) => guard(account.changePassword(need(), next))

export async function devices(): Promise<{ devices: AccountDevice[]; thisDevice: string }> {
  const info = await guard(account.accountInfo(need()))
  return { devices: info.devices, thisDevice: info.thisDevice }
}

export const removeDevice = (id: string) => guard(account.removeDevice(need(), id))

/** Stops syncing and forgets the session; playlists, settings and history stay on this phone. */
export async function logOut() {
  const s = session
  session = null
  await secrets.set(SESSION, null)
  set({ loggedIn: false, email: undefined, syncing: false, lastSync: undefined, error: undefined, needsLogin: false })
  if (s) await account.logOut(s)
}

export async function deleteAccount(password: string) {
  await account.deleteAccount(need(), password)
  await logOut()
}

function need() {
  if (!session) throw new account.AccountError(401, 'signed_out', 'Not logged in')
  return session
}

/** A request that found the session gone: show "log in again" but keep everything on this phone. */
async function guard<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    if (e instanceof account.AccountError && e.signedOut) {
      const email = session?.email
      session = null
      await secrets.set(SESSION, null)
      set({ loggedIn: false, email, syncing: false, needsLogin: true, error: 'Logged out on this phone. Log in again to keep syncing.' })
    }
    throw e
  }
}

// ---------- playlists ----------

/** A playlist was deleted on this phone: remember it so other devices delete it too. */
export function markPlaylistDeleted(id: string) {
  deletedFile.set({ ...deletedFile.get(), [id]: Date.now() })
}

/** Playlists changed on this phone: sync a few seconds later. */
export function playlistsChanged() {
  if (!session) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), 3000)
}

/** Runs one sync (or queues another if one is already running). */
export function syncNow(): Promise<void> {
  if (!session) return Promise.resolve()
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
  const s = session
  if (!s) return
  set({ syncing: true })
  try {
    await guard(uploadCovers(s))
    const r = await guard(account.syncPlaylists(s, () => ({ playlists: outgoing(getPlaylists()), deleted: deletedFile.get() })))
    // edits made while we were online win if they're newer
    const online: SyncDoc = { v: 1, updatedAt: 0, playlists: r.playlists, deleted: r.deleted }
    const m = mergePlaylists(outgoing(getPlaylists()), deletedFile.get(), online)
    deletedFile.set(m.deleted)
    if (m.localChanged) setSyncedPlaylists(await incoming(m.playlists, s))
    if (m.upload) again = true
    set({ syncing: false, lastSync: Date.now(), error: undefined })
  } catch (e) {
    if (session) set({ syncing: false, error: (e as Error).message })
  }
}

// ---------- covers picked from photos ----------

const isLocalCover = (c?: string) => !!c && c.startsWith('file:')

/** Uploads covers picked on this phone that the account doesn't have yet (shrunk to a small JPEG). */
async function uploadCovers(s: AccountSession) {
  const map = { ...coverMap.get() }
  const touched = new Set<string>()
  for (const p of getPlaylists()) {
    if (!isLocalCover(p.cover) || map[p.cover!]) continue
    const src = new File(p.cover!)
    if (!src.exists) continue
    const image = await ImageManipulator.manipulate(src.uri).resize({ width: 512 }).renderAsync()
    const small = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })
    const tmp = new File(small.uri)
    const ref = await account.uploadCover(s, await tmp.bytes(), 'image/jpeg')
    tmp.delete()
    map[p.cover!] = ref
    map[ref] = p.cover!
    touched.add(p.id)
  }
  if (!touched.size) return
  coverMap.set(map)
  // the account's copy of these playlists gets the cover: count them as changed so it's sent
  const now = Date.now()
  setSyncedPlaylists(getPlaylists().map((p) => (touched.has(p.id) ? { ...p, updatedAt: now } : p)))
}

/** Playlists as the account sees them: local cover files replaced by their uploaded copies. */
function outgoing(list: Playlist[]) {
  const map = coverMap.get()
  return list.map((p) => (p.cover && map[p.cover]?.startsWith(account.COVER_PREFIX) ? { ...p, cover: map[p.cover] } : p))
}

/** Playlists from the account: uploaded covers become local files (downloaded once). */
async function incoming(list: Playlist[], s: AccountSession) {
  const map = { ...coverMap.get() }
  let changed = false
  const out: Playlist[] = []
  for (const p of list) {
    if (!p.cover?.startsWith(account.COVER_PREFIX)) {
      out.push(p)
      continue
    }
    let local: string | undefined = map[p.cover]
    if (local && !new File(local).exists) local = undefined
    if (!local) {
      const got = await account.downloadCover(s, p.cover).catch(() => null)
      if (got) {
        local = saveCoverBytes(got.bytes, got.type)
        map[p.cover] = local
        map[local] = p.cover
        changed = true
      }
    }
    // not downloaded yet: keep the reference so it isn't lost; the mosaic shows meanwhile
    out.push(local ? { ...p, cover: local } : p)
  }
  if (changed) coverMap.set(map)
  return out
}
