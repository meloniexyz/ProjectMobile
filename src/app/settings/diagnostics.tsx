import { fromBase64, mergePlaylists, toBase64 } from '../../core/sync'
import * as account from '../../core/account'
import { passwordKeys, setPbkdf2, toB64 } from '../../core/keys'
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { createPlaylist, getPlaylists, localUriFor } from '../../lib/library'
import { historyStore } from '../../lib/history'
import * as accountSync from '../../lib/sync'
import { File } from 'expo-file-system'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import type { Track } from '../../core/types'
import { getLyrics } from '../../core/lyrics'
import { getSongInfo } from '../../core/songinfo'
import { PRESETS, curveToBands } from '../../core/eqPresets'
import { hasNativeAudio, NativeAudio } from '../../../modules/projectm-audio'
import { Button, Header, Icon, Txt } from '../../components/ui'
import { ensureOnPhone, fileUri, lookup, removeDownload } from '../../lib/audioCache'
import { eqFilters } from '../../lib/eq'
import { getPlayer, playTracks, seek, toggle } from '../../lib/player'
import { DEFAULT_MOBILE_SETTINGS, getSettings } from '../../lib/settings'
import { resolvePlan, songMatches, soundcloud, youtube } from '../../lib/sources'
import { dataDir } from '../../lib/storage'
import { useColors, ui } from '../../lib/theme'

interface Result {
  name: string
  ok: boolean
  /** couldn't be tested from this network (YouTube's bot wall on data-center connections) */
  skipped?: boolean
  detail: string
  ms: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Self-test of everything that talks to the outside world or the audio engine. */
/** CI only: an account the CI made with ProjectM's PC account code, to check the real app syncs with it. */
interface CrossCheck {
  email: string
  password: string
}

async function runAll(report: (r: Result) => void, cross?: CrossCheck) {
  const run = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now()
    try {
      const detail = await fn()
      report({ name, ok: true, detail, ms: Date.now() - t0 })
      return true
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      if (/confirm you.re not a bot/i.test(detail)) {
        report({ name, ok: true, skipped: true, detail: `skipped: YouTube refused this connection with a bot check (common with VPNs and data-center networks): ${detail}`, ms: Date.now() - t0 })
        return false
      }
      report({ name, ok: false, detail, ms: Date.now() - t0 })
      return false
    }
  }

  await run('Native audio engine', async () => {
    if (!hasNativeAudio) throw new Error('not loaded (web preview?)')
    const s = await NativeAudio.getState()
    return `ok (queued ${String((s as { queued?: number }).queued ?? 0)})`
  })

  let yt: Track | null = null
  await run('YouTube search', async () => {
    const r = await youtube.search('Daft Punk One More Time', 5)
    if (!r.length) throw new Error('no results')
    yt = r[0]
    return `${r.length} results, first: ${r[0].title} – ${r[0].artist}`
  })

  await run('YouTube playback token', async () => {
    const s = await youtube.potSession()
    return `token ${s.token.length} chars, valid until ${new Date(s.expiresAt).toLocaleTimeString()}`
  })

  if (yt) {
    const track: Track = yt
    await run('YouTube connection methods', async () => {
      const r = await youtube.probeMethods(track.id)
      const names: Record<string, string> = { ios: 'iPhone app', ytmusic: 'YouTube Music app', mweb: 'Mobile site', 'tv-simply': 'TV (phone session)', 'tv-simply-server': 'TV (YouTube session)', account: 'Signed-in account' }
      const text = r.map((m) => `${m.ok ? '✓' : '✗'} ${names[m.method]}: ${m.detail}`).join('\n')
      if (!r.some((m) => m.ok)) throw new Error(text)
      return text
    })
  }

  if (yt) {
    const track: Track = yt
    await run('YouTube token accepted (audio past 1 MB)', async () => {
      const p = await youtube.plan(track.id, 'mid')
      const u = new URL(p.url)
      u.searchParams.set('range', '2000000-2065535')
      const res = await fetch(u.toString())
      if (!res.ok) throw new Error(`HTTP ${res.status} (token rejected)`)
      return `HTTP ${res.status}, ${p.quality}, ${(p.bytes ?? 0) / 1e6} MB file`
    })
  }

  let ytFile: string | null = null
  if (yt) {
    const track: Track = yt
    await run('YouTube download (mid)', async () => {
      removeDownload(track.uid)
      const e = await ensureOnPhone(track, 'mid')
      ytFile = fileUri(e)
      return `${e.label}, ${(e.bytes / 1e6).toFixed(2)} MB, gain ${e.gainDb?.toFixed(1) ?? '?'} dB`
    })
  }

  if (ytFile) {
    const uri: string = ytFile
    await run('Loudness measurement', async () => {
      const lufs = await NativeAudio.measureLoudness(uri)
      if (lufs == null) throw new Error('no result')
      return `${lufs.toFixed(1)} LUFS`
    })
  }

