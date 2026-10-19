// CI: plays "the PC" for the PC <-> iPhone account check, using the same account code as ProjectM
// on Windows (core/account.ts is an identical copy of ProjectM's src/shared/account.ts).
//   setup  -> makes a test account with a "From PC (CI)" playlist, prints {"email","password"}
//   verify <json> -> checks the iPhone's "From iPhone (CI)" playlist arrived, then deletes the account
import { deleteAccount, localFields, logIn, relayDownload, relayUpload, sendHistory, signUp, songKey, syncMatches, syncPlatforms, syncPlaylists, syncSettings } from '../src/core/account'

const device = { id: `ci-pc-${Date.now().toString(36)}`, name: 'CI PC', platform: 'windows' as const }
const [step, arg] = process.argv.slice(2)

async function main() {
  if (step === 'setup') {
    const email = `ci-cross-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
    const password = `ci-${Math.random().toString(36).slice(2)}-pass`
    const { session } = await signUp(email, password, device, { handle: `ci_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, displayName: 'CI PC' })
    const track = { uid: 'spotify:4uLU6hMCjMI75M1A2tKUQC', source: 'spotify' as const, id: '4uLU6hMCjMI75M1A2tKUQC', title: 'Never Gonna Give You Up', artist: 'Rick Astley', album: 'Whenever You Need Somebody', duration: 213 }
    const local = { uid: 'local:ci-pc-file', source: 'local' as const, id: 'ci-pc-file', title: 'CI Local Song', artist: 'ProjectM CI', album: 'CI', duration: 5 }
    await syncPlaylists(session, () => ({ playlists: [{ id: 'ci-from-pc', name: 'From PC (CI)', tracks: [track, local], createdAt: Date.now(), updatedAt: Date.now() }], deleted: {} }))
    // stage 2: look, history, a platform sign-in and the local song's file
    const changed = { accent: { json: '"x"', at: 1 }, soundcloud: { json: '"x"', at: 1 } }
    await syncSettings(session, 'look', () => localFields({ accent: '#22d3ee' }, changed))
    await syncPlatforms(session, () => localFields({ soundcloud: { id: 1, username: 'ci-check' } }, changed))
    await sendHistory(session, { entries: [{ id: 'ci-play', track, startedAt: Date.now() - 60000, endedAt: Date.now(), segments: [[0, 60]], listened: 60, duration: 213 }] })
    await relayUpload(session, songKey(local.title, local.artist), new Uint8Array(4096).fill(1), 'audio/mpeg', 'CI Local Song.mp3')
    // the recording a Spotify song plays from, picked "on the PC" (a real SoundCloud upload of One More Time)
    await syncMatches(session, () => ({ 'spotify:ci-match': { source: 'soundcloud', id: '199428706', title: 'One More Time', artist: 'Daft Punk', duration: 322, at: 1 } }))
    console.log(JSON.stringify({ email, password }))
    return
  }
  if (step === 'verify') {
    const { email, password } = JSON.parse(arg) as { email: string; password: string }
    const session = await logIn(email, password, device)
    try {
      const r = await syncPlaylists(session, () => ({ playlists: [], deleted: {} }))
      const names = r.playlists.map((p) => p.name)
      console.log('playlists on the account:', names.join(', '))
      if (!names.includes('From iPhone (CI)')) throw new Error("the iPhone's playlist did not reach the PC side")
      if (await relayDownload(session, songKey('CI Local Song', 'ProjectM CI'))) throw new Error('the local song was not deleted from the server after the iPhone got it')
      const picks = (await syncMatches(session, () => ({}))).merged
      if (!picks['spotify:diag']) throw new Error("the iPhone's song pick did not reach the PC side")
      console.log('song pick from the iPhone:', picks['spotify:diag'].source, picks['spotify:diag'].id)
      console.log('PC <-> iPhone sync OK')
    } finally {
      await deleteAccount(session, password)
    }
    return
  }
  throw new Error('usage: cross-account setup | verify <json>')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
