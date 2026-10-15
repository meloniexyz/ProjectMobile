// CI: plays "the PC" for the PC <-> iPhone account check, using the same account code as ProjectM
// on Windows (core/account.ts is an identical copy of ProjectM's src/shared/account.ts).
//   setup  -> makes a test account with a "From PC (CI)" playlist, prints {"email","password"}
//   verify <json> -> checks the iPhone's "From iPhone (CI)" playlist arrived, then deletes the account
import { deleteAccount, logIn, signUp, syncPlaylists } from '../src/core/account'

const device = { id: `ci-pc-${Date.now().toString(36)}`, name: 'CI PC', platform: 'windows' as const }
const [step, arg] = process.argv.slice(2)

async function main() {
  if (step === 'setup') {
    const email = `ci-cross-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
    const password = `ci-${Math.random().toString(36).slice(2)}-pass`
    const { session } = await signUp(email, password, device)
    const track = { uid: 'spotify:4uLU6hMCjMI75M1A2tKUQC', source: 'spotify' as const, id: '4uLU6hMCjMI75M1A2tKUQC', title: 'Never Gonna Give You Up', artist: 'Rick Astley', album: 'Whenever You Need Somebody', duration: 213 }
    await syncPlaylists(session, () => ({ playlists: [{ id: 'ci-from-pc', name: 'From PC (CI)', tracks: [track], createdAt: Date.now(), updatedAt: Date.now() }], deleted: {} }))
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
