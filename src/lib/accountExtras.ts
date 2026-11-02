import { File } from 'expo-file-system'
import * as account from '../core/account'
import type { AccountSession } from '../core/account'
import { createStore } from '../core/store'
import type { ListenEntry, Track } from '../core/types'
import { refreshStatuses } from './accounts'
import { historyHooks, historyStore, replaceHistory } from './history'
import { getPlaylists, localUriFor, saveReceivedSong } from './library'
import { onWifi } from './net'
import { getSettings, updateSettings, type MobileSettings } from './settings'
import { songMatches, soundcloud, spotify, youtube } from './sources'
import { addSignedOut, remove as removeServer, signIn as signInServer, syncedServers, useSyncedServers, type SyncedServer } from './jellyfin'
import { JsonFile } from './storage'

/**
 * Everything besides playlists that follows a Negusify account on this phone: look, sound and
 * quality settings, listening history, platform sign-ins and local songs passing between devices.
 * Mirrors Negusify's src/main/account-extras.ts on Windows.
 */

const LOOK_KEYS = ['theme', 'accent', 'logo', 'uiStyle'] as const
const SOUND_KEYS = ['eq', 'loudnessLevel', 'normalize', 'wifiQuality', 'cellularQuality', 'downloadQuality'] as const

interface ExtrasState {
  known: { look: Record<string, { json: string; at: number }>; sound: Record<string, { json: string; at: number }>; platforms: Record<string, { json: string; at: number }> }
  fromAccount: string[]
  history: { cursor: number; pending: string[]; removed: string[]; clearedBefore?: number; sendAll?: boolean }
  /** the account's linked Jellyfin servers at the last sync (account.knownLinks) */
  links: string[]
}

const EMPTY: ExtrasState = {
  known: { look: {}, sound: {}, platforms: {} },
  fromAccount: [],
  // the first sync sends this phone's whole history (newest 5000 plays)
  history: { cursor: 0, pending: [], removed: [], sendAll: true },
  links: [],
}

const stateFile = new JsonFile<ExtrasState>('account-extras.json', EMPTY)
const s = () => ({ ...EMPTY, ...stateFile.get() })
const save = (patch: Partial<ExtrasState>) => stateFile.set({ ...s(), ...patch })

/** local songs passing between devices, for Settings → Negusify account */
export const relayStore = createStore<{ waitingForDevice: number; waitingForSpace: number; waitingForWifi: number; sending: number; receiving: number }>({
  waitingForDevice: 0,
  waitingForSpace: 0,
  waitingForWifi: 0,
  sending: 0,
  receiving: 0,
})

/** The account's linked Jellyfin servers; null until the first sync (the "link a server" prompt waits for it). */
export const linksStore = createStore<{ links: account.AccountLink[] | null }>({ links: null })

export function initExtras() {
  historyHooks.onChange = (c) => {
    const h = s().history
    if (c.upsert && !h.pending.includes(c.upsert)) save({ history: { ...h, pending: [...h.pending, c.upsert].slice(-5000) } })
    if (c.remove) save({ history: { ...h, removed: [...h.removed, c.remove], pending: h.pending.filter((p) => p !== c.remove) } })
    if (c.clear) save({ history: { ...h, clearedBefore: Date.now(), pending: [] } })
  }
}

export async function syncExtras(session: AccountSession) {
  await syncSettings(session, 'look', LOOK_KEYS)
  await syncSettings(session, 'sound', SOUND_KEYS)
  await syncHistory(session)
  await syncPlatforms(session)
  await syncMatches(session)
  await syncLinks(session)
  await syncRelay(session).catch((e) => console.warn('[account] relay', e))
}

/**
 * Jellyfin servers linked to the account (after the platform sign-ins, which already carry servers
 * signed in on another device): links servers saved here, signs in to the account's own instance with
 * the password derived from the account key, and saves owner-linked servers signed out (asks their
 * password once). See account.planLinks.
 */
