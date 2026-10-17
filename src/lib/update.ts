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

/** The release notes' first points, without markdown marks or the install line. */
const summary = (notes: string) =>
  notes
    .split(/\r?\n/)
    .map((l) => l.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^[-*]\s+/, '• ').trim())
    .filter((l) => l && !/^(install|with a free apple id)/i.test(l))
    .slice(0, 4)
    .join('\n\n')

/**
 * On start: if GitHub has a newer ProjectMobile, offer Update (opens the release to get the .ipa,
 * since a sideloaded app can't install itself) or Skip. Shows nothing otherwise or when offline.
 */
export async function offerUpdate() {
  const current = Constants.expoConfig?.version
  if (!current) return
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' } })
    if (!res.ok) return
    const r = (await res.json()) as { tag_name: string; body?: string; html_url: string; draft: boolean; prerelease: boolean; assets: { name: string }[] }
    if (r.draft || r.prerelease || !newer(r.tag_name, current) || !r.assets.some((a) => a.name.endsWith('.ipa'))) return
    const version = r.tag_name.replace(/^v/, '')
    Alert.alert(
      `ProjectMobile ${version} is out`,
      `You have ${current}. Download the new .ipa and install it with Sideloadly; your library and settings stay.\n\n${summary(r.body ?? '')}`,
      [
        { text: 'Skip', style: 'cancel' },
        { text: 'Update', style: 'default', onPress: () => Linking.openURL(r.html_url).catch(() => {}) },
      ],
    )
  } catch {
    // offline: nothing to show
  }
}
