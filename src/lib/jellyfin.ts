import * as Crypto from 'expo-crypto'
import { createStore, useStore } from '../core/store'
import { getSettings } from './settings'
import { appVersion } from './update'
import { JsonFile, secrets } from './storage'

/**
 * Full mode: your Jellyfin servers, the one in use, and every request to it. Mirrors Negusify's
 * src/main/jellyfin/servers.ts on Windows: the same fields and ids, so the Negusify account carries
 * the servers (and their sign-ins) between the phone and the PC.
 */

export interface StoredServer {
  /** Negusify's own id for this entry (the same on every device) */
  id: string
  name: string
  /** base address without a trailing slash, e.g. http://100.83.163.35:30200 */
  url: string
  jellyfinId: string
  serverName: string
  version: string
  userId: string
  userName: string
  isAdmin: boolean
  libraryId: string | null
  lastUsedAt: number
}

interface Stored {
  servers: StoredServer[]
  currentId: string | null
  /** one id per installation, so Jellyfin lists this phone as one device */
  deviceId: string
}

/** A saved server as it travels with the Negusify account (same shape as on Windows). */
export interface SyncedServer {
  id: string
  name: string
  url: string
  jellyfinId: string
  serverName: string
  userId: string
  userName: string
  isAdmin: boolean
  /** null when signed out of it */
  token: string | null
}

export interface ServerView extends StoredServer {
  signedIn: boolean
}

const CLIENT = 'Negusify'
const tokenKey = (id: string) => `jellyfin.token.${id}`
const file = new JsonFile<Stored>('servers.json', { servers: [], currentId: null, deviceId: '' })

export const serversStore = createStore<{ servers: ServerView[]; currentId: string | null; version: number }>({ servers: [], currentId: null, version: 0 })
export const useServers = () => useStore(serversStore, (s) => s)
export const useCurrentServer = () => useStore(serversStore, (s) => s.servers.find((x) => x.id === s.currentId) ?? null)

/** something about the servers changed (sync.ts sends it to the account; accounts.ts refreshes) */
export const serverHooks = { changed: () => {} }

let lastSynced = ''
function emit() {
  const s = file.get()
  serversStore.set((st) => ({
    servers: s.servers.map((x) => ({ ...x, signedIn: !!secrets.get(tokenKey(x.id)) })),
    currentId: s.currentId,
    version: st.version + 1,
  }))
  const now = JSON.stringify(syncedServers())
  if (lastSynced && now !== lastSynced) serverHooks.changed()
  lastSynced = now
}

export function initServers() {
  const s = file.get()
  if (!s.deviceId) file.set({ ...s, deviceId: Crypto.randomUUID() }, true)
  emit()
}

/** Full mode is on (Jellyfin only counts then; the servers stay saved either way). */
export const fullMode = () => getSettings().mode === 'full'

export const currentServer = (): StoredServer | null => {
  const s = file.get()
  return s.servers.find((x) => x.id === s.currentId) ?? null
}
export const serverById = (id: string | undefined) => (id ? (file.get().servers.find((x) => x.id === id) ?? null) : null)
export const tokenOf = (id: string) => secrets.get(tokenKey(id))

function authHeader(token?: string | null) {
  const q = (v: string) => `"${encodeURIComponent(v)}"`
  const parts = [`Client=${q(CLIENT)}`, `Device=${q('iPhone')}`, `DeviceId=${q(file.get().deviceId || 'negusify-iphone')}`, `Version=${q(appVersion() ?? '0')}`]
  if (token) parts.push(`Token=${q(token)}`)
  return `MediaBrowser ${parts.join(', ')}`
}

