import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import type { Track } from '../core/types'
import type { LeaderboardEntry } from '../core/account'
import { plural } from '../core/format'
import { useStore } from '../core/store'
import { AccountAvatar, shownName } from '../components/Profile'
import { Artwork, Button, Chip, Empty, ErrorText, Header, Spinner, Txt } from '../components/ui'
import { playTracks } from '../lib/player'
import { leaderboard, syncStore, userLeaderboard, type ShownProfile } from '../lib/sync'
import { useColors, ui } from '../lib/theme'
import { toast } from '../lib/ui'

/**
 * Leaderboards: the neguses who listened the most (today, this week, this month, this year or
 * ever), among everyone on the server or just your friends, with each one's most played songs.
 * Same as the desktop's Leaderboards page; people can hide themselves in Account -> Sharing.
 */

const PAGE = 10

export type Period = 'today' | 'week' | 'month' | 'year' | 'all'
export const PERIODS: [Period, string][] = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['year', 'This year'],
  ['all', 'All time'],
]

/** Start of the period in the phone's time (weeks start on Monday). */
export function periodStart(p: Period): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (p === 'today') return d.getTime()
  if (p === 'week') return d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (p === 'month') return d.setDate(1)
  if (p === 'year') return new Date(d.getFullYear(), 0, 1).getTime()
  return 0
}

/** "12 h 05 min", "45 min", "30 s" */
export function listenTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  if (m < 1) return `${Math.round(seconds)} s`
  const h = Math.floor(m / 60)
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
}

const errorText = (e: unknown) => String((e as Error)?.message ?? e)

type Board = Awaited<ReturnType<typeof leaderboard>>
type Song = LeaderboardEntry['topSongs'][number]

