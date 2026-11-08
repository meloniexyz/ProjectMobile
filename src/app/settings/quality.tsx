import { Pressable, ScrollView, Switch, View } from 'react-native'
import { Header, Icon, Row, Txt } from '../../components/ui'
import { updateSettings, useSettings, type JellyfinQuality, type MobileSettings, type Quality } from '../../lib/settings'
import { useColors, ui } from '../../lib/theme'

interface Step<Q extends string> {
  q: Q
  title: string
  detail: string
  size: string
}

/** YouTube Music, SoundCloud and Spotify songs (iPhones can't play their Opus streams, so AAC). */
const STREAMING: Step<Quality>[] = [
  { q: 'low', title: 'Low', size: '~20–45 MB per hour', detail: 'YouTube: AAC ~48 kbps when available · SoundCloud: AAC 96 kbps · Spotify songs: the smallest matching copy' },
  { q: 'mid', title: 'Mid', size: '~45–60 MB per hour', detail: 'YouTube: AAC 128 kbps · SoundCloud: AAC 96 kbps · Spotify songs: the smaller matching copy' },
  { q: 'best', title: 'Best', size: '~60–75 MB per hour', detail: 'YouTube: AAC 128–256 kbps · SoundCloud: AAC 160–256 kbps · Spotify songs: the better-sounding copy' },
]

/** Songs from your Jellyfin server: the file itself, or a smaller copy the server makes. */
const JELLYFIN: Step<JellyfinQuality>[] = [
  {
    q: 'original',
    title: 'Original',
    size: 'up to ~2.5 GB per hour',
    detail: 'The file as it is on the server: lossless FLAC / ALAC up to 24-bit / 192 kHz, or the MP3 / AAC you have. WAV, DSD and APE come as FLAC.',
  },
  {
    q: 'cd',
    title: 'CD quality',
    size: '~250–450 MB per hour',
    detail: 'Still lossless, but hi-res files are brought down to 16-bit / 44.1 or 48 kHz FLAC by the server. CD-quality and lossy files come as they are.',
  },
  { q: 'mp3-320', title: 'High', size: '~145 MB per hour', detail: 'MP3 320 kbps made by the server. Hard to tell from lossless on most headphones.' },
  { q: 'mp3-256', title: 'Normal', size: '~115 MB per hour', detail: 'MP3 256 kbps made by the server.' },
  { q: 'mp3-128', title: 'Data saver', size: '~60 MB per hour', detail: 'MP3 128 kbps made by the server.' },
]

type Field = keyof Pick<MobileSettings, 'wifiQuality' | 'cellularQuality' | 'downloadQuality' | 'jellyfinWifiQuality' | 'jellyfinCellularQuality' | 'jellyfinDownloadQuality'>

function Picker<Q extends string>({ title, sub, field, steps }: { title: string; sub: string; field: Field; steps: Step<Q>[] }) {
  const c = useColors()
  const s = useSettings()
  return (
    <View style={{ marginTop: 18 }}>
      <Txt size={16} weight="800" style={{ paddingHorizontal: ui.pad }}>
        {title}
      </Txt>
      <Txt tone="text2" size={13} style={{ paddingHorizontal: ui.pad, marginTop: 2, marginBottom: 6 }}>
        {sub}
      </Txt>
      {steps.map((step) => {
        const on = s[field] === step.q
        return (
          <Pressable
            key={step.q}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${title}: ${step.title}`}
            testID={`${field}-${step.q}`}
            onPress={() => updateSettings({ [field]: step.q } as Partial<MobileSettings>)}
            style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: ui.pad, paddingVertical: 10, backgroundColor: pressed ? c.hover : 'transparent' })}
          >
            <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? c.accent : c.text3} />
            <View style={{ flex: 1 }}>
              <Txt size={15} weight="700">
                {step.title} <Txt tone="text2" size={13}>· {step.size}</Txt>
              </Txt>
              <Txt tone="text2" size={12} style={{ marginTop: 2 }}>
                {step.detail}
              </Txt>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

function Section({ title, text }: { title: string; text: string }) {
  const c = useColors()
  return (
    <View style={{ marginTop: 26, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.line }}>
      <Txt size={20} weight="800" style={{ paddingHorizontal: ui.pad }}>
        {title}
      </Txt>
      <Txt tone="text2" size={13} style={{ paddingHorizontal: ui.pad, marginTop: 4 }}>
        {text}
      </Txt>
    </View>
  )
}

export default function QualitySettings() {
  const c = useColors()
  const s = useSettings()
  const full = s.mode === 'full'
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Audio quality" />
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        <Txt tone="text2" size={13} style={{ paddingHorizontal: ui.pad }}>
          Songs you've played are kept on the phone, so playing them again uses no data. Downloaded songs stay at the quality they were saved in.
        </Txt>

        {full ? (
          <>
            <Section
              title="Jellyfin"
              text="Songs from your server. Lossless and hi-res files are big: on mobile data a smaller copy made by the server saves a lot of data and plays without waiting."
            />
            <Picker title="Wi-Fi streaming" sub="Jellyfin songs on Wi-Fi" field="jellyfinWifiQuality" steps={JELLYFIN} />
            <Picker title="Mobile data streaming" sub="Jellyfin songs on mobile data" field="jellyfinCellularQuality" steps={JELLYFIN} />
            <Picker title="Download" sub="Jellyfin songs saved for offline listening" field="jellyfinDownloadQuality" steps={JELLYFIN} />
          </>
        ) : null}

        <Section
          title={full ? 'Streaming services' : 'Quality'}
          text="YouTube Music, SoundCloud and Spotify songs. iPhones can't play YouTube's and SoundCloud's Opus streams, so Negusify uses their AAC versions (none of them offer lossless)."
        />
        <Picker title="Wi-Fi streaming" sub="Quality when you're on Wi-Fi" field="wifiQuality" steps={STREAMING} />
        <Picker title="Mobile data streaming" sub="Quality on mobile data. Lower saves data." field="cellularQuality" steps={STREAMING} />
        <Picker title="Download" sub="Quality of songs saved for offline listening" field="downloadQuality" steps={STREAMING} />

        <View style={{ marginTop: 18 }}>
          <Row
            title="Download using mobile data"
            sub="Off: downloads wait for Wi-Fi"
            icon="cellular-outline"
            right={
              <Switch accessibilityLabel="Download using mobile data" value={s.downloadOnCellular} onValueChange={(v) => updateSettings({ downloadOnCellular: v })} trackColor={{ true: c.accent }} />
            }
          />
        </View>
      </ScrollView>
    </View>
  )
}
