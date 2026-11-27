import { chatStore } from '../lib/chats'
import * as Haptics from 'expo-haptics'
import { router, type Href } from 'expo-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Dimensions, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createStore, useStore } from '../core/store'
import { ACCOUNT_SOURCES, accountStore } from '../lib/accounts'
import { libStore } from '../lib/library'
import { useLogo } from '../lib/logo'
import { SOURCES } from '../lib/sources'
import { syncStore } from '../lib/sync'
import { useColors, ui } from '../lib/theme'
import { AccountAvatar, shownName, StatusDot } from './Profile'
import { openStatusPicker, shownMine, STATUS_LABEL, useMyStatus } from '../lib/status'
import { Image } from 'expo-image'
import { Artwork, Icon, Txt, type IconName } from './ui'

/**
 * The side panel, like the Windows app's sidebar: swipe from left to right on Home to open it.
 * `progress` runs from 0 (closed) to 1 (open) and follows the finger while you swipe.
 */
const panelWidth = () => Math.min(340, Dimensions.get('window').width * 0.84)
export const panelProgress = new Animated.Value(0)
export const sidePanelStore = createStore<{ open: boolean }>({ open: false })

export function openSidePanel() {
  sidePanelStore.set({ open: true })
  Animated.spring(panelProgress, { toValue: 1, useNativeDriver: true, bounciness: 0, speed: 16 }).start()
}
export function closeSidePanel() {
  Animated.spring(panelProgress, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start(() => sidePanelStore.set({ open: false }))
}

/**
 * Home's left edge: a left-to-right drag that starts on this strip pulls the panel out with the
 * finger, and letting go past a third (or flicking) opens it. Only touches that start on the strip
 * count, so scrolling Home never opens it. (The handlers can't sit on the ScrollView itself: it
 * replaces the responder callbacks that reset and anchor the gesture, so the start position drifts.)
 */
export function PanelEdgeSwipe() {
  const handlers = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => sidePanelStore.set({ open: true }),
      onPanResponderMove: (_, g) => panelProgress.setValue(Math.max(0, Math.min(1, g.dx / panelWidth()))),
      onPanResponderRelease: (_, g) => {
        if (g.dx / panelWidth() > 0.33 || g.vx > 0.5) {
          Haptics.selectionAsync().catch(() => {})
          openSidePanel()
        } else closeSidePanel()
      },
      onPanResponderTerminate: () => closeSidePanel(),
    }),
  ).current.panHandlers
  // as wide as the page margin, so it never covers anything you'd tap
  return <View {...handlers} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: ui.pad }} />
}

function Item({ icon, art, title, sub, onPress }: { icon?: IconName; art?: ReactNode; title: string; sub?: string; onPress: () => void }) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: pressed ? c.hover : 'transparent', borderRadius: 10, marginHorizontal: 8 })}
    >
      {art ?? <Icon name={icon!} size={22} color={c.text} />}
      <View style={{ flex: 1 }}>
        <Txt size={16} weight="600" lines={1}>
          {title}
        </Txt>
        {sub ? (
          <Txt tone="text2" size={12} lines={1}>
            {sub}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  )
}

function Heading({ children }: { children: string }) {
  return (
    <Txt tone="text3" size={12} weight="800" style={{ paddingHorizontal: 26, marginTop: 18, marginBottom: 4, letterSpacing: 0.6 }}>
      {children.toUpperCase()}
    </Txt>
  )
}

