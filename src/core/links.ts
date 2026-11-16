// Shared by Negusify (Windows) and Negusify for iPhone (iOS): keep every copy identical.
/**
 * Song links from Spotify, YouTube / YouTube Music and SoundCloud: which service and song a
 * pasted link points to, and the link to share for a song.
 */

export type SongLink =
  | { source: 'spotify'; id: string }
  | { source: 'youtube'; id: string }
  /** SoundCloud songs are found by their page address */
  | { source: 'soundcloud'; url: string }

/** The song a pasted link points to, or null when it isn't a song link we know. */
export function parseSongLink(text: string): SongLink | null {
  const raw = text.trim()
  const uri = raw.match(/^spotify:track:([A-Za-z0-9]{22})$/)
  if (uri) return { source: 'spotify', id: uri[1] }
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (/\s/.test(raw)) return null
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const parts = u.pathname.split('/').filter(Boolean)

  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    // open.spotify.com/track/ID or /intl-de/track/ID
    const i = parts.indexOf('track')
    const id = i >= 0 ? parts[i + 1] : undefined
    return id && /^[A-Za-z0-9]{22}$/.test(id) ? { source: 'spotify', id } : null
  }

  if (host === 'youtu.be') return ytId(parts[0])
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (parts[0] === 'watch') return ytId(u.searchParams.get('v') ?? undefined)
    if (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') return ytId(parts[1])
    return null
  }

  if (host === 'on.soundcloud.com' && parts.length === 1) return { source: 'soundcloud', url: `https://on.soundcloud.com/${parts[0]}` }
  if (host === 'soundcloud.com') {
    // soundcloud.com/artist/song (not /artist/sets/..., /artist/likes, ...)
    if (parts.length !== 2 || ['sets', 'likes', 'tracks', 'albums', 'reposts', 'followers', 'following', 'popular-tracks'].includes(parts[1])) return null
    if (['discover', 'search', 'you', 'stream', 'charts', 'upload', 'pages'].includes(parts[0])) return null
    return { source: 'soundcloud', url: `https://soundcloud.com/${parts[0]}/${parts[1]}` }
  }
  return null
}

const ytId = (id: string | undefined): SongLink | null => (id && /^[\w-]{11}$/.test(id) ? { source: 'youtube', id } : null)

/** Whether text looks like a link at all (Search shows "Find this link" instead of searching words). */
export const looksLikeLink = (text: string) => /^(https?:\/\/|spotify:|(www\.|m\.|music\.)?(open\.spotify|youtube|youtu\.be|music\.youtube|soundcloud|on\.soundcloud)\.)/i.test(text.trim())
