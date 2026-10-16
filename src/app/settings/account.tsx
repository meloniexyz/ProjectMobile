import * as Clipboard from 'expo-clipboard'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native'
import { Button, Header, Txt } from '../../components/ui'
import type { AccountDevice } from '../../core/account'
import { useStore } from '../../core/store'
import { changePassword, deleteAccount, devices, logIn, logOut, ownerReset, recover, removeDevice, signUp, syncNow, syncStore } from '../../lib/sync'
import { relayStore } from '../../lib/accountExtras'
import { useColors, ui } from '../../lib/theme'
import { toast } from '../../lib/ui'

type Mode = 'login' | 'signup' | 'recover' | 'password' | 'delete' | { code: string }

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleString()
}
const message = (e: unknown) => String((e as Error)?.message ?? e)

/** Settings → ProjectM account: same playlists (and more) on every PC and iPhone you log in on. */
export default function AccountScreen() {
  const c = useColors()
  const st = useStore(syncStore, (s) => s)
  const params = useLocalSearchParams<{ mode?: string }>()
  const [mode, setMode] = useState<Mode | null>(params.mode === 'signup' ? 'signup' : null)
  const loggedOutMode: Mode = mode ?? 'login'
  const showForm = !st.loggedIn || (mode !== null && mode !== 'login' && mode !== 'signup')

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="ProjectM account" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
          {typeof mode === 'object' && mode ? (
            <RecoveryCode code={mode.code} done={() => setMode(null)} />
          ) : showForm ? (
            <Form mode={st.loggedIn ? (mode as Mode) : loggedOutMode} setMode={setMode} needsLogin={st.needsLogin} email={st.email} />
          ) : (
            <LoggedIn setMode={setMode} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  const c = useColors()
  return <View style={{ marginHorizontal: ui.pad, marginTop: 14, backgroundColor: c.bg3, borderRadius: 12, padding: 14, gap: 12 }}>{children}</View>
}

function Input({ label, value, onChange, secure, email, hint, testID }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean; email?: boolean; hint?: string; testID?: string }) {
  const c = useColors()
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} weight="600" tone="text2">
        {label}
      </Txt>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={email ? 'email-address' : 'default'}
        textContentType={secure ? 'password' : email ? 'emailAddress' : 'none'}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={c.text3}
        style={{ color: c.text, backgroundColor: c.bg4, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 }}
      />
      {hint ? (
        <Txt size={12} style={{ color: '#ff5d6c' }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  )
}

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <View style={{ backgroundColor: 'rgba(255,93,108,0.12)', borderRadius: 8, padding: 10 }}>
      <Txt size={13} style={{ color: '#ff5d6c' }}>
        {text}
      </Txt>
    </View>
  )
}

function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}