  if (yt) {
    const track: Track = yt
    await run('Playback (YouTube)', async () => {
      playTracks([track], 0, false)
      for (let i = 0; i < 30 && !(getPlayer().playing && getPlayer().position > 1.5); i++) await sleep(500)
      const s = getPlayer()
      if (!s.playing || s.position < 1.5) throw new Error(`not playing (position ${s.position.toFixed(1)} s, error: ${s.error ?? 'none'})`)
      const pos = s.position
      toggle()
      return `played to ${pos.toFixed(1)} s · ${s.quality ?? ''}`
    })
  }

  await run('YouTube song (YouTube, or SoundCloud backup)', async () => {
    const t: Track = { uid: 'youtube:diag', source: 'youtube', id: 'FGBhQbmPwH8', title: 'One More Time', artist: 'Daft Punk', album: 'Discovery', duration: 320 }
    const r = await resolvePlan(t, 'mid')
    return r.via ? `YouTube refused, playing from ${r.via.source}: ${r.via.title} · ${r.plan.quality}` : `from YouTube · ${r.plan.quality}`
  })

  let sc: Track | null = null
  await run('SoundCloud search', async () => {
    const r = await soundcloud.search('lofi chill beat', 8)
    if (!r.length) throw new Error('no results')
    // first upload whose stream this network may play
    for (const t of r.slice(0, 5)) {
      const ok = await soundcloud.plan(t.id, 'best').then(() => true, () => false)
      if (ok) {
        sc = t
        break
      }
    }
    if (!sc) throw new Error(`none of the first 5 results is streamable here: ${r.slice(0, 5).map((t) => t.title).join(' / ')}`)
    return `${r.length} results, using: ${(sc as Track).title}`
  })
  if (sc) {
    const track: Track = sc
    await run('SoundCloud download (best, AAC over HLS)', async () => {
      removeDownload(track.uid)
      const e = await ensureOnPhone(track, 'best')
      return `${e.label}, ${(e.bytes / 1e6).toFixed(2)} MB`
    })
    await run('Playback (SoundCloud)', async () => {
      playTracks([track], 0, false)
      for (let i = 0; i < 30 && !(getPlayer().playing && getPlayer().position > 1.5); i++) await sleep(500)
      const s = getPlayer()
      if (!s.playing || s.position < 1.5) throw new Error(`not playing (position ${s.position.toFixed(1)} s, error: ${s.error ?? 'none'})`)
      // SoundCloud audio is stitched together from pieces: make sure jumping ahead works
      const target = Math.min(45, Math.max(5, (getPlayer().duration || 60) - 15))
      seek(target)
      for (let i = 0; i < 16 && Math.abs(getPlayer().position - target) > 3; i++) await sleep(500)
      const after = getPlayer().position
      toggle()
      if (Math.abs(after - target) > 3) throw new Error(`seeking to ${target} s landed at ${after.toFixed(1)} s`)
      return `played to ${s.position.toFixed(1)} s, seeked to ${after.toFixed(1)} s · ${s.quality ?? ''}`
    })
    await run('SoundCloud low quality plan', async () => {
      const p = await soundcloud.plan(track.id, 'low')
      return `${p.quality} (${p.kind})`
    })
  }

  await run('Spotify song → YouTube/SoundCloud match', async () => {
    const fake: Track = { uid: 'spotify:diag', source: 'spotify', id: 'diag', title: 'One More Time', artist: 'Daft Punk', album: 'Discovery', duration: 320 }
    const r = await resolvePlan(fake, 'mid')
    return `${r.via?.source}: ${r.via?.title} · ${r.plan.quality}`
  })

  await run('Lyrics (LRCLIB)', async () => {
    // a second song after a pause, so one dropped request doesn't count as broken lyrics
    let l = await getLyrics('One More Time', 'Daft Punk', 'Discovery', 320).catch(() => [])
    if (!l.length) {
      await sleep(2000)
      l = await getLyrics('Get Lucky', 'Daft Punk', 'Random Access Memories', 369).catch(() => [])
    }
    if (!l.length) throw new Error('none found')
    return `${l.length} versions, synced: ${l.some((x) => x.synced) ? 'yes' : 'no'}`
  })

  await run('Song info (MusicBrainz)', async () => {
    const i = (await getSongInfo('One More Time', 'Daft Punk', 320)) ?? (await sleep(2000), await getSongInfo('Get Lucky', 'Daft Punk', 369))
    if (!i) throw new Error('not found')
    return `${i.album ?? '?'} · ${i.released ?? '?'}`
  })