/** "100.83.163.35:30200/" -> "http://100.83.163.35:30200" */
export function normalizeUrl(input: string) {
  let u = input.trim()
  if (!u) throw new Error('Enter the server address')
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  let url: URL
  try {
    url = new URL(u)
  } catch {
    throw new Error(`"${input.trim()}" isn't a valid address`)
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
}

export type Query = Record<string, string | number | boolean | undefined | null>
export const queryString = (query?: Query) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function http<T>(base: string, path: string, opts: { method?: string; query?: Query; body?: unknown; token?: string | null; timeoutMs?: number } = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15_000)
  let res: Response
  try {
    res = await fetch(`${base}${path}${queryString(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers: { Authorization: authHeader(opts.token), Accept: 'application/json', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctl.signal,
    })
  } catch (e) {
    throw new Error(ctl.signal.aborted ? `${base} didn't answer in time` : `Can't reach ${base} (${(e as Error).message})`)
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, data: data as T }
}

/** A request to a saved server (the one in use unless `serverId`), signed in; throws on anything but 2xx. */
export async function jf<T>(path: string, opts: { method?: string; query?: Query; body?: unknown; serverId?: string } = {}): Promise<T> {
  const server = opts.serverId ? serverById(opts.serverId) : currentServer()
  if (!server) throw new Error('Add a Jellyfin server in Settings → Servers')
  const token = tokenOf(server.id)
  if (!token) throw new Error(`Sign in to ${server.name} again (Settings → Servers)`)
  const r = await http<T>(server.url, path, { ...opts, token })
  if (r.status === 401) throw new Error(`${server.name} signed you out. Sign in again in Settings → Servers`)
  if (r.status < 200 || r.status >= 300) {
    const d = r.data as { title?: string; Error?: string } | string | null
    throw new Error(typeof d === 'string' && d && d.length < 300 ? d : (d as { Error?: string })?.Error ?? `${server.name} answered ${r.status}`)
  }
  return r.data
}

// ---------- adding and choosing servers ----------

/** `use: false` keeps the server in use as it is (servers signed in to in the background, from the account). */
export async function signIn(args: { address: string; username: string; password: string; name?: string; use?: boolean }) {
  const url = normalizeUrl(args.address)
  const pub = await http<{ Id: string; ServerName: string; Version: string }>(url, '/System/Info/Public', { timeoutMs: 8000 })
  if (pub.status !== 200 || !pub.data?.Id) throw new Error(`No Jellyfin server found at ${url}`)
  const info = pub.data
  const r = await http<{ AccessToken: string; User: { Id: string; Name: string; Policy?: { IsAdministrator?: boolean } } }>(url, '/Users/AuthenticateByName', {
    method: 'POST',
    body: { Username: args.username, Pw: args.password },
    timeoutMs: 20_000,
  })
  if (r.status === 401 || r.status === 403) throw new Error('Wrong username or password')
  if (r.status !== 200 || !r.data?.AccessToken) throw new Error(`Couldn't sign in (server answered ${r.status})`)
  const auth = r.data
  const list = file.get().servers
  const existing = list.find((x) => x.jellyfinId === info.Id && x.userId === auth.User.Id)
  const server: StoredServer = {
    id: existing?.id ?? Crypto.randomUUID(),
    name: args.name?.trim() || existing?.name || info.ServerName || url,
    url,
    jellyfinId: info.Id,
    serverName: info.ServerName,
    version: info.Version,
    userId: auth.User.Id,
    userName: auth.User.Name,
    isAdmin: !!auth.User.Policy?.IsAdministrator,
    libraryId: existing?.libraryId ?? null,
    lastUsedAt: Date.now(),
  }
  await secrets.set(tokenKey(server.id), auth.AccessToken)
  const currentId = args.use === false && file.get().currentId ? file.get().currentId : server.id
  file.set({ ...file.get(), servers: [...list.filter((x) => x.id !== server.id), server], currentId }, true)
  emit()
  return server
}

/**
 * A server linked to the account that this phone can't sign in to by itself (linked by the owner to an
 * existing Jellyfin user): saved signed out, so Settings → Servers asks for its password once.
 */
export function addSignedOut(l: { url: string; jellyfinServerId: string; serverName: string; jellyfinUserId: string; userName: string }) {
  const s = file.get()
  if (s.servers.some((x) => x.jellyfinId === l.jellyfinServerId && x.userId === l.jellyfinUserId)) return
  const server: StoredServer = {
    id: Crypto.randomUUID(),
    name: l.serverName || l.url,
    url: l.url,
    jellyfinId: l.jellyfinServerId,
    serverName: l.serverName,
    version: '',
    userId: l.jellyfinUserId,
    userName: l.userName,
    isAdmin: false,
    libraryId: null,
    lastUsedAt: 0,
  }
  file.set({ ...s, servers: [...s.servers, server] }, true)
  emit()
}

export function select(id: string) {
  const s = file.get()
  if (!s.servers.some((x) => x.id === id)) return
  file.set({ ...s, currentId: id, servers: s.servers.map((x) => (x.id === id ? { ...x, lastUsedAt: Date.now() } : x)) }, true)
  emit()
}

export async function signOut(id: string) {
  const token = tokenOf(id)
  const server = serverById(id)
  if (token && server) await http(server.url, '/Sessions/Logout', { method: 'POST', token, timeoutMs: 5000 }).catch(() => {})
  await secrets.set(tokenKey(id), null)
  emit()
}

export async function remove(id: string) {
  await secrets.set(tokenKey(id), null)
  const s = file.get()
  const servers = s.servers.filter((x) => x.id !== id)
  file.set({ ...s, servers, currentId: s.currentId === id ? (servers[0]?.id ?? null) : s.currentId }, true)
  emit()
}

export function rename(id: string, name: string) {
  const s = file.get()
  file.set({ ...s, servers: s.servers.map((x) => (x.id === id ? { ...x, name: name.trim() || x.serverName } : x)) }, true)
  emit()
}

/** Is the server in use reachable and still signing us in? */
export async function check(): Promise<string | null> {
  const server = currentServer()
  if (!server) return null
  try {
    await jf('/Users/Me')
    return null
  } catch (e) {
    return (e as Error).message
  }
}

// ---------- following the Negusify account ----------

/** The saved servers for the account (same order and fields every time, so unchanged means equal). */
export function syncedServers(): SyncedServer[] {
  return file
    .get()
    .servers.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      jellyfinId: s.jellyfinId,
      serverName: s.serverName,
      userId: s.userId,
      userName: s.userName,
      isAdmin: s.isAdmin,
      token: secrets.get(tokenKey(s.id)) ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Takes the account's servers: adds and updates them, signs in or out of them, and removes the ones
 * removed on another device. null (logged out of the account) removes them all.
 */
export async function useSyncedServers(list: SyncedServer[] | null) {
  const incoming = list ?? []
  const before = file.get()
  const servers: StoredServer[] = []
  for (const s of incoming) {
    const old = before.servers.find((x) => x.id === s.id) ?? before.servers.find((x) => x.jellyfinId === s.jellyfinId && x.userId === s.userId)
    servers.push({
      id: s.id,
      name: s.name,
      url: s.url,
      jellyfinId: s.jellyfinId,
      serverName: s.serverName,
      version: old?.version ?? '',
      userId: s.userId,
      userName: s.userName,
      isAdmin: s.isAdmin,
      libraryId: old?.libraryId ?? null,
      lastUsedAt: old?.lastUsedAt ?? 0,
    })
    if (old && old.id !== s.id) await secrets.set(tokenKey(old.id), null)
    await secrets.set(tokenKey(s.id), s.token)
  }
  for (const old of before.servers) if (!servers.some((x) => x.id === old.id)) await secrets.set(tokenKey(old.id), null)
  let currentId = before.currentId && servers.some((x) => x.id === before.currentId) ? before.currentId : null
  if (!currentId) currentId = servers.filter((x) => secrets.get(tokenKey(x.id))).sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0]?.id ?? null
  file.set({ ...before, servers, currentId }, true)
  emit()
}

// ---------- addresses for songs and covers ----------

/**
 * Covers of Jellyfin songs are stored as media://jellyfin/<saved server id>/Items/... (the same on the
 * PC, where the page can't load plain http images). Here they become the server's own address.
 */
export function artworkUri(src: string | null | undefined): string | null | undefined {
  if (!src || !src.startsWith('media://jellyfin/')) return src
  const rest = src.slice('media://jellyfin/'.length)
  const i = rest.indexOf('/')
  const server = serverById(rest.slice(0, i))
  return server ? `${server.url}${rest.slice(i)}` : undefined
}
