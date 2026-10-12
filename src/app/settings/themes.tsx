import { isLiquidGlassAvailable } from 'expo-glass-effect'
import { Image } from 'expo-image'
import { Pressable, ScrollView, View } from 'react-native'
import { LOGO_VARIANTS, logoColor, logoImage } from '../../lib/logo'
import { Header, Icon, Txt } from '../../components/ui'
import { updateSettings, useSettings } from '../../lib/settings'
import { ACCENT_SWATCHES, THEMES, useColors, ui } from '../../lib/theme'

export default function Themes() {
  const c = useColors()
  const s = useSettings()
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Themes" />
      <ScrollView contentContainerStyle={{ padding: ui.pad, paddingBottom: 160, gap: 18 }}>
        <View>
          <Txt size={16} weight="800">
            Interface
          </Txt>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            {(
              [
                { id: 'classic', title: 'Classic', sub: "ProjectM's own dark look, like the desktop app", icon: 'albums-outline' },
                { id: 'glass', title: 'Liquid Glass', sub: 'Native iOS: glass tab bar, floating playing bar and glass sheets', icon: 'water-outline' },
              ] as const
            ).map((o) => {
              const on = s.uiStyle === o.id
              return (
                <Pressable
                  key={o.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Interface ${o.title}`}
                  testID={`ui-${o.id}`}
                  onPress={() => updateSettings({ uiStyle: o.id })}
                  style={{ flex: 1, borderRadius: 12, padding: 12, gap: 6, backgroundColor: c.bg3, borderWidth: 2, borderColor: on ? c.accent : 'transparent' }}
                >
                  <Icon name={o.icon} size={22} color={on ? c.accent : c.text2} />
                  <Txt size={15} weight="800">
                    {o.title}
                  </Txt>
                  <Txt tone="text2" size={12}>
                    {o.sub}
                  </Txt>
                </Pressable>
              )
            })}
          </View>
          {s.uiStyle === 'glass' && !isLiquidGlassAvailable() ? (
            <Txt tone="text3" size={12} style={{ marginTop: 8 }}>
              Liquid Glass needs iOS 26 or later; on older versions the native tab bar is used without the glass effect.
            </Txt>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {THEMES.map((t) => {
            const on = s.theme === t.id
            const accent = s.accent ?? t.accent
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`Theme ${t.name}`}
                onPress={() => updateSettings({ theme: t.id })}
                style={{ width: '31%', borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: on ? accent : c.line2 }}
              >
                <View style={{ height: 70, backgroundColor: t.bg, padding: 8, gap: 5 }}>
                  <View style={{ height: 8, width: '70%', borderRadius: 4, backgroundColor: t.bg3 }} />
                  <View style={{ height: 8, width: '45%', borderRadius: 4, backgroundColor: t.bg4 }} />
                  <View style={{ height: 14, width: 14, borderRadius: 7, backgroundColor: accent, marginTop: 'auto' }} />
                </View>
                <View style={{ backgroundColor: t.bg2, paddingVertical: 6, paddingHorizontal: 8 }}>
                  <Txt size={12} weight="700" lines={1} style={{ color: t.text }}>
                    {t.name}
                  </Txt>
                </View>
              </Pressable>
            )
          })}
        </View>
        <View>
          <Txt size={16} weight="800">
            Logo
          </Txt>
          <Txt tone="text2" size={13} style={{ marginTop: 4 }}>
            Your home screen icon and the logo in the app. It takes your accent colour (pick it below); iOS shows a short notice when the icon changes.
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            {LOGO_VARIANTS.map((v) => {
              const on = s.logo === v.id
              return (
                <Pressable
                  key={v.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Logo ${v.name}`}
                  testID={`logo-${v.id}`}
                  onPress={() => updateSettings({ logo: v.id })}
                  style={{ width: '31%', alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: c.bg3, borderWidth: 2, borderColor: on ? c.accent : 'transparent' }}
                >
                  <Image source={logoImage(logoColor(s.theme, s.accent), v.id)} style={{ width: 56, height: 56 }} />
                  <Txt size={12} tone={on ? 'text' : 'text2'}>
                    {v.name}
                  </Txt>
                </Pressable>
              )
            })}
          </View>
        </View>
        <View>
          <Txt size={16} weight="800">
            Accent colour
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Theme's own accent"
              onPress={() => updateSettings({ accent: null })}
              style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: s.accent ? c.line2 : c.text, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="refresh" size={18} color={c.text2} />
            </Pressable>
            {ACCENT_SWATCHES.map((col) => (
              <Pressable
                key={col}
                accessibilityRole="button"
                accessibilityLabel={`Accent ${col}`}
                onPress={() => updateSettings({ accent: col })}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: col, borderWidth: 3, borderColor: s.accent === col ? c.text : 'transparent' }}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