  await run('Playlist sync (merge)', async () => {
    const text = 'Şarkı ✓ 😀 "x"'
    if (fromBase64(toBase64(text)) !== text) throw new Error('text encoding broke')
    const t = { uid: 'spotify:1', source: 'spotify', id: '1', title: text, artist: 'a', album: 'b', duration: 1 } as const
    const p = (id: string, updatedAt: number) => ({ id, name: id, tracks: [t], createdAt: 1, updatedAt })
    const now = Date.now()
    const r = mergePlaylists([p('a', now - 10), p('b', now - 10)], { b: now - 5 }, { v: 1, updatedAt: 0, playlists: [p('a', now - 1), p('c', now - 3)], deleted: {} }, now)
    const ids = r.playlists.map((x) => x.id).join(',')
    if (ids !== 'a,c' || r.playlists[0].updatedAt !== now - 1 || !r.upload) throw new Error(`merged to ${ids}`)
    return 'newest edit wins, deletions and new playlists carried over'
  })

  await run('Account keys speed (310k rounds)', async () => {
    // native and JavaScript PBKDF2 must agree, or logins from PC and phone wouldn't match
    const salt = toB64(crypto.getRandomValues(new Uint8Array(16)))
    const native = await passwordKeys('same on every device ş', salt, 2000)
    setPbkdf2((pw, s, c, dkLen) => pbkdf2Async(sha256, pw, s, { c, dkLen }))
    const js = await passwordKeys('same on every device ş', salt, 2000)
    accountSync.enableNativeKeys()
    if (native.loginKey !== js.loginKey) throw new Error('native PBKDF2 gives a different key than the PC')
    const t0 = Date.now()
    await passwordKeys('timing check', toB64(crypto.getRandomValues(new Uint8Array(16))), 310_000)
    const ms = Date.now() - t0
    if (ms > 3000) throw new Error(`${ms} ms: too slow for logging in`)
    return `${ms} ms per password (once per log in)`
  })

  await run('ProjectM account (throwaway, then deleted)', async () => {
    // talks to the server directly; this phone's own login is not touched
    const email = `diag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
    const dev = (n: string) => ({ id: `diag-${n}-${Math.random().toString(36).slice(2, 10)}`, name: `Diagnostics ${n}`, platform: 'ios' as const })
    const handle = `diag_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    const { session: a } = await account.signUp(email, 'diagnostics-pass', dev('a'), { handle, displayName: 'Diagnostics' })
    try {
      const b = await account.logIn(email, 'diagnostics-pass', dev('b'))
      if (b.accountKey !== a.accountKey) throw new Error('second device got a different key')
      // profile: the other device sees it, and people search finds it (without the email)
      await account.updateProfile(a, { bio: 'diag', colors: ['#112233', '#445566'] })
      const p = (await account.accountInfo(b)).profile
      if (p.handle !== handle || p.bio !== 'diag' || p.colors?.[0] !== '#112233') throw new Error(`profile didn't reach the second device (${JSON.stringify(p)})`)
      const found = await account.searchUsers(b, handle)
      if (!found.some((u) => u.handle === handle)) throw new Error('people search did not find the account')
      if (JSON.stringify(found).includes('@example.com')) throw new Error('people search showed an email')
      const t = { uid: 'spotify:diag', source: 'spotify', id: 'diag', title: 'Şarkı 😀', artist: 'a', album: 'b', duration: 1 } as const
      const cover = await account.uploadCover(a, new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), 'image/jpeg')
      await account.syncPlaylists(a, () => ({ playlists: [{ id: 'diag-a', name: 'A', tracks: [t], createdAt: 1, updatedAt: Date.now(), cover }], deleted: {} }))
      const r = await account.syncPlaylists(b, () => ({ playlists: [], deleted: {} }))
      const got = r.playlists.find((p) => p.id === 'diag-a')
      if (!got || got.tracks[0]?.title !== t.title) throw new Error('playlist did not reach the second device')
      const back = await account.downloadCover(b, got.cover ?? '')
      if (back?.bytes.length !== 6) throw new Error('cover did not reach the second device')
      return 'sign up, log in on a 2nd device, playlist + cover synced, account deleted'
    } finally {
      await account.deleteAccount(a, 'diagnostics-pass').catch(() => {})
    }
  })

  if (cross) {
    await run('Same account as the PC (CI)', async () => {
      // the real app flow: log in, receive the PC's playlist, send one back
      await accountSync.logIn(cross.email, cross.password)
      for (let i = 0; i < 20 && !getPlaylists().some((p) => p.name === 'From PC (CI)'); i++) await sleep(500)
      if (!getPlaylists().some((p) => p.name === 'From PC (CI)')) throw new Error("the PC's playlist didn't arrive")
      // stage 2: look, history, platform sign-in and the local song's file came along
      await accountSync.syncNow()
      const missing: string[] = []
      if (getSettings().accent !== '#22d3ee') missing.push(`accent (${getSettings().accent})`)
      if (!historyStore.get().entries.some((e) => e.id === 'ci-play')) missing.push('history')
      if (soundcloud.syncedProfile()?.username !== 'ci-check') missing.push('SoundCloud profile')
      const song = getPlaylists().flatMap((p) => p.tracks).find((t) => t.id === 'ci-pc-file')
      if (!song || !localUriFor(song)) missing.push('local song file')
      if (songMatches.get()['spotify:ci-match']?.id !== '199428706') missing.push('song pick')
      if (accountSync.syncStore.get().profile?.displayName !== 'CI PC') missing.push('profile')
      if (missing.length) throw new Error(`didn't arrive: ${missing.join(', ')}`)
      // the phone plays the PC's pick for that Spotify song, not one of its own
      const ci: Track = { uid: 'spotify:ci-match', source: 'spotify', id: 'ci-match', title: 'One More Time', artist: 'Daft Punk', album: 'Discovery', duration: 320 }
      const plays = await resolvePlan(ci, 'mid')
      if (plays.via?.id !== '199428706') throw new Error(`played ${plays.via?.source} ${plays.via?.id} instead of the PC's pick`)
      createPlaylist([], 'From iPhone (CI)')
      await accountSync.syncNow()
      await accountSync.logOut()
      if (soundcloud.syncedProfile()) throw new Error('log out kept the SoundCloud profile that came from the account')
      return "got the PC's playlist, look, history, SoundCloud, local song, song pick (and played it) and profile; sent a playlist back; log out removed the sign-in"
    })
  }

  await run('Equalizer solver', async () => {
    const bass = PRESETS.find((p) => /bass/i.test(p.name)) ?? PRESETS[1]
    const t0 = Date.now()
    const { filters, peakRiseDb } = eqFilters({ ...DEFAULT_MOBILE_SETTINGS.eq, enabled: true, preset: bass.name, gains: curveToBands(bass.curve, 7) })
    await NativeAudio.setEq(filters, peakRiseDb)
    await NativeAudio.setEq([], 0)
    return `${bass.name}: ${filters.length} filters, +${peakRiseDb.toFixed(1)} dB peak, solved in ${Date.now() - t0} ms`
  })

  await run('Cache', async () => {
    const e = yt ? lookup((yt as Track).uid) : null
    return e ? `YouTube song cached (${e.quality})` : 'nothing cached'
  })
}

