import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'
import { useStore } from '../core/store'
import { defaultProfileColor, inkOn } from '../core/profile-colors'
import { handleAvailable, searchPeople, syncStore, type ShownProfile } from '../lib/sync'
import { alpha, useColors, ui } from '../lib/theme'
import { Button, Empty, ErrorText, Icon, Spinner, Txt } from './ui'

export const HANDLE_RULES = '3-20 letters, numbers, _ or . (no dot at the start or end)'

/** Same rules as the server (core/account.ts cleanHandle). */
export const cleanHandle = (raw: string) => {
  const h = raw.trim().replace(/^@/, '').toLowerCase()
  return /^[a-z0-9_.]{3,20}$/.test(h) && !h.startsWith('.') && !h.endsWith('.') && !h.includes('..') ? h : null
}

/** What a profile shows as the name: the display name, else the @handle. Never the email (that stays private). */
export const shownName = (p: Pick<ShownProfile, 'displayName' | 'handle'> | undefined) => p?.displayName || (p?.handle ? `@${p.handle}` : 'Account')

const memberSince = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** c********@gmail.com: the email stays private unless you tap Show (account settings only). */
export const maskEmail = (email: string) => {
  const at = email.lastIndexOf('@')
  return at < 1 ? '*'.repeat(8) : `${email[0]}${'*'.repeat(Math.min(8, Math.max(4, at - 1)))}${email.slice(at)}`
}

/** Profile photo, or (like Discord) the first letter of the name on the profile's own solid colour, or a person outline. */
export function AccountAvatar({ profile, size = 32 }: { profile?: Pick<ShownProfile, 'avatar' | 'displayName' | 'handle'>; size?: number }) {
  const c = useColors()
  if (profile?.avatar) return <Image source={{ uri: profile.avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  const letter = (profile?.displayName || profile?.handle || '')[0]
  if (!letter) return <Icon name="person-circle-outline" size={size} color={c.text} />
  const bg = defaultProfileColor(profile?.handle || profile?.displayName)
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={size * 0.45} weight="800" style={{ color: inkOn(bg) }}>
        {letter.toUpperCase()}
      </Txt>
    </View>
  )
}

/**
 * A profile like Discord's: banner (picture, else a solid colour), photo overlapping it, then the
 * name panel. Two profile colours run down the whole card.
 */
export function ProfileCard({ profile: p, actions }: { profile: ShownProfile; actions?: ReactNode }) {
  const c = useColors()
  const themed = !!p.colors
  const bannerColor = p.colors?.[0] ?? defaultProfileColor(p.handle || p.displayName)
  const body = (
    <>
      {p.banner ? (
        <Image source={{ uri: p.banner }} style={{ width: '100%', aspectRatio: 5 / 2, borderTopLeftRadius: themed ? 12 : 0, borderTopRightRadius: themed ? 12 : 0 }} contentFit="cover" />
      ) : (
        <View style={{ width: '100%', aspectRatio: 5 / 2, backgroundColor: bannerColor, borderTopLeftRadius: themed ? 12 : 0, borderTopRightRadius: themed ? 12 : 0 }} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 14, marginTop: -46 }}>
        <View style={{ padding: 5, borderRadius: 50, backgroundColor: themed ? alpha(p.colors![0], 0.55) : c.bg2 }}>
          <AccountAvatar profile={p} size={82} />
        </View>
        {actions ? <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>{actions}</View> : null}
      </View>
      <View style={{ margin: 12, marginTop: 10, padding: 14, borderRadius: 10, backgroundColor: themed ? 'rgba(0,0,0,0.42)' : c.bg3 }}>
        <Txt size={22} weight="800">
          {shownName(p)}
        </Txt>
        {p.handle ? (
          <Txt tone="text2" size={14} style={{ marginTop: 2 }}>
            @{p.handle}
          </Txt>
        ) : null}
        {p.bio || p.memberSince ? <View style={{ height: 1, backgroundColor: c.line, marginVertical: 12 }} /> : null}
        {p.bio ? (
          <View style={{ marginBottom: 10 }}>
            <Txt size={11} weight="800" tone="text2" style={{ letterSpacing: 0.6, marginBottom: 3 }}>
              ABOUT ME
            </Txt>
            <Txt size={14}>{p.bio}</Txt>
          </View>
        ) : null}
        {p.memberSince ? (
          <View>
            <Txt size={11} weight="800" tone="text2" style={{ letterSpacing: 0.6, marginBottom: 3 }}>
              MEMBER SINCE
            </Txt>
            <Txt size={14}>{memberSince(p.memberSince)}</Txt>
          </View>
        ) : null}
      </View>
    </>
  )
  return themed ? (
    <LinearGradient colors={[p.colors![0], p.colors![1]]} style={{ marginHorizontal: ui.pad, marginTop: 14, borderRadius: 16, padding: 4, overflow: 'hidden' }}>
      {body}
    </LinearGradient>
  ) : (
    <View style={{ marginHorizontal: ui.pad, marginTop: 14, borderRadius: 16, backgroundColor: c.bg2, overflow: 'hidden' }}>{body}</View>
  )
}

/**
 * The @username box: checks the rules as you type and asks the server whether it's free.
 * `onValid` gets the clean handle when it's usable, null otherwise.
 */
export function HandleInput({ value, onChange, onValid, current, testID }: { value: string; onChange: (v: string) => void; onValid: (h: string | null) => void; current?: string | null; testID?: string }) {
  const c = useColors()
  const [state, setState] = useState<{ text: string; ok: boolean } | null>(null)
  useEffect(() => {
    const h = cleanHandle(value)
    onValid(null)
    if (!value.trim()) return setState(null)
    if (!h) return setState({ text: HANDLE_RULES, ok: false })
    if (h === current) {
      onValid(h)
      return setState({ text: "That's your username", ok: true })
    }
    setState({ text: 'Checking…', ok: false })
    let live = true
    const t = setTimeout(() => {
      handleAvailable(h).then(
        (r) => {
          if (!live) return
          setState(r.available ? { text: `@${h} is free`, ok: true } : { text: r.reason === 'taken' ? `@${h} is taken` : HANDLE_RULES, ok: false })
          onValid(r.available ? h : null)
        },
        () => live && setState({ text: "Couldn't check right now", ok: false }),
      )
    }, 400)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [value, current])
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} weight="600" tone="text2">
        Username
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg4, borderRadius: 8, paddingLeft: 12 }}>
        <Txt tone="text3" weight="700">
          @
        </Txt>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={(v) => onChange(v.replace(/\s/g, '').toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={21}
          style={{ flex: 1, color: c.text, paddingHorizontal: 4, paddingVertical: 11, fontSize: 16 }}
        />
      </View>
      {state ? (
        <Txt size={12} style={{ color: state.ok ? '#3ddc84' : state.text === 'Checking…' ? c.text3 : '#ff5d6c' }}>
          {state.text}
        </Txt>
      ) : null}
    </View>
  )
}

