import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import type { Entity, EntityKind, SourceId } from '../core/types'
import { cleanError, ENTITY_TABS, searchEntities, SOURCES } from '../lib/sources'
import { useColors, ui } from '../lib/theme'
import { Artwork, Empty, ErrorText, Icon, SourceIcon, Spinner, Txt } from './ui'

/** Opens an artist, playlist or profile (search tabs, New releases, an artist's albums). */
export const openEntity = (e: Entity) => router.push({ pathname: '/entity', params: { e: JSON.stringify(e) } })

/** One artist, playlist or profile in a list: round picture for people, square for playlists. */
export function EntityRow({ entity: e }: { entity: Entity }) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={e.name}
      onPress={() => openEntity(e)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: ui.pad, paddingVertical: 8, backgroundColor: pressed ? c.hover : 'transparent' })}
    >
      <Artwork src={e.artwork} size={54} radius={e.kind === 'playlist' ? 6 : 27} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt weight="600" lines={1}>
          {e.name}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <SourceIcon source={e.source} size={13} />
          <Txt tone="text2" size={13} lines={1} style={{ flex: 1 }}>
            {e.subtitle ?? SOURCES[e.source].name}
          </Txt>
        </View>
      </View>
      <Icon name="chevron-forward" size={18} color={c.text3} />
    </Pressable>
  )
}

/** A card for horizontal rails (Home → New releases). */
export function EntityTile({ entity: e }: { entity: Entity }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={e.name} onPress={() => openEntity(e)} style={{ width: 140, gap: 6 }}>
      <View>
        <Artwork src={e.artwork} size={140} radius={e.kind === 'playlist' ? 8 : 70} />
        <View style={{ position: 'absolute', top: 6, left: 6 }}>
          <SourceIcon source={e.source} size={16} />
        </View>
      </View>
      <Txt weight="600" size={14} lines={1}>
        {e.name}
      </Txt>
      <Txt tone="text2" size={12} lines={1}>
        {e.subtitle ?? SOURCES[e.source].name}
      </Txt>
    </Pressable>
  )
}

const KIND_NAME: Record<EntityKind, string> = { artist: 'artists', playlist: 'playlists', profile: 'profiles' }

/** Artists, playlists or profiles for a search, one section per platform. */
export function EntityResults({ query, kind, sources }: { query: string; kind: EntityKind; sources: SourceId[] }) {
  const tab = ENTITY_TABS.find((t) => t.kind === kind)!
  const shown = sources.filter((s) => tab.sources.includes(s))
  const [results, setResults] = useState<Partial<Record<SourceId, { loading: boolean; items: Entity[]; error?: string }>>>({})
  const key = shown.join(',')

  useEffect(() => {
    setResults({})
    if (!query) return
    let live = true
    for (const s of shown) {
      setResults((r) => ({ ...r, [s]: { loading: true, items: [] } }))
      searchEntities(s, query, kind).then(
        (items) => live && setResults((r) => ({ ...r, [s]: { loading: false, items } })),
        (err) => live && setResults((r) => ({ ...r, [s]: { loading: false, items: [], error: cleanError(err).message } })),
      )
    }
    return () => {
      live = false
    }
  }, [query, kind, key])

  if (!shown.length)
    return (
      <Empty
        icon="people-outline"
        title={`No ${KIND_NAME[kind]} here`}
        text={kind === 'profile' ? "Spotify doesn't let apps search people's profiles. Try SoundCloud or YouTube." : kind === 'artist' ? 'On SoundCloud, artists are under Profiles.' : 'Pick a platform that has playlists.'}
      />
    )
  if (!query) return <Empty icon="search-outline" title={`Search ${KIND_NAME[kind]}`} text="Type a name above." />
  const empty = shown.every((s) => results[s] && !results[s]!.loading && !results[s]!.items.length && !results[s]!.error)
  if (empty) return <Empty icon="search-outline" title={`No ${KIND_NAME[kind]} for "${query}"`} text="Check the spelling, or try fewer words." />
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
      {shown.map((s) => {
        const r = results[s]
        if (!r || (!r.loading && !r.items.length && !r.error)) return null
        return (
          <View key={s} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: ui.pad, marginBottom: 4 }}>
              <SourceIcon source={s} size={18} />
              <Txt size={18} weight="800">
                {SOURCES[s].name}
              </Txt>
            </View>
            {r.loading ? <Spinner /> : null}
            {r.error ? <ErrorText text={r.error} /> : null}
            {r.items.map((e) => (
              <EntityRow key={`${e.source}:${e.id}`} entity={e} />
            ))}
          </View>
        )
      })}
    </ScrollView>
  )
}