export default function Diagnostics() {
  const c = useColors()
  const params = useLocalSearchParams<{ run?: string; crossEmail?: string; crossPassword?: string }>()
  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState(false)
  const started = useRef(false)

  const start = async () => {
    setRunning(true)
    setResults([])
    const all: Result[] = []
    const cross = params.crossEmail && params.crossPassword ? { email: params.crossEmail, password: params.crossPassword } : undefined
    await runAll((r) => {
      all.push(r)
      console.log(`[diag] ${r.ok ? 'PASS' : 'FAIL'} ${r.name} (${r.ms} ms): ${r.detail}`)
      setResults([...all])
    }, cross)
    const passed = all.filter((r) => r.ok).length
    console.log(`[diag] DONE ${passed}/${all.length}`)
    try {
      new File(dataDir, 'diagnostics.json').write(JSON.stringify({ at: new Date().toISOString(), passed, total: all.length, results: all }, null, 1))
    } catch {
      // only used by the automated test
    }
    setRunning(false)
  }

  useEffect(() => {
    if (params.run && !started.current) {
      started.current = true
      start()
    }
  }, [params.run])

  const passed = results.filter((r) => r.ok).length
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Diagnostics" right={<Button small title={running ? 'Running…' : 'Run'} busy={running} onPress={start} />} />
      <ScrollView contentContainerStyle={{ padding: ui.pad, gap: 10, paddingBottom: 160 }}>
        <Txt tone="text2" size={13}>
          Tests search, downloads, playback and lyrics on this phone. It downloads two songs (about 10 MB) and plays each for a moment.
        </Txt>
        {results.length ? (
          <Txt size={16} weight="800" testID="diag-summary">
            {running ? `Running… ${passed}/${results.length} passed` : `Done: ${passed}/${results.length} passed`}
          </Txt>
        ) : null}
        {results.map((r) => (
          <View key={r.name} style={{ flexDirection: 'row', gap: 10, backgroundColor: c.bg3, borderRadius: 8, padding: 10 }}>
            <Icon name={r.skipped ? 'remove-circle' : r.ok ? 'checkmark-circle' : 'close-circle'} size={20} color={r.skipped ? '#f5c542' : r.ok ? '#3ddc84' : '#ff5d6c'} />
            <View style={{ flex: 1 }}>
              <Txt weight="700">{`${r.name} · ${(r.ms / 1000).toFixed(1)} s`}</Txt>
              <Txt tone="text2" size={12}>
                {r.skipped ? r.detail : r.detail}
              </Txt>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
