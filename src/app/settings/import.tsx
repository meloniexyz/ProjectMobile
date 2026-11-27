import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { parseHistoryFile, toEntries, type ImportKind, type ImportedPlay, type VideoInfo } from '../../core/historyImport'
import { useStore } from '../../core/store'
import { Button, Header, Txt } from '../../components/ui'
import { historyStore, importToHistory } from '../../lib/history'
import { youtube } from '../../lib/sources'
import { sendImportedHistory, syncStore } from '../../lib/sync'
import { useColors, ui } from '../../lib/theme'

/**
 * Settings → Import listening history: Spotify's data export (extended streaming history or
 * account data) and Google Takeout's YouTube Music history become plays in History, Stats and the
 * leaderboards. Same as the desktop app; the plays go to the Negusify account (the phone keeps the
 * newest few thousand).
 */
export default function ImportHistory() {
  const c = useColors()
  const loggedIn = useStore(syncStore, (s) => s.loggedIn)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const run = async () => {
    const pick = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], multiple: true, copyToCacheDirectory: true })
    if (pick.canceled || !pick.assets?.length) return
    setResult(null)
    try {
      const plays: ImportedPlay[] = []
      const kinds = new Set<ImportKind>()
      let skipped = 0
      let unknownFiles = 0
      for (const [i, a] of pick.assets.entries()) {
        setBusy(`Reading files… ${i + 1}/${pick.assets.length}`)
        const parsed = parseHistoryFile(await new File(a.uri).text())
        if (!parsed.kind) unknownFiles++
        else kinds.add(parsed.kind)
        plays.push(...parsed.plays)
        skipped += parsed.skipped
      }
      if (!kinds.size) {
        setResult("These files aren't a Spotify or YouTube Music listening history. Pick Streaming_History_Audio_*.json (Spotify) or watch-history.json (Google Takeout, JSON format).")
        return
      }
      // YouTube Music exports have no song lengths: look them up
      const ids = [...new Set(plays.filter((p) => p.source === 'youtube').map((p) => p.id))]
      const total = ids.length
      const videos = new Map<string, VideoInfo | null>()
      const next = async () => {
        for (let id = ids.pop(); id; id = ids.pop()) {
          const t = await youtube.track(id).catch(() => null)
          videos.set(id, t ? { title: t.title, artist: t.artist, duration: t.duration } : null)
          if (videos.size % 10 === 0) setBusy(`Looking up YouTube Music songs… ${videos.size}/${total}`)
        }
      }
      await Promise.all(Array.from({ length: 4 }, next))
      setBusy('Adding to your history…')
      const { entries, duplicates } = toEntries(plays, historyStore.get().entries, videos)
      importToHistory(entries)
      const uploaded = await sendImportedHistory(entries, (n) => setBusy(`Sending to your account… ${n.toLocaleString()}/${entries.length.toLocaleString()}`))
      const hours = entries.reduce((s, x) => s + x.listened, 0) / 3600
      setResult(
        [
          `Added ${entries.length.toLocaleString()} plays (${Math.round(hours).toLocaleString()} hours)`,
          duplicates ? `${duplicates.toLocaleString()} already in your history` : '',
          skipped ? `${skipped.toLocaleString()} skipped (podcasts, videos that aren't YouTube Music)` : '',
          unknownFiles ? `${unknownFiles} file${unknownFiles === 1 ? '' : 's'} weren't listening history` : '',
        ]
          .filter(Boolean)
          .join(' · ') + '.' + (entries.length && !uploaded ? ' Log in to your Negusify account to count them everywhere (import again after logging in).' : ''),
      )
    } catch (e) {
      setResult(`Import failed: ${String((e as Error)?.message ?? e)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Header title="Import listening history" />
      <ScrollView contentContainerStyle={{ padding: ui.pad, gap: 14, paddingBottom: 160 }}>
        <Txt tone="text2">Bring your listening from Spotify and YouTube Music into Negusify: History, Stats and the leaderboards count it.</Txt>
        <View style={{ gap: 6 }}>
          <Txt weight="700">Spotify</Txt>
          <Txt tone="text2" size={14}>
            spotify.com → Account → Privacy settings → Download your data → tick Extended streaming history (all your years) → Request data. When Spotify emails you, download the zip, open it in Files (it unzips), and pick the Streaming_History_Audio_….json files.
          </Txt>
        </View>
        <View style={{ gap: 6 }}>
          <Txt weight="700">YouTube Music</Txt>
          <Txt tone="text2" size={14}>
            takeout.google.com → deselect all → YouTube and YouTube Music → only History, format JSON → export. Pick watch-history.json. Only YouTube Music plays are imported.
          </Txt>
        </View>
        <Txt tone="text3" size={13}>
          SoundCloud doesn't offer its listening history. Importing the same files again doesn't add anything twice.
          {loggedIn ? '' : ' Log in to your Negusify account first so the plays count on your other devices and the leaderboards.'}
        </Txt>
        <Button title={busy ? 'Importing…' : 'Choose files'} icon="document-outline" busy={!!busy} disabled={!!busy} onPress={() => void run()} />
        {busy ? <Txt tone="text2">{busy}</Txt> : null}
        {result ? <Txt>{result}</Txt> : null}
      </ScrollView>
    </View>
  )
}
