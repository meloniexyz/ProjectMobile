import '../lib/polyfills'
import { File } from 'expo-file-system'
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { Image } from 'expo-image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PageWithPlayingBar } from '../components/GlobalPlayingBar'
import { SheetHost } from '../components/Overlays'
import { boot } from '../lib/boot'
import { BotGuardHost } from '../lib/sources/botguard'
import { dataDir } from '../lib/storage'
import { syncStore } from '../lib/sync'
import { offerUpdate } from '../lib/update'
import { useColors } from '../lib/theme'
import { useLogo } from '../lib/logo'

SplashScreen.preventAutoHideAsync().catch(() => {})
boot()

/**
 * The launch screen: iOS's own (built into the app, so it can't follow your settings) is plain black;
 * this shows the logo you picked, in your colour, while the app starts, then fades away.
 */
function LaunchLogo() {
  const logo = useLogo()
  const fade = useRef(new Animated.Value(1)).current
  const [done, setDone] = useState(false)
  useEffect(() => {
    Animated.timing(fade, { toValue: 0, duration: 260, delay: 650, useNativeDriver: true }).start(() => setDone(true))
  }, [])
  if (done) return null
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', opacity: fade }}>
      <Image source={logo} style={{ width: 120, height: 120 }} accessibilityLabel="ProjectM" />
    </Animated.View>
  )
}

/** An account from before usernames: ask for one, once per launch. */
function usePickHandlePrompt() {
  useEffect(() => {
    let asked = false
    const check = () => {
      const st = syncStore.get()
      if (asked || !st.loggedIn || !st.profile || st.profile.handle) return
      asked = true
      setTimeout(() => router.push({ pathname: '/settings/profile', params: { pick: '1' } }), 800)
    }
    check()
    return syncStore.subscribe(check)
  }, [])
}

export default function RootLayout() {
  const c = useColors()
  // Inter for the Feishin theme; until it loads, text falls back to the system font
  useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold })
  const navTheme = useMemo(
    () => ({ ...DarkTheme, colors: { ...DarkTheme.colors, background: c.bg, card: c.bg, text: c.text, border: c.line, primary: c.accent } }),
    [c],
  )
  usePickHandlePrompt()
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
    // automated test hook: the CI drops this file into the app's data folder before launch
    const trigger = new File(dataDir, 'run-diagnostics')
    if (trigger.exists) {
      // may carry a test account made by the CI with the PC's account code
      let cross: { email?: string; password?: string } = {}
      try {
        cross = JSON.parse(trigger.textSync() || '{}')
      } catch {
        // plain trigger
      }
      trigger.delete()
      const params = { run: '1', ...(cross.email && cross.password ? { crossEmail: cross.email, crossPassword: cross.password } : {}) }
      setTimeout(() => router.push({ pathname: '/settings/diagnostics', params }), 1500)
      return
    }
    // every start: offer a newer version if GitHub has one
    const update = setTimeout(offerUpdate, 2500)
    // first launch: offer to log in or create a ProjectM account, once (Back skips it)
    const asked = new File(dataDir, 'account-asked')
    if (asked.exists) return () => clearTimeout(update)
    const t = setTimeout(() => {
      asked.create({ overwrite: true })
      if (!syncStore.get().loggedIn) router.push('/settings/account')
    }, 1200)
    return () => {
      clearTimeout(t)
      clearTimeout(update)
    }
  }, [])
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          <Stack
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}
            screenLayout={({ children, route }) => <PageWithPlayingBar route={route.name}>{children}</PageWithPlayingBar>}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="queue" options={{ presentation: 'modal' }} />
            <Stack.Screen name="spotify-login" options={{ presentation: 'modal' }} />
          </Stack>
          <BotGuardHost />
          <SheetHost />
          <LaunchLogo />
          <StatusBar style="light" />
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
