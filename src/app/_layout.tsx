import '../lib/polyfills'
import { File } from 'expo-file-system'
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GlobalPlayingBar } from '../components/GlobalPlayingBar'
import { SaveSheet, Toasts, TrackSheet } from '../components/Overlays'
import { boot } from '../lib/boot'
import { BotGuardHost } from '../lib/sources/botguard'
import { dataDir } from '../lib/storage'
import { syncStore } from '../lib/sync'
import { offerUpdate } from '../lib/update'
import { useColors } from '../lib/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})
boot()

export default function RootLayout() {
  const c = useColors()
  // Inter for the Feishin theme; until it loads, text falls back to the system font
  useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold })
  const navTheme = useMemo(
    () => ({ ...DarkTheme, colors: { ...DarkTheme.colors, background: c.bg, card: c.bg, text: c.text, border: c.line, primary: c.accent } }),
    [c],
  )
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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="queue" options={{ presentation: 'modal' }} />
            <Stack.Screen name="spotify-login" options={{ presentation: 'modal' }} />
          </Stack>
          <GlobalPlayingBar />
          <BotGuardHost />
          <TrackSheet />
          <SaveSheet />
          <Toasts />
          <StatusBar style="light" />
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
