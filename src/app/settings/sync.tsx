import * as Clipboard from 'expo-clipboard'
import { ScrollView, View } from 'react-native'
import { Button, Header, Txt } from '../../components/ui'
import { useStore } from '../../core/store'
import { cancelSyncLogin, connectSync, disconnectSync, openSyncPage, syncNow, syncStore } from '../../lib/sync'
import { useColors, ui } from '../../lib/theme'
import { toast } from '../../lib/ui'

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleString()
}

/** Settings → Playlist sync: the same ProjectM playlists on the PC and every phone. */
export default function SyncScreen() {
  const c = useColors()
  const st = useStore(syncStore, (s) => s)
  const card = { marginHorizontal: ui.pad, marginTop: 14, backgroundColor: c.bg3, borderRadius: 12, padding: 14, gap: 12 } as const
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Playlist sync" />
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        <View style={card}>
          <Txt tone="text2" size={14}>
            Keeps your ProjectM playlists the same on this phone, ProjectM on your PC and your other phones. They're stored in a private GitHub repository (projectm-sync) that only you can see. Songs from your own files show up on other devices, but only play where the file is.
          </Txt>
          {st.code ? (
            <>
              <Txt weight="700">1. Copy this code</Txt>
              <Txt size={30} weight="800" style={{ letterSpacing: 4, textAlign: 'center' }}>
                {st.code.userCode}
              </Txt>
              <Button
                title="Copy code and open GitHub"
                icon="open-outline"
                onPress={async () => {
                  await Clipboard.setStringAsync(st.code!.userCode)
                  toast('Code copied')
                  openSyncPage()
                }}
              />
              <Txt tone="text2" size={13}>
                2. Sign in to GitHub there, paste the code and allow ProjectM Sync. Then come back; this page updates by itself.
              </Txt>
              <Button title="Cancel" kind="ghost" onPress={cancelSyncLogin} />
            </>
          ) : st.connected ? (
            <>
              <Txt weight="700">Signed in as {st.account ?? '…'}</Txt>
              <Txt tone="text2" size={13}>
                {st.syncing ? 'Syncing…' : st.lastSync ? `Synced ${ago(st.lastSync)}` : 'Waiting to sync'}
              </Txt>
              <Button title="Sync now" icon="sync-outline" kind="secondary" busy={st.syncing} onPress={() => void syncNow()} />
              <Button title="Turn off sync" kind="danger" onPress={() => void disconnectSync()} />
            </>
          ) : (
            <Button title="Connect GitHub" icon="logo-github" onPress={() => void connectSync()} />
          )}
          {st.error ? (
            <Txt size={13} style={{ color: '#ff5d6c' }}>
              Couldn't sync: {st.error}
            </Txt>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}
