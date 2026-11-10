import { GlassView } from 'expo-glass-effect'
import { useGlass } from '../lib/glass'
import { router } from 'expo-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, Switch, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { RemotePlaylist, Track } from '../core/types'
import { createStore, useStore } from '../core/store'
import { canLike, fetchers, getList, isLikedOn, keys, setLikedOn, addToRemotePlaylist, isConnected } from '../lib/accounts'
import { isDownloaded } from '../lib/audioCache'
import { setDownloaded } from '../lib/downloads'
import { addToPlaylist, createPlaylist, libStore, removeFromPlaylist } from '../lib/library'
import { addToQueue, playNext } from '../lib/player'
import { cleanError, forgetMatch, jellyfin, SOURCES } from '../lib/sources'
import { useColors, ui } from '../lib/theme'
import { closeSaveSheet, closeTrackSheet, openSaveSheet, saveSheetStore, toast, toastStore, trackSheetStore } from '../lib/ui'
import { openEntity } from './EntityList'
import { Artwork, Button, Icon, Row, Txt, type IconName } from './ui'

export function Toasts() {
  const c = useColors()
  const items = useStore(toastStore, (s) => s.items)
  const insets = useSafeAreaInsets()
  const glass = useGlass()
  if (!items.length) return null
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 130, gap: 6 }}>
      {items.map((t) =>
        glass ? (
          <GlassView key={t.id} glassEffectStyle="regular" colorScheme="dark" style={{ borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Txt size={14} weight="600">
              {t.text}
            </Txt>
          </GlassView>
        ) : (
          <View key={t.id} style={{ backgroundColor: c.text, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Txt size={14} weight="600" style={{ color: c.bg }}>
              {t.text}
            </Txt>
          </View>
        ),
      )}
    </View>
  )
}

/**
 * Where the song sheets and toasts are shown: the topmost screen that hosts them (the app itself, or
 * a full-screen page on top of it like the player or the queue). iOS can't show a sheet from a screen
 * that has another page over it; it would wait until that page closes.
 */
const hostStore = createStore<{ hosts: number[] }>({ hosts: [] })
let nextHost = 0
export function SheetHost() {
  const [id] = useState(() => ++nextHost)
  useEffect(() => {
    hostStore.set({ hosts: [...hostStore.get().hosts, id] })
    return () => hostStore.set({ hosts: hostStore.get().hosts.filter((h) => h !== id) })
  }, [id])
  const top = useStore(hostStore, (s) => s.hosts[s.hosts.length - 1])
  if (top !== id) return null
  return (
    <>
      <TrackSheet />
      <SaveSheet />
      <Toasts />
    </>
  )
}

/** A bottom sheet. */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const glass = useGlass()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      {glass ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme="dark"
          style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 8, maxHeight: '85%', overflow: 'hidden' }}
        >
          <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)', marginVertical: 8 }} />
          {children}
        </GlassView>
      ) : (
        <View style={{ backgroundColor: c.elev, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingBottom: insets.bottom + 8, maxHeight: '85%' }}>
          <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: c.line2, marginVertical: 8 }} />
          {children}
        </View>
      )}
    </Modal>
  )
}

function SheetItem({ icon, title, onPress, danger }: { icon: IconName; title: string; onPress: () => void; danger?: boolean }) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={title}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 13, backgroundColor: pressed ? c.hover : 'transparent' })}
    >
      <Icon name={icon} size={22} color={danger ? '#ff5d6c' : c.text2} />
      <Txt size={16} weight="500" style={danger ? { color: '#ff5d6c' } : undefined}>
        {title}
      </Txt>
    </Pressable>
  )
}

/** Jellyfin songs: the server's album / artist page; other songs: Search for it (like Windows). */
export async function goTo(track: Track, kind: 'album' | 'artist') {
  const artist = track.artist.split(',')[0].trim()
  if (track.source === 'jellyfin') {
    try {
      const e = (await jellyfin.trackRefs(track.id))[kind]
      if (e) return openEntity(e)
    } catch (err) {
      return toast(cleanError(err).message)
    }
  }
  router.push({ pathname: '/search', params: { q: kind === 'album' ? `${track.album} ${artist}` : artist } })
}

