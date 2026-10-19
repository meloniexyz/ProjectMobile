import Constants from 'expo-constants'
import { File } from 'expo-file-system'
import { fetch as expoFetch } from 'expo/fetch'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { AppState } from 'react-native'
import * as account from '../core/account'
import { fromB64, setPbkdf2, toB64 } from '../core/keys'
import { hasNativeAudio, NativeAudio } from '../../modules/projectm-audio'
import type { AccountDevice, AccountSession, DeviceInfo } from '../core/account'
import { createStore } from '../core/store'
import { mergePlaylists, type SyncDoc } from '../core/sync'
import type { Playlist } from '../core/types'
import { forgetAccountSignIns, initExtras, syncExtras } from './accountExtras'
import { getPlaylists, saveCoverBytes, setSyncedPlaylists } from './library'
import { matchHooks } from './sources'
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
  /** @username, display name, pictures (files on this phone), colours, About me */
  profile?: LocalProfile
}

/** A profile ready to show: pictures are file addresses on this phone. Yours or someone else's. */
export interface ShownProfile {
  handle: string | null
  displayName: string
  avatar: string | null
  banner: string | null
  colors: [string, string] | null
  bio: string
  memberSince: number
}

/** Your own profile, plus the server hashes of your pictures (to notice changes). */
export interface LocalProfile extends ShownProfile {
  avatarHash: string | null
  bannerHash: string | null
}

const SESSION = 'projectm-account'
/** the old GitHub playlist sync's token (ProjectMobile 1.3.x), removed on first login */
const GITHUB_TOKEN = 'github-sync'
const deletedFile = new JsonFile<Record<string, number>>('deleted-playlists.json', {})
const deviceFile = new JsonFile<{ id?: string }>('device.json', {})
/** local cover file <-> uploaded cover (projectm-cover:<sha256>) */
const coverMap = new JsonFile<Record<string, string>>('cover-map.json', {})
/** the last profile seen, so it shows straight away (also offline) */
const profileFile = new JsonFile<LocalProfile | null>('account-profile.json', null)

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
  // a new song pick (which recording a Spotify song plays from) goes to the account a few seconds later
  matchHooks.changed = playlistsChanged
  account.setAccountFetch(expoFetch as unknown as typeof fetch)
  enableNativeKeys()
  initExtras()
  const raw = secrets.get(SESSION)
  if (raw) {
    try {
      session = JSON.parse(raw) as AccountSession
      set({ loggedIn: true, email: session.email, profile: profileFile.get() ?? undefined })
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

export async function signUp(email: string, password: string, handle: string, displayName: string) {
  const { session: s, recoveryCode } = await account.signUp(email, password, device(), { handle, displayName })
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
  set({ loggedIn: false, email: undefined, syncing: false, lastSync: undefined, error: undefined, needsLogin: false, profile: undefined })
  profileFile.set(null, true)
  await forgetAccountSignIns()
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
    await guard(syncExtras(s))
    await guard(refreshProfile(s))
    set({ syncing: false, lastSync: Date.now(), error: undefined })
  } catch (e) {
    if (session) set({ syncing: false, error: (e as Error).message })
  }
}

// ---------- profile ----------

/** Fetches the account's profile and downloads changed pictures once. */
async function refreshProfile(s: AccountSession) {
  await applyProfile(s, (await account.accountInfo(s)).profile)
}

async function applyProfile(s: AccountSession, p: account.Profile) {
  const cur = syncStore.get().profile
  const picture = async (kind: account.ProfileImage) => {
    const hash = p[kind]
    if (!hash) return null
    const mine = cur?.[kind]
    if (cur?.[`${kind}Hash`] === hash && mine && new File(mine).exists) return mine
    const got = await account.downloadProfileImage(s, kind, hash).catch(() => null)
    return got ? saveCoverBytes(got.bytes, got.type) : null
  }
  const next: LocalProfile = {
    handle: p.handle,
    displayName: p.displayName,
    colors: p.colors,
    bio: p.bio,
    memberSince: p.memberSince,
    avatarHash: p.avatar,
    avatar: await picture('avatar'),
    bannerHash: p.banner,
    banner: await picture('banner'),
  }
  if (JSON.stringify(next) !== JSON.stringify(cur)) {
    profileFile.set(next, true)
    set({ profile: next })
  }
}

export const handleAvailable = (h: string) => account.handleAvailable(h)

export async function updateProfile(patch: { handle?: string; displayName?: string; colors?: [string, string] | null; bio?: string }) {
  const s = need()
  await applyProfile(s, await guard(account.updateProfile(s, patch)))
}

/**
 * Pick a photo (square, 256 px) or banner (5:2 like Discord, 960x384) from the phone's photos;
 * false when cancelled.
 */
export async function pickProfileImage(kind: account.ProfileImage) {
  const s = need()
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: kind === 'banner' ? [5, 2] : [1, 1], quality: 0.9 })
  if (res.canceled || !res.assets[0]) return false
  const [w, h] = kind === 'banner' ? [960, 384] : [256, 256]
  const image = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: w, height: h }).renderAsync()
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.86 })
  const file = new File(out.uri)
  const bytes = await file.bytes()
  const hash = await guard(account.uploadProfileImage(s, kind, bytes, 'image/jpeg'))
  const local = saveCoverBytes(bytes, 'image/jpeg')
  file.delete()
  const next = { ...syncStore.get().profile!, [kind]: local, [`${kind}Hash`]: hash }
  profileFile.set(next, true)
  set({ profile: next })
  return true
}

export async function removeProfileImage(kind: account.ProfileImage) {
  await guard(account.removeProfileImage(need(), kind))
  const next = { ...syncStore.get().profile!, [kind]: null, [`${kind}Hash`]: null }
  profileFile.set(next, true)
  set({ profile: next })
}

// ---------- other people (Search → ProjectM) ----------

/** pictures of other people already downloaded: hash -> file */
const seen = new Map<string, string>()

async function shown(s: AccountSession, u: account.PublicProfile): Promise<ShownProfile> {
  const picture = async (kind: account.ProfileImage) => {
    const hash = u[kind]
    if (!hash) return null
    const known = seen.get(hash)
    if (known) return known
    const got = await account.downloadUserImage(s, u.handle, kind, hash).catch(() => null)
    if (!got) return null
    const local = saveCoverBytes(got.bytes, got.type)
    seen.set(hash, local)
    return local
  }
  const [avatar, banner] = await Promise.all([picture('avatar'), picture('banner')])
  return { handle: u.handle, displayName: u.displayName, colors: u.colors, bio: u.bio, memberSince: u.memberSince, avatar, banner }
}

/** People on ProjectM by @username or name (photos only; banners load on their profile). */
export async function searchPeople(query: string) {
  const s = need()
  const list = await guard(account.searchUsers(s, query))
  return Promise.all(list.map((u) => shown(s, { ...u, banner: null })))
}

export async function person(handle: string) {
  const s = need()
  return shown(s, await guard(account.getUser(s, handle)))
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