/** One of someone's top songs: tap plays it (their own files and Jellyfin songs: searches for it). */
export function TopSong({ song, width }: { song: Song; width?: number }) {
  const t = song.track
  const playable = !!(t.uid && t.source && t.id && t.source !== 'local' && t.source !== 'jellyfin')
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.title} by ${t.artist}`}
      onPress={() => (playable ? playTracks([t as Track], 0) : router.navigate({ pathname: '/search', params: { q: `${t.artist} ${t.title}` } }))}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width }}
    >
      <Artwork src={t.artwork} size={36} />
      <View style={{ flex: 1 }}>
        <Txt size={13} weight="600" lines={1}>
          {t.title}
        </Txt>
        <Txt size={12} tone="text2" lines={1}>
          {t.artist}
        </Txt>
      </View>
    </Pressable>
  )
}

const RANK_COLORS = ['#f5c542', '#c9d1d9', '#d08a4e']

function Row({ p, max }: { p: Board['people'][number]; max: number }) {
  const c = useColors()
  const u: ShownProfile = p.user
  return (
    <View style={{ paddingHorizontal: ui.pad, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: p.me ? c.accentSoft : undefined }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${p.rank}. ${shownName(u)}, ${listenTime(p.seconds)}`}
        onPress={() => u.handle && router.push({ pathname: '/person', params: { handle: u.handle } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <Txt size={18} weight="800" style={{ width: 30, textAlign: 'center', color: RANK_COLORS[p.rank - 1] ?? c.text3 }}>
          {p.rank}
        </Txt>
        <AccountAvatar profile={u} size={42} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt size={15} weight="700" lines={1} style={{ flexShrink: 1 }}>
              {shownName(u)}
            </Txt>
            {p.me ? (
              <View style={{ backgroundColor: c.accent, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Txt size={11} weight="700" style={{ color: c.accentInk }}>
                  You
                </Txt>
              </View>
            ) : null}
          </View>
          <View style={{ height: 4, borderRadius: 99, backgroundColor: c.bg3, marginTop: 6, overflow: 'hidden' }}>
            <View style={{ height: 4, borderRadius: 99, backgroundColor: c.accent, width: `${Math.max(3, (p.seconds / max) * 100)}%` }} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt size={14} weight="800">
            {listenTime(p.seconds)}
          </Txt>
          <Txt size={12} tone="text2">
            {plural(p.plays, 'play')}
          </Txt>
        </View>
      </Pressable>
      {p.topSongs.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingLeft: 42, marginTop: 10 }}>
          {p.topSongs.map((s, i) => (
            <TopSong key={i} song={s} width={170} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

export default function LeaderboardScreen() {
  const c = useColors()
  const loggedIn = useStore(syncStore, (s) => s.loggedIn)
  const [period, setPeriod] = useState<Period>('week')
  const [scope, setScope] = useState<'everyone' | 'friends'>('everyone')
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const shown = useRef(PAGE)

  useEffect(() => {
    if (!loggedIn) return
    let live = true
    setBoard(null)
    setError(null)
    shown.current = PAGE
    const load = () =>
      leaderboard(periodStart(period), scope, 0, Math.min(100, shown.current)).then(
        (b) => live && setBoard(b),
        (e) => live && setError(errorText(e)),
      )
    void load()
    const t = setInterval(() => void load(), 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [loggedIn, period, scope])

  const showMore = async () => {
    if (!board) return
    setMore(true)
    try {
      const next = await leaderboard(periodStart(period), scope, board.people.length, PAGE)
      shown.current = board.people.length + next.people.length
      setBoard({ ...next, people: [...board.people, ...next.people.filter((p) => p.rank > board.people.length)] })
    } catch (e) {
      toast(errorText(e))
    } finally {
      setMore(false)
    }
  }

  const max = board?.people[0]?.seconds || 1
  const meListed = board?.people.some((p) => p.me)
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Leaderboards" />
      {!loggedIn ? (
        <Empty icon="trophy-outline" title="Leaderboards" text="Log in to your Negusify account (Settings → Account) to see who listens the most." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: ui.pad, paddingVertical: 8 }}>
            {PERIODS.map(([p, label]) => (
              <Chip key={p} label={label} active={period === p} onPress={() => setPeriod(p)} />
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: ui.pad, paddingBottom: 8 }}>
            <Chip label="Everyone" active={scope === 'everyone'} onPress={() => setScope('everyone')} />
            <Chip label="Friends" active={scope === 'friends'} onPress={() => setScope('friends')} />
          </View>
          {error ? (
            <ErrorText text={error} />
          ) : !board ? (
            <Spinner />
          ) : board.people.length === 0 ? (
            <Empty icon="trophy-outline" title="Nobody yet" text={`No listening ${period === 'all' ? 'yet' : PERIODS.find((p) => p[0] === period)![1].toLowerCase()}.`} />
          ) : (
            <>
              {board.me && !meListed ? (
                <Txt tone="text2" style={{ paddingHorizontal: ui.pad, paddingBottom: 6 }}>
                  You're #{board.me.rank} of {board.total} with {listenTime(board.me.seconds)}.
                </Txt>
              ) : null}
              {board.people.map((p) => (
                <Row key={p.user.handle ?? p.rank} p={p} max={max} />
              ))}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: ui.pad }}>
                <Txt tone="text2" size={13}>
                  Top {board.people.length} of {board.total} {board.total === 1 ? 'negus' : 'neguses'}
                </Txt>
                {board.people.length < board.total ? <Button small kind="secondary" title={more ? 'Loading…' : 'Show more'} busy={more} onPress={() => void showMore()} /> : null}
              </View>
            </>
          )}
          <Txt tone="text3" size={12} style={{ paddingHorizontal: ui.pad, paddingTop: 6 }}>
            Listening time counts what you actually heard, on all your devices.
          </Txt>
        </ScrollView>
      )}
    </View>
  )
}

/** Someone's places on the leaderboard (their profile): this week, this month and all time, with their top songs this month. */
export function ProfileRanks({ handle }: { handle: string }) {
  const c = useColors()
  const periods: Period[] = ['week', 'month', 'all']
  const [ranks, setRanks] = useState<{ period: Period; r: Awaited<ReturnType<typeof userLeaderboard>> }[] | null>(null)
  useEffect(() => {
    let live = true
    setRanks(null)
    Promise.all(periods.map((period) => userLeaderboard(handle, periodStart(period)).then((r) => ({ period, r })))).then(
      (all) => live && setRanks(all),
      () => live && setRanks([]), // no leaderboards on this server yet: show nothing
    )
    return () => {
      live = false
    }
  }, [handle])
  if (!ranks?.length) return null
  const songs = ranks.find((x) => x.period === 'month')?.r.topSongs ?? []
  return (
    <View style={{ paddingHorizontal: ui.pad, paddingTop: 18 }}>
      <Txt size={18} weight="800" style={{ marginBottom: 10 }}>
        Leaderboards
      </Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {ranks.map(({ period, r }) => (
          <Pressable
            key={period}
            accessibilityRole="button"
            onPress={() => router.push('/leaderboard')}
            style={{ flex: 1, backgroundColor: c.bg3, borderRadius: 12, padding: 12 }}
          >
            <Txt size={22} weight="800">
              {r.place ? `#${r.place.rank}` : '—'}
            </Txt>
            <Txt size={12} tone="text2">
              {PERIODS.find((p) => p[0] === period)![1]}
            </Txt>
            <Txt size={12} tone="text2" lines={1}>
              {r.place ? listenTime(r.place.seconds) : 'Not ranked'}
            </Txt>
          </Pressable>
        ))}
      </View>
      {songs.length ? (
        <>
          <Txt size={13} tone="text2" style={{ marginTop: 14, marginBottom: 8 }}>
            Most played this month
          </Txt>
          <View style={{ gap: 10 }}>
            {songs.map((s, i) => (
              <TopSong key={i} song={s} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  )
}