async function syncLinks(session: AccountSession) {
  let links = await account.getLinks(session)
  // the instance assigned to this email may not be set up yet (it was down, or assigned later)
  if (!links.some((l) => l.source === 'assigned')) links = await account.provisionLinks(session)
  const plan = account.planLinks(links, syncedServers(), s().links)
  for (const srv of plan.link)
    links = await account.addLink(session, { url: srv.url, jellyfinServerId: srv.jellyfinId, serverName: srv.serverName, jellyfinUserId: srv.userId, userName: srv.userName })
  for (const l of plan.unlink) links = await account.removeLink(session, l.linkId)
  for (const srv of plan.forget) await removeServer((srv as SyncedServer).id)
  for (const l of plan.signIn) {
    if (l.source === 'assigned')
      try {
        await signInServer({ address: l.url, username: l.userName, password: account.jellyfinPasswordOf(session), name: l.serverName, use: false })
        continue
      } catch (e) {
        console.warn('[account] assigned server', e)
      }
    addSignedOut(l)
  }
  if (plan.link.length || plan.signIn.length || plan.forget.length) refreshStatuses()
  save({ links: account.knownLinks(links) })
  linksStore.set({ links })
}

async function syncSettings(session: AccountSession, kind: 'look' | 'sound', keys: readonly (keyof MobileSettings)[]) {
  const cur = getSettings()
  const values = Object.fromEntries(keys.map((k) => [k, cur[k]]))
  const r = await account.syncSettings(session, kind, () => account.localFields(values, s().known[kind]))
  const patch = Object.fromEntries(r.take.filter((k) => (keys as readonly string[]).includes(k)).map((k) => [k, r.merged.fields[k].v])) as Partial<MobileSettings>
  if (Object.keys(patch).length) updateSettings(patch)
  save({ known: { ...s().known, [kind]: account.knownFrom(r.merged) } })
}

async function syncHistory(session: AccountSession) {
  const h = s().history
  const all = historyStore.get().entries
  const byId = new Map(all.map((e) => [e.id, e]))
  const entries = h.sendAll ? all.slice(0, 5000) : h.pending.map((id) => byId.get(id)).filter((e): e is ListenEntry => !!e)
  if (entries.length || h.removed.length || h.clearedBefore) {
    for (let i = 0; i < Math.max(entries.length, 1); i += 1000) {
      await account.sendHistory(session, {
        entries: entries.slice(i, i + 1000),
        ...(i === 0 ? { removed: h.removed, ...(h.clearedBefore ? { clearedBefore: h.clearedBefore } : {}) } : {}),
      })
    }
  }
  const got = await account.fetchHistory(session, h.cursor)
  const removed = new Set(got.removed)
  const merged = new Map<string, ListenEntry>()
  for (const e of [...historyStore.get().entries, ...got.entries]) {
    if (removed.has(e.id) || e.endedAt <= got.clearedBefore) continue
    const prev = merged.get(e.id)
    if (!prev || e.endedAt > prev.endedAt) merged.set(e.id, e)
  }
  const list = [...merged.values()].sort((a, b) => b.startedAt - a.startedAt)
  const before = historyStore.get().entries
  if (list.length !== before.length || list.some((e, i) => e.id !== before[i]?.id || e.endedAt !== before[i]?.endedAt)) replaceHistory(list)
  // anything changed locally while we were syncing stays pending
  const sent = new Map(entries.map((e) => [e.id, e.endedAt]))
  const now = s().history
  const latest = new Map(historyStore.get().entries.map((e) => [e.id, e.endedAt]))
  save({
    history: {
      cursor: got.cursor,
      pending: now.pending.filter((id) => sent.get(id) !== latest.get(id)),
      removed: now.removed.filter((id) => !h.removed.includes(id)),
      clearedBefore: now.clearedBefore !== h.clearedBefore ? now.clearedBefore : undefined,
      sendAll: false,
    },
  })
}

/** Which recording each Spotify song plays from: the same on every device. */
async function syncMatches(session: AccountSession) {
  const r = await account.syncMatches(session, () => songMatches.get())
  if (Object.keys(r.take).length) songMatches.set({ ...songMatches.get(), ...r.take })
}

