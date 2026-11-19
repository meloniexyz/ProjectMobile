import { router } from 'expo-router'
import { Pressable, View } from 'react-native'
import type { SharedSong } from '../core/account'
import type { SourceId, Track } from '../core/types'
import { playTracks } from '../lib/player'
import { SOURCES } from '../lib/sources'
import { useColors } from '../lib/theme'
import { Artwork, Icon, SourceIcon, Txt } from './ui'

/**
 * A song shared in a message: cover, title, artist and album, with a play button (their own files
 * and Jellyfin songs: searches for it). Same card as the desktop's Messages page.
 */
export function SongCard({ song, onRemove }: { song: SharedSong; onRemove?: () => void }) {
  const c = useColors()
  const playable = !!(song.uid && song.source && song.id && song.source !== 'local' && song.source !== 'jellyfin')
  const play = () => (playable ? playTracks([song as Track], 0) : router.navigate({ pathname: '/search', params: { q: `${song.artist} ${song.title}` } }))
  const source = song.source && song.source in SOURCES ? (song.source as SourceId) : null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: 270, maxWidth: '100%', padding: 8, paddingRight: 12, borderRadius: 14, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.line }}>
      <View>
        <Artwork src={song.artwork} size={60} radius={8} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playable ? `Play ${song.title}` : `Find ${song.title}`}
          onPress={play}
          hitSlop={8}
          style={{ position: 'absolute', right: -8, bottom: -8, width: 30, height: 30, borderRadius: 15, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="play" size={16} color={c.accentInk} />
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        <Txt size={14} weight="700" lines={1}>
          {song.title}
        </Txt>
        <Txt size={13} tone="text2" lines={1}>
          {song.artist}
        </Txt>
        {song.album ? (
          <Txt size={12} tone="text3" lines={1}>
            {song.album}
          </Txt>
        ) : null}
      </View>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Don't send this song" onPress={onRemove} hitSlop={10}>
          <Icon name="close" size={18} color={c.text2} />
        </Pressable>
      ) : source ? (
        <View style={{ position: 'absolute', top: 8, right: 10 }}>
          <SourceIcon source={source} size={13} />
        </View>
      ) : null}
    </View>
  )
}
