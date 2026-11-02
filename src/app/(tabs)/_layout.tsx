import { Ionicons } from '@expo/vector-icons'
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MiniPlayer } from '../../components/MiniPlayer'
import { usePlayer } from '../../lib/player'
import { useSettings } from '../../lib/settings'
import { fontFor, useColors } from '../../lib/theme'

const TABS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }> = {
  index: { label: 'Home', icon: 'home-outline', active: 'home' },
  search: { label: 'Search', icon: 'search-outline', active: 'search' },
  library: { label: 'Your Library', icon: 'library-outline', active: 'library' },
}

/** Classic look: playing bar + tab buttons, like Spotify's bottom bar. */
function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const c = useColors()
  return (
    <View style={{ backgroundColor: c.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingBottom: insets.bottom }}>
      <View style={{ paddingTop: 6 }}>
        <MiniPlayer />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {state.routes.map((route, i) => {
          const t = TABS[route.name]
          if (!t) return null
          const focused = state.index === i
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              testID={`tab-${route.name}`}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name)
              }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2 }}
            >
              <Ionicons name={focused ? t.active : t.icon} size={24} color={focused ? c.text : c.text2} />
              <Text style={{ fontSize: 11, color: focused ? c.text : c.text2, ...fontFor(c, focused ? '700' : '500') }}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** The playing bar inside iOS's tab bar accessory (full, or compact while the tab bar is minimized). */
function Accessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement()
  return <MiniPlayer variant="accessory" inline={placement === 'inline'} />
}

/** Native look: iOS's own Liquid Glass tab bar, with the playing bar in its accessory slot (like Apple Music). */
function GlassTabs() {
  const c = useColors()
  const hasTrack = usePlayer((s) => s.index >= 0 && !!s.queue[s.index])
  return (
    <NativeTabs tintColor={c.accent} minimizeBehavior="onScrollDown">
      {hasTrack ? (
        <NativeTabs.BottomAccessory>
          <Accessory />
        </NativeTabs.BottomAccessory>
      ) : null}
      <NativeTabs.Trigger name="index" testID="tab-index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search" testID="tab-search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library" testID="tab-library">
        <NativeTabs.Trigger.Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} />
        <NativeTabs.Trigger.Label>Your Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}

export default function TabsLayout() {
  const c = useColors()
  const { uiStyle } = useSettings()
  if (uiStyle === 'glass') return <GlassTabs />
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="library" />
    </Tabs>
  )
}
