import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native'
import { HandleInput, ProfileCard } from '../../components/Profile'
import { Button, Header, Txt } from '../../components/ui'
import { useStore } from '../../core/store'
import { pickProfileImage, removeProfileImage, syncStore, updateProfile, type ShownProfile } from '../../lib/sync'
import { useColors, ui } from '../../lib/theme'
import { toast } from '../../lib/ui'

const MAX_BIO = 190
/** colours to choose from for the two profile colours (iOS has no colour wheel input) */
const SWATCHES = ['#ff4d8d', '#ed4245', '#f97316', '#faa61a', '#fee75c', '#3ba55c', '#1abc9c', '#0ea5e9', '#5865f2', '#9b59b6', '#f47fff', '#ffffff', '#64748b', '#1e3a8a', '#3b1d8f', '#1e1b2e', '#111111']

const message = (e: unknown) => String((e as Error)?.message ?? e)

/** Edit profile, like Discord's: live preview on top, then photo, banner, name, @username, colours and About me. */
export default function EditProfileScreen() {
  const c = useColors()
  const { pick } = useLocalSearchParams<{ pick?: string }>()
  const p = useStore(syncStore, (s) => s.profile)
  const [handle, setHandle] = useState(p?.handle ?? '')
  const [valid, setValid] = useState<string | null>(p?.handle ?? null)
  const [name, setName] = useState(p?.displayName ?? '')
  const [bio, setBio] = useState(p?.bio ?? '')
  const [colors, setColors] = useState<[string, string] | null>(p?.colors ?? null)
  const [editing, setEditing] = useState<0 | 1>(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const act = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(message(e))
      return false
    } finally {
      setBusy(null)
    }
  }
  const patch: { handle?: string; displayName?: string; colors?: [string, string] | null; bio?: string } = {}
  if (valid && valid !== p?.handle) patch.handle = valid
  if (name.trim() !== (p?.displayName ?? '')) patch.displayName = name.trim()
  if (bio.trim() !== (p?.bio ?? '')) patch.bio = bio.trim()
  if (JSON.stringify(colors) !== JSON.stringify(p?.colors ?? null)) patch.colors = colors
  const changed = Object.keys(patch).length > 0

  const preview: ShownProfile = {
    handle: valid ?? p?.handle ?? null,
    displayName: name.trim(),
    avatar: p?.avatar ?? null,
    banner: p?.banner ?? null,
    colors,
    bio: bio.trim(),
    memberSince: p?.memberSince ?? Date.now(),
  }
  const image = (kind: 'avatar' | 'banner') => {
    const what = kind === 'banner' ? 'banner' : 'photo'
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small kind="secondary" title={busy === kind ? 'Uploading…' : p?.[kind] ? `Change ${what}` : `Add ${what}`} busy={busy === kind} onPress={() => act(kind, async () => (await pickProfileImage(kind)) && toast(`${kind === 'banner' ? 'Banner' : 'Photo'} updated`))} />
        {p?.[kind] ? <Button small kind="ghost" title="Remove" onPress={() => act(kind, () => removeProfileImage(kind))} /> : null}
      </View>
    )
  }
  const label = (text: string) => (
    <Txt size={13} weight="600" tone="text2">
      {text}
    </Txt>
  )
  const input = { color: c.text, backgroundColor: c.bg4, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={pick ? 'Pick your username' : 'Edit profile'} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
          {pick ? (
            <Txt tone="text2" size={14} style={{ paddingHorizontal: ui.pad, marginTop: 6 }}>
              ProjectM accounts now have an @username. People on ProjectM can find you by it. You can change it later.
            </Txt>
          ) : null}
          <ProfileCard profile={preview} />
          <View style={{ paddingHorizontal: ui.pad, gap: 16, marginTop: 18 }}>
            <View style={{ gap: 6 }}>
              {label('Display name')}
              <TextInput value={name} onChangeText={setName} maxLength={32} placeholder="Optional, shown above your @username" placeholderTextColor={c.text3} style={input} />
            </View>
            <HandleInput value={handle} onChange={setHandle} onValid={setValid} current={p?.handle} />
            <View style={{ gap: 6 }}>
              {label('Profile photo')}
              {image('avatar')}
            </View>
            <View style={{ gap: 6 }}>
              {label('Banner')}
              {image('banner')}
              <Txt tone="text3" size={12}>
                A wide picture (5:2) across the top. Without one, the banner is your primary colour.
              </Txt>
            </View>
            <View style={{ gap: 8 }}>
              {label('Profile colours')}
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                {(['Primary', 'Accent'] as const).map((n, i) => (
                  <Pressable key={n} onPress={() => setEditing(i as 0 | 1)} style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 56, height: 40, borderRadius: 8, backgroundColor: colors?.[i] ?? c.bg4, borderWidth: editing === i ? 2 : 1, borderColor: editing === i ? c.text : c.line }} />
                    <Txt size={11} tone={editing === i ? 'text' : 'text3'}>
                      {n}
                    </Txt>
                  </Pressable>
                ))}
                {colors ? <Button small kind="ghost" title="Reset" onPress={() => setColors(null)} /> : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SWATCHES.map((s) => (
                  <Pressable
                    key={s}
                    accessibilityLabel={`Colour ${s}`}
                    onPress={() => {
                      const next = [...(colors ?? [c.accent, '#1e1b2e'])] as [string, string]
                      next[editing] = s
                      setColors(next)
                      if (editing === 0 && !colors) setEditing(1)
                    }}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: s, borderWidth: colors?.[editing] === s ? 3 : 1, borderColor: colors?.[editing] === s ? c.text : c.line }}
                  />
                ))}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {label('About me')}
                <Txt tone="text3" size={12}>
                  {MAX_BIO - bio.length}
                </Txt>
              </View>
              <TextInput value={bio} onChangeText={setBio} maxLength={MAX_BIO} multiline placeholder="A few words about you or what you listen to" placeholderTextColor={c.text3} style={[input, { minHeight: 80, textAlignVertical: 'top' }]} />
            </View>
            {error ? (
              <Txt size={13} style={{ color: '#ff5d6c' }}>
                {error}
              </Txt>
            ) : null}
            <Button
              title={busy === 'save' ? 'Saving…' : 'Save'}
              busy={busy === 'save'}
              disabled={!valid || !changed}
              onPress={async () => {
                if (await act('save', () => updateProfile(patch))) {
                  toast(pick ? `You're @${valid}` : 'Profile saved')
                  router.back()
                }
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