function Form({ mode, setMode, needsLogin, email: knownEmail }: { mode: Mode; setMode: (m: Mode | null) => void; needsLogin?: boolean; email?: string }) {
  const [email, setEmail] = useState(knownEmail ?? '')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [code, setCode] = useState('')
  const [notAllowed, setNotAllowed] = useState(false)
  const { busy, error, run } = useAction()

  if (mode === 'signup')
    return (
      <Card>
        <Txt size={20} weight="800">
          Create a ProjectM account
        </Txt>
        <Txt tone="text2" size={14}>
          Your playlists, look, sound settings, history and music platforms follow you to every PC and iPhone you log in on. Your password never leaves this phone.
        </Txt>
        <Input label="Email" value={email} onChange={setEmail} email testID="account-email" />
        <Input label="Password" value={password} onChange={setPassword} secure hint={password && password.length < 8 ? 'At least 8 characters' : undefined} testID="account-password" />
        <Input label="Password again" value={again} onChange={setAgain} secure hint={again && again !== password ? "Doesn't match" : undefined} testID="account-password-again" />
        <ErrorBox text={error} />
        <Button
          title="Create account"
          busy={busy}
          disabled={!email || password.length < 8 || password !== again}
          onPress={() =>
            run(async () => {
              const { recoveryCode } = await signUp(email, password)
              setMode({ code: recoveryCode })
            })
          }
        />
        <Button title="I already have an account" kind="ghost" onPress={() => setMode('login')} />
      </Card>
    )

  if (mode === 'recover')
    return (
      <Card>
        <Txt size={20} weight="800">
          Forgot password
        </Txt>
        <Txt size={14}>
          <Txt size={14} weight="700">
            Still logged in on your PC or another phone?{' '}
          </Txt>
          Open ProjectM there and choose Settings → ProjectM account → Set new password. Nothing to type here.
        </Txt>
        <Txt tone="text2" size={14}>
          Not logged in anywhere? Set a new password here with your recovery code, or without it once the person who runs your ProjectM server has allowed a reset.
        </Txt>
        <Input label="Email" value={email} onChange={setEmail} email />
        <Input label="Recovery code (if you have it)" value={code} onChange={setCode} />
        <Input label="New password" value={password} onChange={setPassword} secure hint={password && password.length < 8 ? 'At least 8 characters' : undefined} />
        {notAllowed ? (
          <ErrorBox text="No reset has been allowed for this email yet. Ask the person who runs your ProjectM server to allow one (it lasts 24 hours), then try again. Without the recovery code, YouTube Music and SoundCloud will need connecting again; everything else stays." />
        ) : (
          <ErrorBox text={error} />
        )}
        <Button
          title="Set new password"
          busy={busy}
          disabled={!email || password.length < 8}
          onPress={() =>
            run(async () => {
              setNotAllowed(false)
              try {
                const { recoveryCode } = code.trim() ? await recover(email, code, password) : await ownerReset(email, password)
                setMode({ code: recoveryCode })
              } catch (e) {
                if (/has not been allowed/.test(message(e))) setNotAllowed(true)
                else throw e
              }
            })
          }
        />
        <Button title="Back to log in" kind="ghost" onPress={() => setMode('login')} />
      </Card>
    )

  if (mode === 'password')
    return (
      <Card>
        <Txt size={20} weight="800">
          Set new password
        </Txt>
        <Txt tone="text2" size={14}>
          Works even if you forgot the old one, because this phone is logged in. Your other devices will ask for the new password; nothing is lost.
        </Txt>
        <Input label="New password" value={password} onChange={setPassword} secure hint={password && password.length < 8 ? 'At least 8 characters' : undefined} />
        <Input label="New password again" value={again} onChange={setAgain} secure hint={again && again !== password ? "Doesn't match" : undefined} />
        <ErrorBox text={error} />
        <Button
          title="Set new password"
          busy={busy}
          disabled={password.length < 8 || password !== again}
          onPress={() =>
            run(async () => {
              await changePassword(password)
              toast('New password set. Your other devices will ask for it.')
              setMode(null)
            })
          }
        />
        <Button title="Cancel" kind="ghost" onPress={() => setMode(null)} />
      </Card>
    )

  if (mode === 'delete')
    return (
      <Card>
        <Txt size={20} weight="800">
          Delete account
        </Txt>
        <Txt tone="text2" size={14}>
          This deletes your ProjectM account and everything stored with it, and logs out all your devices. Playlists, settings and history already on your devices stay there.
        </Txt>
        <Input label="Password" value={password} onChange={setPassword} secure />
        <ErrorBox text={error} />
        <Button
          title="Delete account"
          kind="danger"
          busy={busy}
          disabled={!password}
          onPress={() =>
            run(async () => {
              await deleteAccount(password)
              toast('Account deleted. Your playlists stay on this phone.')
              setMode(null)
            })
          }
        />
        <Button title="Cancel" kind="ghost" onPress={() => setMode(null)} />
      </Card>
    )

  // log in
  return (
    <Card>
      <Txt size={20} weight="800">
        {needsLogin ? 'Log in again' : 'Log in to ProjectM'}
      </Txt>
      <Txt tone="text2" size={14}>
        {needsLogin
          ? 'Your password was changed or this phone was removed from your devices. Log in again to keep syncing; nothing on this phone was lost.'
          : 'Your playlists and settings come with you to every PC and iPhone. No account yet? Create one, it’s free.'}
      </Txt>
      <Input label="Email" value={email} onChange={setEmail} email testID="account-email" />
      <Input label="Password" value={password} onChange={setPassword} secure testID="account-password" />
      <ErrorBox text={error} />
      <Button
        title="Log in"
        busy={busy}
        disabled={!email || !password}
        onPress={() =>
          run(async () => {
            await logIn(email, password)
            toast('Logged in. Your playlists are syncing.')
          })
        }
      />
      <Button title="Create an account" kind="secondary" onPress={() => setMode('signup')} />
      <Button title="Forgot password?" kind="ghost" onPress={() => setMode('recover')} />
    </Card>
  )
}

