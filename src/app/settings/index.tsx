import { appVersion, offerUpdate } from '../../lib/update'
import { router } from 'expo-router'
import { Alert, ScrollView, Switch, View } from 'react-native'
import { useStore } from '../../core/store'
import { Chip, Divider, Header, Row, Txt } from '../../components/ui'
import { syncStore } from '../../lib/sync'
import { useLogo } from '../../lib/logo'
import { Image } from 'expo-image'
import { accountStore } from '../../lib/accounts'
import { clearHistory } from '../../lib/history'
import { refreshLocalVisibility } from '../../lib/library'
import { updateSettings, useSettings, type Quality } from '../../lib/settings'
import { SOURCES } from '../../lib/sources'
import { THEMES, useColors, ui } from '../../lib/theme'

const QUALITY_LABEL: Record<Quality, string> = { low: 'Low', mid: 'Mid', best: 'Best' }

function Group({ title }: { title: string }) {
  return (
    <Txt tone="text2" size={13} weight="800" style={{ paddingHorizontal: ui.pad, marginTop: 24, marginBottom: 4 }}>
      {title.toUpperCase()}
    </Txt>
  )
}

export default function Settings() {
  const c = useColors()
  const s = useSettings()
  const accounts = useStore(accountStore, (st) => st.accounts)
  const sw = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: c.accent }} />
  )
  const accountSub = (id: 'youtube' | 'soundcloud' | 'spotify') => {
    const a = accounts[id]
    return a?.connected ? `Connected${a.userName ? ` as ${a.userName}` : ''}` : 'Not connected'
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Settings" />
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        <Group title="Accounts" />
        {(['spotify', 'youtube', 'soundcloud'] as const).map((id) => (
          <Row
            key={id}
            title={SOURCES[id].name}
            sub={accountSub(id)}
            left={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SOURCES[id].color, marginHorizontal: 6 }} />}
            onPress={() => router.push({ pathname: '/settings/accounts', params: { focus: id } })}
            chevron
          />
        ))}

        <SyncSettingsRow />

        <Group title="Audio quality" />
        <Row
          title="Streaming and downloads"
          sub={`Wi-Fi: ${QUALITY_LABEL[s.wifiQuality]} · Mobile data: ${QUALITY_LABEL[s.cellularQuality]} · Downloads: ${QUALITY_LABEL[s.downloadQuality]}`}
          icon="pulse-outline"
          onPress={() => router.push('/settings/quality')}
          chevron
          testID="settings-quality"
        />

        <Group title="Data saving and storage" />
        <Row
          title="Offline mode"
          sub="Only play what's downloaded. No mobile data is used for music."
          icon="airplane-outline"
          right={sw(s.offlineMode, (v) => updateSettings({ offlineMode: v }), 'Offline mode')}
        />
        <Row title="Downloads and storage" sub="Cache size, downloaded songs, clear storage" icon="folder-outline" onPress={() => router.push('/settings/storage')} chevron />

        <Group title="Playback" />
        <Row
          title="Volume leveling"
          sub="Every song, from every platform, plays at the same loudness"
          icon="options-outline"
          right={sw(s.normalize, (v) => updateSettings({ normalize: v }), 'Volume leveling')}
        />
        {s.normalize ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: ui.pad, paddingLeft: 50, paddingBottom: 8 }}>
            {(['quiet', 'normal', 'loud'] as const).map((l) => (
              <Chip key={l} label={l[0].toUpperCase() + l.slice(1)} active={s.loudnessLevel === l} onPress={() => updateSettings({ loudnessLevel: l })} />
            ))}
          </View>
        ) : null}
        <Row title="Equalizer" sub={s.eq.enabled ? `On · ${s.eq.preset}` : 'Off'} icon="stats-chart-outline" onPress={() => router.push('/settings/eq')} chevron />
        <Row title="Spotify songs play from" sub="Phones can't play Spotify inside other apps, so the same recording plays from here" icon="git-branch-outline" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: ui.pad, paddingLeft: 50, paddingBottom: 8 }}>
          {(
            [
              ['auto', 'Best quality'],
              ['youtube', 'YouTube Music'],
              ['soundcloud', 'SoundCloud'],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} label={label} active={s.spotifySource === id} onPress={() => updateSettings({ spotifySource: id })} />
          ))}
        </View>
        <Txt tone="text3" size={12} style={{ paddingLeft: 50, paddingRight: ui.pad, marginBottom: 6 }}>
          {s.spotifySource === 'auto'
            ? 'Searches both and picks the better-sounding copy (or the smaller one on Low / Mid quality).'
            : `Uses ${s.spotifySource === 'youtube' ? 'YouTube Music' : 'SoundCloud'} when it has the song, otherwise the other one.`}
        </Txt>
        <Row title="Show lyrics" icon="text-outline" right={sw(s.showLyrics, (v) => updateSettings({ showLyrics: v }), 'Show lyrics')} />

        <Group title="Display" />
        <Row title="Themes" sub={THEMES.find((t) => t.id === s.theme)?.name ?? 'Theme'} icon="color-palette-outline" onPress={() => router.push('/settings/themes')} chevron />
        <Row title="New releases: longest song" sub="Home → New releases shows new music from the people you follow. Longer uploads (mixes, livestreams, vlogs) are left out; albums always show." icon="sparkles-outline" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: ui.pad, paddingBottom: 8 }}>
          {([5, 8, 10, 15, 30, 0] as const).map((m) => (
            <Chip key={m} label={m ? `${m} min` : 'No limit'} active={s.newReleasesMaxMinutes === m} onPress={() => updateSettings({ newReleasesMaxMinutes: m })} />
          ))}
        </ScrollView>

        <Group title="Local files" />
        <Row
          title="Hide short clips"
          sub="Hide local audio under 30 seconds (samples, voice memos)"
          icon="cut-outline"
          right={sw(s.hideShortClips, (v) => {
            updateSettings({ hideShortClips: v })
            refreshLocalVisibility()
          }, 'Hide short clips')}
        />

        <Group title="Privacy" />
        <Row
          title="Clear listening history"
          icon="trash-outline"
          onPress={() =>
            Alert.alert('Clear listening history?', 'Every recorded play is removed from this phone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearHistory },
            ])
          }
        />

        <Group title="About" />
        <AboutRow />
        <Divider />
        <Row title="Diagnostics" sub="Check that every source works on this phone" icon="medkit-outline" onPress={() => router.push('/settings/diagnostics')} chevron testID="settings-diagnostics" />
      </ScrollView>
    </View>
  )
}

function SyncSettingsRow() {
  const st = useStore(syncStore, (x) => x)
  return (
    <Row
      title="ProjectM account"
      sub={st.error ? `Couldn't sync: ${st.error}` : st.loggedIn ? `${st.email} · synced` : 'Log in to get your playlists on every device'}
      icon="person-circle-outline"
      onPress={() => router.push('/settings/account')}
      chevron
      testID="settings-account"
    />
  )
}

function AboutRow() {
  const logo = useLogo()
  return (
    <>
      <Row title="ProjectM for iPhone" sub={`Version ${appVersion() ?? '?'}`} left={<Image source={logo} style={{ width: 28, height: 28, marginHorizontal: 2 }} />} />
      <Row title="Check for updates" sub="Looks for a newer ProjectMobile on GitHub" icon="cloud-download-outline" onPress={() => void offerUpdate(true)} chevron testID="settings-update" />
    </>
  )
}