/** Long-press / ⋯ menu for a song. */
export function TrackSheet() {
  const { track, playlistId } = useStore(trackSheetStore, (s) => s)
  const close = closeTrackSheet
  if (!track) return <Sheet visible={false} onClose={close}>{null}</Sheet>
  const act = (fn: () => void) => () => {
    close()
    fn()
  }
  return (
    <Sheet visible onClose={close}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 10 }}>
        <Artwork src={track.artwork} size={48} />
        <View style={{ flex: 1 }}>
          <Txt size={16} weight="700" lines={1}>
            {track.title}
          </Txt>
          <Txt tone="text2" size={13} lines={1}>
            {track.artist} · {SOURCES[track.source].name}
          </Txt>
        </View>
      </View>
      <ScrollView>
        <SheetItem icon="play-forward-outline" title="Play next" onPress={act(() => playNext([track]))} />
        <SheetItem icon="list-outline" title="Add to queue" onPress={act(() => addToQueue([track]))} />
        <SheetItem icon="add-circle-outline" title="Save to playlist or Liked Songs" onPress={act(() => setTimeout(() => openSaveSheet(track), 350))} />
        {track.source !== 'local' ? (
          isDownloaded(track.uid) ? (
            <SheetItem icon="close-circle-outline" title="Remove download" onPress={act(() => setDownloaded(`song:${track.uid}`, track.title, [track], false))} />
          ) : (
            <SheetItem icon="arrow-down-circle-outline" title="Download" onPress={act(() => {
              setDownloaded(`song:${track.uid}`, track.title, [track], true)
              toast('Downloading for offline listening')
            })} />
          )
        ) : null}
        {track.album ? <SheetItem icon="disc-outline" title="Go to album" onPress={act(() => goTo(track, 'album'))} /> : null}
        <SheetItem icon="person-outline" title="Go to artist" onPress={act(() => goTo(track, 'artist'))} />
        {track.source === 'spotify' ? (
          <SheetItem icon="refresh-outline" title="Wrong version? Find it again" onPress={act(() => {
            forgetMatch(track.uid)
            toast('Next play searches YouTube Music and SoundCloud again, on all your devices')
          })} />
        ) : null}
        {playlistId ? <SheetItem icon="trash-outline" title="Remove from this playlist" danger onPress={act(() => removeFromPlaylist(playlistId, track.uid))} /> : null}
      </ScrollView>
    </Sheet>
  )
}

/** Spotify-style "Save in": liked songs on the song's platform + Negusify playlists + your playlists there. */
export function SaveSheet() {
  const track = useStore(saveSheetStore, (s) => s.track)
  return <Sheet visible={!!track} onClose={closeSaveSheet}>{track ? <SaveContent key={track.uid} track={track} /> : null}</Sheet>
}