/** Search → ProjectM: people by @username or name. */
export function PeopleResults({ query }: { query: string }) {
  const c = useColors()
  const st = useStore(syncStore, (s) => s)
  const [state, setState] = useState<{ loading: boolean; people: ShownProfile[]; error?: string }>({ loading: false, people: [] })
  useEffect(() => {
    if (!query || !st.loggedIn) return setState({ loading: false, people: [] })
    let live = true
    setState((s) => ({ ...s, loading: true, error: undefined }))
    searchPeople(query).then(
      (people) => live && setState({ loading: false, people }),
      (e) => live && setState({ loading: false, people: [], error: String((e as Error)?.message ?? e) }),
    )
    return () => {
      live = false
    }
  }, [query, st.loggedIn])
  if (!st.loggedIn)
    return (
      <Empty
        icon="people-outline"
        title="Log in to find people"
        text="People on ProjectM can be found by their @username once you have a ProjectM account."
        action={<Button title="Log in" onPress={() => router.push('/settings/account')} />}
      />
    )
  if (!query) return <Empty icon="people-outline" title="Find people on ProjectM" text="Search by @username or name." />
  if (state.error) return <ErrorText text={state.error} />
  if (state.loading && !state.people.length) return <Spinner />
  if (!state.people.length) return <Empty icon="search-outline" title={`No one called "${query}"`} text="Check the spelling of the @username." />
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
      {state.people.map((u) => (
        <Pressable
          key={u.handle}
          accessibilityRole="button"
          accessibilityLabel={`${shownName(u)} @${u.handle}`}
          onPress={() => router.push({ pathname: '/person', params: { handle: u.handle! } })}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: ui.pad, paddingVertical: 9, backgroundColor: pressed ? c.hover : 'transparent' })}
        >
          <AccountAvatar profile={u} size={50} />
          <View style={{ flex: 1 }}>
            <Txt weight="700" lines={1}>
              {shownName(u)}
            </Txt>
            <Txt tone="text2" size={13} lines={1}>
              @{u.handle}
            </Txt>
          </View>
          {u.handle === st.profile?.handle ? (
            <Txt tone="text3" size={12} weight="700">
              YOU
            </Txt>
          ) : (
            <Icon name="chevron-forward" size={18} color={c.text3} />
          )}
        </Pressable>
      ))}
    </ScrollView>
  )
}