async function syncPlatforms(session: AccountSession) {
  const values = { youtube: youtube.syncedLogin(), soundcloud: soundcloud.syncedProfile(), spotifyClientId: spotify.syncedClientId(), jellyfin: syncedServers() }
  const r = await account.syncPlatforms(session, () => account.localFields(values, s().known.platforms))
  const fromAccount = new Set(s().fromAccount)
  for (const k of r.take) {
    const v = r.merged.fields[k].v
    if (k === 'youtube') await youtube.useSyncedLogin(v as Record<string, unknown> | null)
    else if (k === 'soundcloud') soundcloud.useSyncedProfile(v)
    else if (k === 'spotifyClientId') await spotify.useSyncedClientId(v as string | null)
    // your Jellyfin servers and their sign-ins, the same on the PC and the phone
    else if (k === 'jellyfin') await useSyncedServers(v as SyncedServer[] | null)
    else continue
    if (v === null) fromAccount.delete(k)
    else fromAccount.add(k)
  }
  if (r.take.length) refreshStatuses()
  save({ known: { ...s().known, platforms: account.knownFrom(r.merged) }, fromAccount: [...fromAccount] })
}

/** On log out: sign-ins that came from the account are removed from this phone. */
export async function forgetAccountSignIns() {
  const from = s().fromAccount
  if (from.includes('youtube')) await youtube.useSyncedLogin(null)
  if (from.includes('soundcloud')) soundcloud.useSyncedProfile(null)
  if (from.includes('jellyfin')) await useSyncedServers(null)
  if (from.length) refreshStatuses()
  linksStore.set({ links: null })
  stateFile.set(EMPTY, true)
}

// ---------- local songs ----------

const MIME: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', alac: 'audio/mp4', aif: 'audio/aiff', aiff: 'audio/aiff', caf: 'audio/x-caf', mp4: 'audio/mp4' }
const EXT: Record<string, string> = Object.fromEntries(Object.entries(MIME).map(([k, v]) => [v, k]))

async function syncRelay(session: AccountSession) {
  const tracks = new Map<string, Track>()
  for (const p of getPlaylists()) for (const t of p.tracks) if (t.source === 'local') tracks.set(account.songKey(t.title, t.artist), t)
  const have: { key: string; size: number }[] = []
  const need: { key: string; title: string; artist: string; duration: number }[] = []
  const files = new Map<string, File>()
  for (const [key, t] of tracks) {
    const uri = localUriFor(t)
    const f = uri ? new File(uri) : null
    if (f?.exists && f.size) {
      have.push({ key, size: f.size })
      files.set(key, f)
    } else need.push({ key, title: t.title, artist: t.artist, duration: t.duration })
  }
  if (!have.length && !need.length) return relayStore.set({ waitingForDevice: 0, waitingForSpace: 0, waitingForWifi: 0, sending: 0, receiving: 0 })
  const plan = await account.relayReport(session, have, need)
  // songs come down only on Wi-Fi unless "download on mobile data" is on
  const mayDownload = onWifi() || getSettings().downloadOnCellular
  relayStore.set({
    waitingForDevice: plan.waitingForDevice,
    waitingForSpace: plan.waitingForSpace,
    waitingForWifi: mayDownload ? 0 : plan.downloads.length,
    sending: plan.uploads.length,
    receiving: mayDownload ? plan.downloads.length : 0,
  })
  for (const key of plan.uploads) {
    const f = files.get(key)!
    const ext = f.extension.replace('.', '').toLowerCase()
    await account.relayUpload(session, key, await f.bytes(), MIME[ext] ?? 'application/octet-stream', `${tracks.get(key)!.title}.${ext}`)
  }
  if (mayDownload)
    for (const key of plan.downloads) {
      const got = await account.relayDownload(session, key)
      if (!got) continue
      const ext = (got.name.split('.').pop() ?? '').toLowerCase() || EXT[got.type] || 'mp3'
      saveReceivedSong(tracks.get(key)!.id, got.bytes, ext)
      await account.relayDone(session, key)
    }
  relayStore.set({ ...relayStore.get(), sending: 0, receiving: 0 })
}
