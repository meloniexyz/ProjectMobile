import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, ScrollView, TextInput, View } from 'react-native'
import { Button, Header, Txt } from '../../components/ui'
import { check, remove, select, signIn, signOut, useServers, type ServerView } from '../../lib/jellyfin'
import { cleanError } from '../../lib/sources'
import { useColors, ui } from '../../lib/theme'
import { toast } from '../../lib/ui'
import { useStore } from '../../core/store'
import { syncStore } from '../../lib/sync'

/**
 * Full mode: your Jellyfin servers. The one in use is where Jellyfin songs, favourites and playlists
 * come from. Servers added on any device come with your Negusify account.
 */
function Card({ children }: { children: React.ReactNode }) {
  const c = useColors()
  return <View style={{ marginHorizontal: ui.pad, marginTop: 14, backgroundColor: c.bg3, borderRadius: 12, padding: 14, gap: 10 }}>{children}</View>
}

function Field(props: { value: string; onChangeText: (v: string) => void; placeholder: string; secure?: boolean; testID?: string }) {
  const c = useColors()
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={c.text3}
      secureTextEntry={props.secure}
      autoCapitalize="none"
      autoCorrect={false}
      testID={props.testID}
      style={{ color: c.text, backgroundColor: c.bg4, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}
    />
  )
}

function ServerCard({ s, inUse }: { s: ServerView; inUse: boolean }) {
  const c = useColors()
  const [problem, setProblem] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (inUse && s.signedIn) check().then(setProblem)
  }, [inUse, s.signedIn])
  const again = async () => {
    setBusy(true)
    try {
      await signIn({ address: s.url, username: s.userName, password: pw, name: s.name })
      setPw('')
      toast(`Signed in to ${s.name}`)
    } catch (e) {
      Alert.alert("Couldn't sign in", cleanError(e).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: !s.signedIn ? c.text3 : problem ? '#f5c542' : '#34d399' }} />
        <View style={{ flex: 1 }}>
          <Txt size={17} weight="800">
            {s.name}
            {inUse ? '  ·  in use' : ''}
          </Txt>
          <Txt tone="text2" size={13}>
            {s.url} · {s.userName}
            {s.isAdmin ? ' (administrator)' : ''}
          </Txt>
          {!s.signedIn ? (
            <Txt tone="text2" size={13}>
              Signed out
            </Txt>
          ) : problem ? (
            <Txt tone="text2" size={13}>
              {problem}
            </Txt>
          ) : null}
        </View>
      </View>
      {!s.signedIn ? (
        <View style={{ gap: 8 }}>
          <Field value={pw} onChangeText={setPw} placeholder={`Password for ${s.userName}`} secure />
          <Button small title="Sign in" busy={busy} disabled={!pw} onPress={again} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {!inUse && s.signedIn ? <Button small title="Use this server" onPress={() => select(s.id)} /> : null}
        {s.signedIn ? <Button small kind="ghost" title="Sign out" onPress={() => signOut(s.id)} /> : null}
        <Button
          small
          kind="ghost"
          title="Remove"
          onPress={() =>
            Alert.alert(`Remove ${s.name}?`, 'It goes away on your other devices too.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => void remove(s.id) },
            ])
          }
        />
      </View>
    </Card>
  )
}

function AddServer() {
  const [address, setAddress] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const s = await signIn({ address, username, password })
      setAddress('')
      setUsername('')
      setPassword('')
      toast(`Added ${s.name}`)
    } catch (e) {
      setError(cleanError(e).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <Txt size={17} weight="800">
        Add a server
      </Txt>
      <Txt tone="text2" size={13}>
        The address you use for Jellyfin (with Tailscale, its Tailscale address), and your Jellyfin username and password. The password is only sent to the server.
      </Txt>
      <Field value={address} onChangeText={setAddress} placeholder="Address, e.g. 100.83.163.35:8096" testID="server-address" />
      <Field value={username} onChangeText={setUsername} placeholder="Username" testID="server-username" />
      <Field value={password} onChangeText={setPassword} placeholder="Password" secure testID="server-password" />
      {error ? (
        <Txt size={13} style={{ color: '#ff6b6b' }}>
          {error}
        </Txt>
      ) : null}
      <Button title="Add server" busy={busy} disabled={!address || !username} onPress={add} style={{ alignSelf: 'flex-start' }} />
    </Card>
  )
}

export default function Servers() {
  const c = useColors()
  const { servers, currentId } = useServers()
  const loggedIn = useStore(syncStore, (s) => s.loggedIn)
  // opened by the "link a server" prompt (no Jellyfin server linked to the account yet)
  const prompt = useLocalSearchParams<{ link?: string }>().link === '1' && !servers.length
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={prompt ? 'Link a Jellyfin server' : 'Servers'} />
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        {prompt ? (
          <Card>
            <Txt size={15} weight="700">
              Your account has no Jellyfin server yet
            </Txt>
            <Txt tone="text2" size={13}>
              Sign in to your Jellyfin server below and it's linked to your Negusify account, so every device you log in on has it.
            </Txt>
            <Button small kind="ghost" title="Later" onPress={() => router.back()} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : null}
        <Txt tone="text2" size={14} style={{ paddingHorizontal: ui.pad, marginTop: 4 }}>
          Your Jellyfin music servers. The one in use is where Jellyfin songs, favourites and playlists come from. Servers you add on any device come with your Negusify account.
        </Txt>
        {!loggedIn ? (
          <Card>
            <Txt size={15} weight="700">
              Added your server on another device?
            </Txt>
            <Txt tone="text2" size={13}>
              Log in to your Negusify account and your servers come along, already signed in.
            </Txt>
            <Button small title="Log in" onPress={() => router.push('/settings/account')} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : null}
        {[...servers]
          .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId))
          .map((s) => (
            <ServerCard key={s.id} s={s} inUse={s.id === currentId} />
          ))}
        <AddServer />
      </ScrollView>
    </View>
  )
}
