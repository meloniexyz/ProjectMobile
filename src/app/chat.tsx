import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ChatMessage } from '../core/account'
import { useStore } from '../core/store'
import { SongCard } from '../components/SongCard'
import { ErrorText, Header, Icon, IconButton, Spinner, Txt } from '../components/ui'
import { chatStore, refreshUnread } from '../lib/chats'
import { chat, sendMessage } from '../lib/sync'
import { useColors, ui } from '../lib/theme'
import { toast } from '../lib/ui'

function time(at: number) {
  const d = new Date(at)
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return new Date().toDateString() === d.toDateString() ? t : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${t}`
}

/** One conversation: messages and shared songs, new ones every few seconds while it's open. */
export default function ChatScreen() {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const { handle } = useLocalSearchParams<{ handle: string }>()
  const pending = useStore(chatStore, (s) => s.pending)
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [more, setMore] = useState(false)
  const [isFriend, setIsFriend] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroll = useRef<ScrollView>(null)
  const last = useRef(0)

  useEffect(() => {
    let live = true
    chat(handle).then(
      (r) => {
        if (!live) return
        setMessages(r.messages)
        setMore(r.more)
        setIsFriend(r.friends)
        last.current = r.messages.at(-1)?.id ?? 0
        refreshUnread()
      },
      (e) => live && setError(String((e as Error)?.message ?? e)),
    )
    const t = setInterval(() => {
      chat(handle, { after: last.current }).then(
        (r) => {
          if (!live || !r.messages.length) return
          last.current = r.messages.at(-1)!.id
          setMessages((m) => [...(m ?? []), ...r.messages.filter((x) => !(m ?? []).some((y) => y.id === x.id))])
        },
        () => {},
      )
    }, 4000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [handle])

  const older = async () => {
    if (!messages?.length) return
    const r = await chat(handle, { before: messages[0].id }).catch(() => null)
    if (r) {
      setMessages([...r.messages, ...messages])
      setMore(r.more)
    }
  }

  const send = async () => {
    const body = text.trim()
    if ((!body && !pending) || sending) return
    setSending(true)
    try {
      const m = await sendMessage(handle, { text: body || undefined, track: pending ?? undefined })
      last.current = Math.max(last.current, m.id)
      setMessages((ms) => [...(ms ?? []), m])
      setText('')
      chatStore.set({ pending: null })
    } catch (e) {
      toast(String((e as Error)?.message ?? e))
    } finally {
      setSending(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={`@${handle}`} right={<IconButton name="person-circle-outline" size={26} label="Open their profile" onPress={() => router.push({ pathname: '/person', params: { handle } })} />} />
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ padding: ui.pad, gap: 10 }}>
        {more ? (
          <Pressable onPress={() => void older()} style={{ alignSelf: 'center', padding: 8 }}>
            <Txt tone="text2" size={13}>
              Older messages
            </Txt>
          </Pressable>
        ) : null}
        {error ? <ErrorText text={error} /> : !messages ? <Spinner /> : null}
        {messages && !messages.length ? (
          <Txt tone="text2" style={{ textAlign: 'center', padding: 16 }}>
            Say hi, or share a song.
          </Txt>
        ) : null}
        {messages?.map((m) => (
          <View key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', alignItems: m.mine ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: 4 }}>
            {m.track ? <SongCard song={m.track} /> : null}
            {m.text ? (
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: m.mine ? c.accent : c.bg3 }}>
                <Txt size={15} style={{ color: m.mine ? c.accentInk : c.text }}>
                  {m.text}
                </Txt>
              </View>
            ) : null}
            <Txt size={11} tone="text3">
              {time(m.at)}
              {m.mine && m.read ? ' · Seen' : ''}
            </Txt>
          </View>
        ))}
      </ScrollView>
      {isFriend ? (
        <View style={{ paddingHorizontal: ui.pad, paddingTop: 8, paddingBottom: insets.bottom + 8, gap: 8, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg }}>
          {pending ? <SongCard song={pending} onRemove={() => chatStore.set({ pending: null })} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={pending ? 'Add a message (optional)' : 'Message'}
              placeholderTextColor={c.text3}
              multiline
              maxLength={2000}
              style={{ flex: 1, color: c.text, fontSize: 16, backgroundColor: c.bg3, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, maxHeight: 120 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={sending || (!text.trim() && !pending)}
              onPress={() => void send()}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: sending || (!text.trim() && !pending) ? 0.4 : 1 }}
            >
              <Icon name="send" size={18} color={c.accentInk} />
            </Pressable>
          </View>
        </View>
      ) : (
        <Txt tone="text2" style={{ textAlign: 'center', padding: 16, paddingBottom: insets.bottom + 16 }}>
          You can only message your friends.
        </Txt>
      )}
    </KeyboardAvoidingView>
  )
}
