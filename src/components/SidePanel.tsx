import * as Haptics from 'expo-haptics'
import { router, type Href } from 'expo-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Dimensions, PanResponder, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createStore, useStore } from '../core/store'
import { ACCOUNT_SOURCES, accountStore } from '../lib/accounts'
import { libStore } from '../lib/library'
import { useLogo } from '../lib/logo'
import { SOURCES } from '../lib/sources'
import { syncStore } from '../lib/sync'
import { useColors, ui } from '../lib/theme'
import { AccountAvatar, shownName } from './Profile'
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
 * Swipe handlers for Home: a left-to-right drag pulls the panel out with the finger, and letting go
 * past a third (or flicking) opens it. Song rows claim their own swipes first (add to queue).
 */
export function useOpenPanelSwipe() {
  return useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
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
  const playlists = useStore(libStore, (s) => s.playlists)
  const accounts = useStore(accountStore, (s) => s.accounts)
  const logo = useLogo()
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
      <Animated.View {...closeSwipe} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width, backgroundColor: c.bg2, transform: [{ translateX }], paddingTop: insets.top + 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          onPress={() => go(st.loggedIn ? '/settings/account' : '/settings/account')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.line }}
        >
          {st.loggedIn && st.profile ? <AccountAvatar profile={st.profile} size={46} /> : <Image source={logo} style={{ width: 46, height: 46 }} />}
          <View style={{ flex: 1 }}>
            <Txt size={18} weight="800" lines={1}>
              {st.loggedIn ? shownName(st.profile) : 'ProjectM'}
            </Txt>
            <Txt tone="text2" size={13} lines={1}>
              {st.loggedIn ? (st.profile?.handle ? `@${st.profile.handle} · View profile` : 'View profile') : 'Log in or create an account'}
            </Txt>
          </View>
        </Pressable>
        <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 24 }}>
          <Item icon="home-outline" title="Home" onPress={() => tab('/')} />
          <Item icon="search-outline" title="Search" onPress={() => tab('/search')} />
          <Item icon="library-outline" title="Your Library" onPress={() => tab('/library')} />
          <Item icon="folder-outline" title="Local files" onPress={() => go('/local')} />
          <Item icon="time-outline" title="History" onPress={() => go('/history')} />
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
          <View style={{ height: 1, backgroundColor: c.line, marginVertical: 12, marginHorizontal: ui.pad }} />
          <Item icon="settings-outline" title="Settings" onPress={() => go('/settings')} />
        </ScrollView>
      </Animated.View>
    </View>
  )
}
