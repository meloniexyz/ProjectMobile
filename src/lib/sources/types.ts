/** How to download one song's audio. */
export interface StreamPlan {
  source: 'youtube' | 'soundcloud' | 'jellyfin'
  id: string
  /** 'file': one download; 'hls': a playlist of segments joined into one file */
  kind: 'file' | 'hls'
  url: string
  /** file extension of the result */
  ext: 'm4a' | 'mp3' | 'mp4' | 'flac' | 'caf'
  codec: 'aac' | 'mp3' | 'flac' | 'alac' | 'opus'
  /** 'webm-caf': the download is WebM (YouTube's Opus) and is repacked into CAF, which iPhones play */
  remux?: 'webm-caf'
  kbps: number
  /** for display, e.g. "AAC · 128 kbps" */
  quality: string
  /** expected size, when known */
  bytes?: number
  /** gain (dB) to reach -14 LUFS, when the source publishes loudness info */
  gainDb?: number
}