/** Shown once after sign-up or a reset: a backup way back in, worth keeping but not required. */
function RecoveryCode({ code, done }: { code: string; done: () => void }) {
  return (
    <Card>
      <Txt size={20} weight="800">
        Your recovery code
      </Txt>
      <Txt tone="text2" size={14}>
        Forgot your password? You can set a new one from any device where you're still logged in. This code is a backup for when you aren't logged in anywhere, and it keeps your connected platforms too. Copy it somewhere safe if you like.
      </Txt>
      <Txt size={18} weight="800" style={{ textAlign: 'center', letterSpacing: 1 }} testID="recovery-code">
        {code}
      </Txt>
      <Button
        title="Copy code"
        kind="secondary"
        icon="copy-outline"
        onPress={async () => {
          await Clipboard.setStringAsync(code)
          toast('Recovery code copied')
        }}
      />
      <Button title="Done" onPress={done} />
    </Card>
  )
}

/** Local songs passing between devices, in words. */
function relayText(r: { waitingForDevice: number; waitingForSpace: number; waitingForWifi: number; sending: number; receiving: number }) {
  const parts = [
    r.sending && `sending ${r.sending} of your songs to your other devices`,
    r.receiving && `receiving ${r.receiving}`,
    r.waitingForWifi && `${r.waitingForWifi} waiting for Wi-Fi`,
    r.waitingForDevice && `${r.waitingForDevice} waiting for a device that has them to come online`,
    r.waitingForSpace && `${r.waitingForSpace} waiting for space on the server`,
  ].filter(Boolean)
  return parts.length ? `Local songs: ${parts.join(', ')}.` : ''
}

function LoggedIn({ setMode }: { setMode: (m: Mode | null) => void }) {
  const c = useColors()
  const st = useStore(syncStore, (s) => s)
  const relay = useStore(relayStore, (s) => s)
  const [list, setList] = useState<{ devices: AccountDevice[]; thisDevice: string } | null>(null)
  const load = () => devices().then(setList, (e) => toast(message(e)))
  useEffect(() => {
    void load()
  }, [])
  return (
    <>
      <Card>
        <Txt size={18} weight="800">
          {st.email}
        </Txt>
        <Txt tone={st.error ? 'text' : 'text2'} size={14} style={st.error ? { color: '#ff5d6c' } : undefined}>
          {st.error
            ? `Couldn't sync: ${st.error}`
            : st.syncing
              ? 'Syncing…'
              : st.lastSync
                ? `Synced ${ago(st.lastSync)}. Playlists, look, sound and quality, history and your YouTube Music / SoundCloud sign-ins are the same on every device you log in on.`
                : 'Waiting to sync'}
        </Txt>
        {relayText(relay) ? (
          <Txt tone="text2" size={13}>
            {relayText(relay)}
          </Txt>
        ) : null}
        <Button title="Sync now" kind="secondary" icon="sync-outline" busy={st.syncing} onPress={() => void syncNow()} />
      </Card>
      <Card>
        <Txt size={16} weight="800">
          Devices
        </Txt>
        {!list ? (
          <Txt tone="text2">Loading…</Txt>
        ) : (
          list.devices.map((d) => (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.bg4, borderRadius: 8, padding: 10 }}>
              <View style={{ flex: 1 }}>
                <Txt weight="700" lines={1}>
                  {d.name}
                  {d.id === list.thisDevice ? ' · this phone' : ''}
                </Txt>
                <Txt tone="text2" size={12}>
                  {d.platform === 'ios' ? 'iPhone' : d.platform === 'windows' ? 'Windows' : d.platform} · last seen {ago(d.lastSeen)}
                </Txt>
              </View>
              {d.id !== list.thisDevice ? (
                <Button
                  small
                  kind="ghost"
                  title="Log out"
                  onPress={() =>
                    Alert.alert(`Log out ${d.name}?`, 'It stops syncing until someone logs in on it again.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Log out', style: 'destructive', onPress: () => removeDevice(d.id).then(load, (e) => toast(message(e))) },
                    ])
                  }
                />
              ) : null}
            </View>
          ))
        )}
      </Card>
      <Card>
        <Button title="Set new password" kind="secondary" onPress={() => setMode('password')} />
        <Txt tone="text2" size={12}>
          Works even if you forgot the old one.
        </Txt>
        <Button
          title="Log out of this phone"
          kind="ghost"
          onPress={() =>
            Alert.alert('Log out?', 'Syncing stops. Playlists, settings and history stay on this phone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log out', style: 'destructive', onPress: () => void logOut() },
            ])
          }
        />
        <Button title="Delete account" kind="danger" onPress={() => setMode('delete')} />
      </Card>
    </>
  )
}