function SaveContent({ track }: { track: Track }) {
  const c = useColors()
  const playlists = useStore(libStore, (s) => s.playlists)
  const [liked, setLiked] = useState<boolean | null>(null)
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<RemotePlaylist[] | null>(null)
  const [added, setAdded] = useState<Record<string, 'adding' | 'done'>>({})
  const likeable = canLike(track.source)

  useEffect(() => {
    if (!likeable) return
    isLikedOn(track).then(setLiked, () => setLiked(null))
    getList(keys.playlists(track.source), fetchers.playlists(track.source)).then(
      (list) => setRemote(list.filter((p) => p.editable)),
      () => setRemote([]),
    )
  }, [track, likeable])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? playlists.filter((p) => p.name.toLowerCase().includes(q)) : playlists
  }, [playlists, query])
  const remoteShown = (remote ?? []).filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()))

  const toggleLike = async (v: boolean) => {
    setLiked(v)
    try {
      await setLikedOn(track, v)
      toast(v ? `Added to Liked Songs on ${SOURCES[track.source].name}` : `Removed from Liked Songs on ${SOURCES[track.source].name}`)
    } catch (err) {
      setLiked(!v)
      toast(cleanError(err).message)
    }
  }

  const reason =
    track.source === 'local'
      ? 'Local files have no online liked songs'
      : track.source === 'soundcloud'
        ? "SoundCloud doesn't let other apps save likes"
        : !isConnected(track.source)
          ? `Sign in to ${SOURCES[track.source].name} to save likes there`
          : null

  return (
    <View style={{ paddingBottom: 6 }}>
      <Txt size={18} weight="800" style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        Save in
      </Txt>
      <View style={{ marginHorizontal: 16, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.bg3, borderRadius: 8, paddingHorizontal: 10 }}>
        <Icon name="search" size={16} color={c.text2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find a playlist"
          placeholderTextColor={c.text3}
          style={{ flex: 1, color: c.text, paddingVertical: 9, fontSize: 15 }}
        />
      </View>
      <ScrollView style={{ maxHeight: 460 }}>
        <Row
          title="New playlist"
          icon="add"
          onPress={() => {
            createPlaylist([track])
            closeSaveSheet()
            toast('Playlist created')
          }}
        />
        <Row
          title="Liked Songs"
          sub={reason ?? SOURCES[track.source].name}
          icon="heart"
          right={<Switch value={!!liked} disabled={!!reason || liked === null} onValueChange={toggleLike} trackColor={{ true: c.accent }} />}
        />
        {shown.map((p) => {
          const inIt = p.tracks.some((t) => t.uid === track.uid)
          return (
            <Row
              key={p.id}
              title={p.name}
              sub="Negusify playlist"
              left={<Artwork src={p.cover ?? p.tracks[0]?.artwork} size={40} />}
              right={
                <Switch
                  value={inIt}
                  onValueChange={(v) => (v ? addToPlaylist(p.id, [track]) : removeFromPlaylist(p.id, track.uid))}
                  trackColor={{ true: c.accent }}
                />
              }
            />
          )
        })}
        {remoteShown.length ? (
          <Txt tone="text2" size={13} weight="700" style={{ paddingHorizontal: ui.pad, marginTop: 10, marginBottom: 2 }}>
            ON {SOURCES[track.source].name.toUpperCase()}
          </Txt>
        ) : null}
        {remoteShown.map((p) => (
          <Row
            key={p.id}
            title={p.name}
            sub={`${SOURCES[track.source].name} playlist`}
            left={<Artwork src={p.artwork} size={40} />}
            right={
              <Button
                small
                kind={added[p.id] === 'done' ? 'ghost' : 'secondary'}
                title={added[p.id] === 'done' ? 'Added' : added[p.id] === 'adding' ? 'Adding…' : 'Add'}
                disabled={!!added[p.id]}
                onPress={async () => {
                  setAdded((a) => ({ ...a, [p.id]: 'adding' }))
                  try {
                    await addToRemotePlaylist(track.source, p.id, track)
                    setAdded((a) => ({ ...a, [p.id]: 'done' }))
                  } catch (err) {
                    setAdded((a) => {
                      const n = { ...a }
                      delete n[p.id]
                      return n
                    })
                    toast(cleanError(err).message)
                  }
                }}
              />
            }
          />
        ))}
        {likeable && remote === null ? (
          <Txt tone="text3" size={13} style={{ paddingHorizontal: ui.pad, paddingVertical: 8 }}>
            Loading your {SOURCES[track.source].name} playlists…
          </Txt>
        ) : null}
      </ScrollView>
      <Button title="Done" style={{ marginHorizontal: 16, marginTop: 8 }} onPress={closeSaveSheet} />
    </View>
  )
}

export interface DropdownOption<T extends string> {
  value: T
  label: string
  color?: string
}

/**
 * A pill that opens a sheet of options (Stats units, Search platforms and types). Multi-select has
 * an "All" row and always keeps at least one option picked; single-select closes on a pick.
 */
export function Dropdown<T extends string>(p: { label: string; title: string; options: DropdownOption<T>[]; value: T[]; onChange: (v: T[]) => void; multi?: boolean }) {
  const c = useColors()
  const [open, setOpen] = useState(false)
  const all = p.options.every((o) => p.value.includes(o.value))
  const pick = (v: T) => {
    if (!p.multi) {
      p.onChange([v])
      return setOpen(false)
    }
    const next = p.value.includes(v) ? p.value.filter((x) => x !== v) : [...p.value, v]
    if (next.length) p.onChange(p.options.map((o) => o.value).filter((x) => next.includes(x)))
  }
  const row = (label: string, on: boolean, onPress: () => void, color?: string) => (
    <Pressable
      key={label}
      accessibilityRole={p.multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 13, backgroundColor: pressed ? c.hover : 'transparent' })}
    >
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <Txt size={16} weight={on ? '700' : '500'} style={{ flex: 1 }}>
        {label}
      </Txt>
      {on ? <Icon name="checkmark" size={20} color={c.accent} /> : null}
    </Pressable>
  )
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${p.title}: ${p.label}`}
        testID={`dropdown-${p.title}`}
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 14, paddingRight: 10, paddingVertical: 7, borderRadius: c.skin === 'feishin' ? 6 : 999, backgroundColor: c.bg3 }}
      >
        <Txt size={13} weight="600" lines={1}>
          {p.label}
        </Txt>
        <Icon name="chevron-down" size={14} color={c.text2} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Txt size={13} weight="800" tone="text2" style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
          {p.title.toUpperCase()}
        </Txt>
        <ScrollView>
          {p.multi ? row('All', all, () => p.onChange(p.options.map((o) => o.value))) : null}
          {p.options.map((o) => row(o.label, p.value.includes(o.value), () => pick(o.value), o.color))}
        </ScrollView>
        {p.multi ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <Button title="Done" onPress={() => setOpen(false)} />
          </View>
        ) : null}
      </Sheet>
    </>
  )
}
