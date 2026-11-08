import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { useStore } from '../core/store'
import { TrackList } from '../components/TrackRow'
import { Chip, Empty, Header, Txt } from '../components/ui'
import { cacheStore, isDownloaded, storageStats } from '../lib/audioCache'
import { allDownloadTracks, downloadStore } from '../lib/downloads'
import { useColors, ui } from '../lib/theme'

const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`)

/** Side panel → Downloads: every song saved for offline listening. */
export default function Downloads() {
  const c = useColors()
  const collections = useStore(downloadStore, (s) => s.collections)
  const current = useStore(downloadStore, (s) => s.current)
  const paused = useStore(downloadStore, (s) => s.paused)
  const version = useStore(cacheStore, (s) => s.version)
  const [show, setShow] = useState<'done' | 'waiting'>('done')
  const all = useMemo(() => allDownloadTracks(), [collections])
  const done = useMemo(() => all.filter((t) => isDownloaded(t.uid)), [all, version])
  const waiting = useMemo(() => all.filter((t) => !isDownloaded(t.uid)), [all, version])
  const stats = useMemo(() => storageStats(), [version])
  const list = show === 'done' ? done : waiting
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Downloads" />
      <TrackList
        tracks={list}
        header={
          <View style={{ paddingHorizontal: ui.pad, paddingBottom: 8, gap: 10 }}>
            <Txt tone="text2" size={13}>
              {done.length} song{done.length === 1 ? '' : 's'} · {fmtBytes(stats.downloads)}
              {current ? ` · downloading ${current.title}` : paused && waiting.length ? ` · ${paused}` : ''}
            </Txt>
            {waiting.length ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label={`Downloaded (${done.length})`} active={show === 'done'} onPress={() => setShow('done')} />
                <Chip label={`Waiting (${waiting.length})`} active={show === 'waiting'} onPress={() => setShow('waiting')} />
              </View>
            ) : null}
          </View>
        }
        empty={<Empty icon="arrow-down-circle-outline" title={show === 'done' ? 'No downloads yet' : 'Nothing waiting'} text="Turn on Download on a playlist or album, or hold a song → Download." />}
      />
    </View>
  )
}
