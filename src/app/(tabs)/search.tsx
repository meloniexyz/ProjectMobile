import { useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EntityKind, SourceId, Track } from '../../core/types'
import { EntityResults } from '../../components/EntityList'
import { Dropdown, type DropdownOption } from '../../components/Overlays'
import { norm } from '../../core/format'
import { useStore } from '../../core/store'
import { TrackRow } from '../../components/TrackRow'
import { Empty, ErrorText, Icon, IconButton, SourceIcon, Spinner, Txt } from '../../components/ui'
import { PeopleResults } from '../../components/Profile'
import { accountStore } from '../../lib/accounts'
import { libStore } from '../../lib/library'
import { canStream, useConnection } from '../../lib/net'
import { playTracks } from '../../lib/player'
import { updateSettings, useSettings } from '../../lib/settings'
import { cleanError, ENTITY_TABS, search, SOURCES } from '../../lib/sources'
import { useColors, ui } from '../../lib/theme'

const cache = new Map<string, Track[]>()

// 'negusify': people on Negusify, next to the music platforms (only has profiles)
type Platform = SourceId | 'negusify'
type Kind = 'songs' | EntityKind
const TYPES: DropdownOption<Kind>[] = [{ value: 'songs', label: 'Tracks' }, ...ENTITY_TABS.map((t) => ({ value: t.kind, label: t.label }))]

/** "YouTube, Jellyfin", "All platforms" */
const summary = (picked: string[], all: DropdownOption<string>[], allLabel: string) =>
  picked.length === all.length && all.length > 1 ? allLabel : all.filter((o) => picked.includes(o.value)).map((o) => o.label).join(', ')

