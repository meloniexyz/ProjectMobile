import { Ionicons } from '@expo/vector-icons'
import { File } from 'expo-file-system'
import { router } from 'expo-router'
import { Pressable, ScrollView, View } from 'react-native'
import { Txt } from '../components/ui'
import { setMode, MODES, type AppMode } from '../lib/mode'
import { useSettings } from '../lib/settings'
import { SOURCES } from '../lib/sources'
import { useColors, ui } from '../lib/theme'
import { dataDir } from '../lib/storage'
import { syncStore } from '../lib/sync'

/** First start (and Settings → Mode): Streaming, or Full with a Jellyfin server. */
export default function ModeScreen() {
  const c = useColors()
  const s = useSettings()
  const pick = (m: AppMode) => {
    const first = s.mode === null
    setMode(m)
    if (router.canGoBack()) router.back()
    if (!first) return
    const asked = new File(dataDir, 'account-asked')
    // Full on first start: straight on to the servers (which offers the account, where servers come from)
    if (m === 'full') {
      asked.create({ overwrite: true })
      setTimeout(() => router.push('/settings/servers'), 400)
      return
    }
    // first launch: offer to log in or create a Negusify account, once (Back skips it)
    if (asked.exists || syncStore.get().loggedIn) return
    asked.create({ overwrite: true })
    setTimeout(() => router.push('/settings/account'), 400)
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: ui.pad, paddingTop: 72, gap: 14 }}>
        <Txt size={28} weight="800">
          How do you want to use Negusify?
        </Txt>
        <Txt tone="text2" size={15}>
          You can change this any time in Settings. Your playlists, account and settings stay either way.
        </Txt>
        {MODES.map((m) => (
          <Pressable
            key={m.id}
            testID={`mode-${m.id}`}
            accessibilityRole="button"
            accessibilityLabel={m.title}
            onPress={() => pick(m.id)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? c.bg4 : c.bg3,
              borderRadius: 14,
              padding: 16,
              gap: 8,
              borderWidth: 2,
              borderColor: s.mode === m.id ? c.accent : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {(['youtube', 'soundcloud', 'spotify'] as const).map((id) => (
                <View key={id} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: SOURCES[id].color }} />
              ))}
              {m.id === 'full' ? <Ionicons name="server-outline" size={16} color={SOURCES.jellyfin.color} /> : null}
            </View>
            <Txt size={20} weight="800">
              {m.title}
            </Txt>
            <Txt tone="text2" size={14}>
              {m.text}
            </Txt>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}
