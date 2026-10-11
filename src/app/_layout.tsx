import '../lib/polyfills'
import { File } from 'expo-file-system'
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router'
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
import { useColors } from '../lib/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})
boot()

export default function RootLayout() {
  const c = useColors()
  const navTheme = useMemo(
    () => ({ ...DarkTheme, colors: { ...DarkTheme.colors, background: c.bg, card: c.bg, text: c.text, border: c.line, primary: c.accent } }),
    [c],
  )
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
    // automated test hook: the CI drops this file into the app's data folder before launch
    const trigger = new File(dataDir, 'run-diagnostics')
    if (trigger.exists) {
      trigger.delete()
      setTimeout(() => router.push({ pathname: '/settings/diagnostics', params: { run: '1' } }), 1500)
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