/** The panel itself (rendered once, at the top of the app). */
export function SidePanel() {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const open = useStore(sidePanelStore, (s) => s.open)
  const st = useStore(syncStore, (s) => s)
  const myStatus = useMyStatus()
  const playlists = useStore(libStore, (s) => s.playlists)
  const accounts = useStore(accountStore, (s) => s.accounts)
  const unread = useStore(chatStore, (s) => s.unread)
  const logo = useLogo()
  const fruit = c.skin === 'fruitglass'
  const [width, setWidth] = useState(panelWidth())
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', () => setWidth(panelWidth()))
    return () => sub.remove()
  }, [])

  // swipe the panel back to the left to close it
  const closeSwipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => panelProgress.setValue(Math.max(0, Math.min(1, 1 + g.dx / panelWidth()))),
      onPanResponderRelease: (_, g) => (g.dx / panelWidth() < -0.3 || g.vx < -0.5 ? closeSidePanel() : openSidePanel()),
      onPanResponderTerminate: () => openSidePanel(),
    }),
  ).current.panHandlers

  if (!open) return null
  const go = (href: Href) => {
    closeSidePanel()
    setTimeout(() => router.push(href), 120)
  }
  const tab = (href: Href) => {
    closeSidePanel()
    router.navigate(href)
  }
  const liked = ACCOUNT_SOURCES.filter((s) => accounts[s]?.connected)
  const translateX = panelProgress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] })
  const dim = panelProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] })

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', opacity: dim }}>
        <Pressable accessibilityLabel="Close side panel" style={{ flex: 1 }} onPress={closeSidePanel} />
      </Animated.View>
      <Animated.View {...closeSwipe} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width, backgroundColor: fruit ? 'rgba(10,10,10,0.55)' : c.bg2, transform: [{ translateX }], paddingTop: insets.top + 6 }}>
        {/* FruitGlass: frosted glass, like the Windows app's sidebar */}
        {fruit ? <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} /> : null}
        {/* music, then social, then the app itself (like the Windows sidebar); your account sits at the bottom */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8, paddingBottom: 16 }}>
          <Item icon="home-outline" title="Home" onPress={() => tab('/')} />
          <Item icon="search-outline" title="Search" onPress={() => tab('/search')} />
          <Item icon="library-outline" title="Your Library" onPress={() => tab('/library')} />
          {accounts.jellyfin?.connected ? (
            <>
              <Item icon="musical-notes-outline" title="Tracks" onPress={() => go('/jellyfin/tracks')} />
              <Item icon="disc-outline" title="Albums" onPress={() => go('/jellyfin/albums')} />
              <Item icon="mic-outline" title="Artists" onPress={() => go('/jellyfin/artists')} />
            </>
          ) : null}
          <Item icon="arrow-down-circle-outline" title="Downloads" onPress={() => go('/downloads')} />
          <Item icon="folder-outline" title="Local files" onPress={() => go('/local')} />
          <Item icon="time-outline" title="History" onPress={() => go('/history')} />
          {st.loggedIn ? (
            <>
              <Heading>Social</Heading>
              <Item icon="chatbubbles-outline" title={unread ? `Messages (${unread})` : 'Messages'} onPress={() => go('/messages')} />
              <Item icon="trophy-outline" title="Leaderboards" onPress={() => go('/leaderboard')} />
            </>
          ) : null}
          <Heading>App</Heading>
          {accounts.jellyfin?.connected ? <Item icon="server-outline" title="Servers" onPress={() => go('/settings/servers')} /> : null}
          <Item icon="settings-outline" title="Settings" onPress={() => go('/settings')} />
          {playlists.length ? (
            <>
              <Heading>Playlists</Heading>
              {playlists.map((p) => (
                <Item
                  key={p.id}
                  art={<Artwork src={p.cover ?? p.tracks[0]?.artwork} size={32} radius={5} />}
                  title={p.name}
                  sub={`${p.tracks.length} songs`}
                  onPress={() => go({ pathname: '/playlist/[id]', params: { id: p.id } })}
                />
              ))}
            </>
          ) : null}
          {liked.length ? (
            <>
              <Heading>Liked Songs</Heading>
              {liked.map((s) => (
                <Item
                  key={s}
                  art={
                    <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: SOURCES[s].color, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="heart" size={16} color="#fff" />
                    </View>
                  }
                  title={SOURCES[s].name}
                  onPress={() => go({ pathname: '/liked/[source]', params: { source: s } })}
                />
              ))}
            </>
          ) : null}
        </ScrollView>
        {/* your account, pinned at the bottom: tap for your profile, tap the status for the status picker */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginTop: 4, marginBottom: insets.bottom + 10, padding: 8, borderRadius: 12, backgroundColor: fruit ? 'rgba(255,255,255,0.07)' : c.bg3 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            onPress={() => go('/settings/account')}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            {st.loggedIn && st.profile ? <AccountAvatar profile={st.profile} size={40} status={shownMine(myStatus)} ring={fruit ? '#1a1a1a' : c.bg3} /> : <Image source={logo} style={{ width: 40, height: 40 }} />}
            <View style={{ flex: 1 }}>
              <Txt size={15} weight="700" lines={1}>
                {st.loggedIn ? shownName(st.profile) : 'Account'}
              </Txt>
              <Txt tone="text2" size={12} lines={1}>
                {st.loggedIn ? (st.profile?.handle ? `@${st.profile.handle}` : 'View profile') : 'Not logged in'}
              </Txt>
            </View>
          </Pressable>
          {st.loggedIn && myStatus ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Status: ${STATUS_LABEL[myStatus]}. Change`}
              onPress={openStatusPicker}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: pressed ? c.bg4 : 'rgba(255,255,255,0.06)' })}
            >
              <StatusDot status={shownMine(myStatus)!} size={10} ring="transparent" />
              <Txt size={12} weight="600">
                {STATUS_LABEL[myStatus]}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  )
}
