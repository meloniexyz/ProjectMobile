import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { Alert, Linking } from 'react-native'

const REPO = 'meloniexyz/ProjectMobile'

/** "1.10.0" > "1.9.2" */
export function newer(a: string, b: string) {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

/** This app's version, from iOS itself (falls back to the build settings). */
export const appVersion = () => Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null

/** The release notes' first points, without markdown marks or the install line. */
const summary = (notes: string) =>
  notes
    .split(/\r?\n/)
    .map((l) => l.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^[-*]\s+/, '• ').trim())
    .filter((l) => l && !/^(install|with a free apple id|update from)/i.test(l))
    .slice(0, 4)
    .join('\n\n')

export interface UpdateCheck {
  current: string | null
  latest: string | null
  available: boolean
  page?: string
  notes?: string
}

/** Asks GitHub for the newest ProjectMobile release (one with an .ipa). */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const current = appVersion()
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'ProjectMobile' } })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const r = (await res.json()) as { tag_name: string; body?: string; html_url: string; draft: boolean; prerelease: boolean; assets: { name: string }[] }
  const latest = r.tag_name.replace(/^v/, '')
  const usable = !r.draft && !r.prerelease && r.assets.some((a) => a.name.endsWith('.ipa'))
  return { current, latest, available: !!current && usable && newer(latest, current), page: r.html_url, notes: r.body ?? '' }
}

/**
 * If GitHub has a newer ProjectMobile, offer Update (opens the release to get the .ipa, since a
 * sideloaded app can't install itself) or Skip. On start nothing shows when there's nothing new or
 * the phone is offline; from Settings (`manual`) it also says "up to date" or what went wrong.
 */
export async function offerUpdate(manual = false) {
  let u: UpdateCheck
  try {
    u = await checkForUpdate()
  } catch (e) {
    if (manual) Alert.alert("Couldn't check for updates", String((e as Error)?.message ?? e))
    return
  }
  if (!u.available) {
    if (manual) Alert.alert("You're up to date", `ProjectMobile ${u.current ?? '?'} is the newest version.`)
    return
  }
  Alert.alert(
    `ProjectMobile ${u.latest} is out`,
    `You have ${u.current}. Download the new .ipa and install it with Sideloadly; your library and settings stay.\n\n${summary(u.notes ?? '')}`,
    [
      { text: 'Skip', style: 'cancel' },
      { text: 'Update', style: 'default', onPress: () => Linking.openURL(u.page!).catch(() => {}) },
    ],
  )
}
