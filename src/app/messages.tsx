import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useStore } from '../core/store'
import { AccountAvatar, shownName } from '../components/Profile'
import { SongCard } from '../components/SongCard'
import { Empty, ErrorText, Header, Spinner, Txt } from '../components/ui'
import { chatStore } from '../lib/chats'
import { chats as loadChats, friendsList, syncStore, type ShownProfile } from '../lib/sync'
import { useColors, ui } from '../lib/theme'

/** Messages: your conversations with friends (newest first), then friends you haven't messaged yet. */
export default function MessagesScreen() {
  const c = useColors()
  const loggedIn = useStore(syncStore, (s) => s.loggedIn)
  const pending = useStore(chatStore, (s) => s.pending)
  const [data, setData] = useState<Awaited<ReturnType<typeof loadChats>> | null>(null)
  const [friends, setFriends] = useState<ShownProfile[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loggedIn) return
    const load = () =>
      loadChats().then(
        (r) => {
          setData(r)
          setError(null)
          chatStore.set({ unread: r.unread })
        },
        (e) => setError(String((e as Error)?.message ?? e)),
      )
    void load()
    friendsList().then(setFriends, () => {})
    const t = setInterval(() => void load(), 10_000)
    return () => clearInterval(t)
  }, [loggedIn])

  const open = (handle: string) => router.push({ pathname: '/chat', params: { handle } })
  const talked = new Set(data?.chats.map((x) => x.user.handle))
  const others = friends.filter((f) => f.handle && !talked.has(f.handle))

  const row = (u: ShownProfile, sub: string, unread = 0) => (
    <Pressable
      key={u.handle}
      accessibilityRole="button"
      accessibilityLabel={`${shownName(u)}${unread ? `, ${unread} unread` : ''}`}
      onPress={() => open(u.handle!)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: ui.pad, paddingVertical: 10, backgroundColor: pressed ? c.bg3 : undefined })}
    >
      <AccountAvatar profile={u} size={46} />
      <View style={{ flex: 1 }}>
        <Txt size={16} weight="700" lines={1}>
          {shownName(u)}
        </Txt>
        <Txt size={13} tone={unread ? 'text' : 'text2'} weight={unread ? '700' : undefined} lines={1}>
          {sub}
        </Txt>
      </View>
      {unread ? (
        <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={12} weight="800" style={{ color: c.accentInk }}>
            {unread}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  )

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Messages" />
      {!loggedIn ? (
        <Empty icon="chatbubbles-outline" title="Messages" text="Log in to your Negusify account (Settings → Account) to message your friends." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
          {pending ? (
            <View style={{ margin: ui.pad, padding: 12, borderRadius: 14, backgroundColor: c.accentSoft, gap: 8 }}>
              <Txt tone="text2" size={13}>
                Pick a friend to send it to
              </Txt>
              <SongCard song={pending} onRemove={() => chatStore.set({ pending: null })} />
            </View>
          ) : null}
          {error ? <ErrorText text={error} /> : !data ? <Spinner /> : null}
          {data?.chats.map((x) => row(x.user, `${x.last.mine ? 'You: ' : ''}${x.last.text || (x.last.track ? `🎵 ${x.last.track.title}` : '')}`, x.unread))}
          {others.length ? (
            <Txt size={13} weight="700" tone="text3" style={{ paddingHorizontal: ui.pad, marginTop: 16, marginBottom: 4 }}>
              FRIENDS
            </Txt>
          ) : null}
          {others.map((f) => row(f, `@${f.handle}`))}
          {data && !data.chats.length && !others.length ? (
            <Empty icon="chatbubbles-outline" title="No one to message yet" text="Add friends on the desktop app's Friends page, then chat and share songs here." />
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}