export default function Search() {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ q?: string }>()
  const [text, setText] = useState(params.q ?? '')
  const [query, setQuery] = useState(params.q ?? '')
  const settings = useSettings()
  const spotifyOn = useStore(accountStore, (s) => !!s.accounts.spotify?.connected)
  const jellyfinOn = useStore(accountStore, (s) => !!s.accounts.jellyfin?.connected)
  useConnection()

  useEffect(() => {
    if (params.q) {
      setText(params.q)
      setQuery(params.q)
    }
  }, [params.q])

  // wait for a pause in typing before searching (saves requests)
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 450)
    return () => clearTimeout(t)
  }, [text])

  const platformOptions: DropdownOption<Platform>[] = [
    ...(jellyfinOn ? (['jellyfin'] as SourceId[]) : []),
    ...(['youtube', 'soundcloud'] as SourceId[]),
    ...(spotifyOn ? (['spotify'] as SourceId[]) : []),
    'local' as SourceId,
  ]
    .map((s): DropdownOption<Platform> => ({ value: s, label: SOURCES[s].short, color: SOURCES[s].color }))
    .concat({ value: 'negusify', label: 'Negusify', color: c.accent })
  // what was picked last time (still available), else YouTube tracks
  const saved = settings.searchPlatforms.filter((p) => platformOptions.some((o) => o.value === p)) as Platform[]
  const platforms: Platform[] = saved.length ? saved : ['youtube']
  const savedTypes = settings.searchTypes.filter((t) => TYPES.some((o) => o.value === t)) as Kind[]
  const types: Kind[] = savedTypes.length ? savedTypes : ['songs']

  const music = platforms.filter((p): p is SourceId => p !== 'negusify')
  // several sections: each platform's songs are cut to 20
  const several = types.length > 1 || music.length > 1

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      <Txt size={ui.font.title} weight="800" style={{ paddingHorizontal: ui.pad, marginBottom: 10 }}>
        Search
      </Txt>
      <View style={{ marginHorizontal: ui.pad, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.text, borderRadius: 8, paddingHorizontal: 12 }}>
        <Icon name="search" size={20} color={c.bg} />
        <TextInput
          testID="search-input"
          accessibilityLabel="Search"
          value={text}
          onChangeText={setText}
          placeholder="What do you want to listen to?"
          placeholderTextColor="#666"
          returnKeyType="search"
          onSubmitEditing={() => setQuery(text.trim())}
          autoCorrect={false}
          style={{ flex: 1, color: c.bg, fontSize: 16, paddingVertical: 11, fontWeight: '600' }}
        />
        {text ? <IconButton name="close-circle" size={20} color={c.bg} label="Clear" onPress={() => setText('')} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, padding: ui.pad, paddingBottom: 6 }}>
        <Dropdown multi title="Platforms" label={summary(platforms, platformOptions, 'All platforms')} options={platformOptions} value={platforms} onChange={(v) => updateSettings({ searchPlatforms: v })} />
        <Dropdown multi title="Types" label={summary(types, TYPES, 'All types')} options={TYPES} value={types} onChange={(v) => updateSettings({ searchTypes: v })} />
      </View>
      {!query ? (
        <Empty icon="musical-notes-outline" title="Search YouTube Music, SoundCloud and more" text="Pick platforms and types above; songs from every platform play in the same queue." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {types.map((t) => (
            <View key={t}>
              {types.length > 1 ? (
                <Txt size={22} weight="800" style={{ paddingHorizontal: ui.pad, marginTop: 14 }}>
                  {TYPES.find((o) => o.value === t)!.label}
                </Txt>
              ) : null}
              {t === 'songs' ? (
                music.map((s) => <TrackResults key={s} query={query} source={s} heading={music.length > 1} cap={several ? 20 : undefined} />)
              ) : (
                <>
                  <EntityResults bare query={query} kind={t} sources={music} />
                  {t === 'profile' && platforms.includes('negusify') ? (
                    <>
                      {music.length ? <GroupHeading title="Negusify" /> : null}
                      <PeopleResults bare query={query} />
                    </>
                  ) : null}
                </>
              )}
            </View>
          ))}
          {platforms.length === 1 && platforms[0] === 'negusify' && !types.includes('profile') ? (
            <Empty icon="people-outline" title="Negusify only has profiles" text="Add Profiles in Types to find people." />
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

function GroupHeading({ title, source }: { title: string; source?: SourceId }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: ui.pad, marginTop: 10, marginBottom: 4 }}>
      {source ? <SourceIcon source={source} size={18} /> : null}
      <Txt size={18} weight="800">
        {title}
      </Txt>
    </View>
  )
}

/** One platform's songs for a search, loading and failing on its own. */
function TrackResults({ query, source, heading, cap }: { query: string; source: SourceId; heading: boolean; cap?: number }) {
  const local = useStore(libStore, (s) => s.tracks)
  const [state, setState] = useState<{ loading: boolean; tracks: Track[]; error?: string }>({ loading: false, tracks: [] })
  const localResults = useMemo(() => {
    if (source !== 'local') return []
    const q = norm(query)
    return local.filter((t) => norm(`${t.title} ${t.artist} ${t.album}`).includes(q))
  }, [local, query, source])

  useEffect(() => {
    if (source === 'local') return
    const key = `${source}|${query.toLowerCase()}`
    const hit = cache.get(key)
    if (hit) return setState({ loading: false, tracks: hit })
    if (!canStream()) return setState({ loading: false, tracks: [], error: "You're offline. Search works on your local files and downloads." })
    let live = true
    setState({ loading: true, tracks: [] })
    search(source, query).then(
      (r) => {
        cache.set(key, r)
        if (live) setState({ loading: false, tracks: r })
      },
      (err) => live && setState({ loading: false, tracks: [], error: cleanError(err).message }),
    )
    return () => {
      live = false
    }
  }, [query, source])

  const tracks = source === 'local' ? localResults : state.tracks
  const shown = cap ? tracks.slice(0, cap) : tracks
  return (
    <View>
      {heading ? <GroupHeading title={SOURCES[source].name} source={source} /> : null}
      {state.loading && source !== 'local' ? <Spinner /> : null}
      {state.error && source !== 'local' ? <ErrorText text={state.error} /> : null}
      {!state.loading && !state.error && !tracks.length ? (
        <Txt tone="text2" style={{ paddingHorizontal: ui.pad, paddingVertical: 6 }}>
          No songs for "{query}"{source === 'local' ? ' in your local files' : ` on ${SOURCES[source].name}`}
        </Txt>
      ) : null}
      {shown.map((t, i) => (
        <TrackRow key={t.uid} track={t} index={i} onPress={() => playTracks(tracks, i)} />
      ))}
    </View>
  )
}
