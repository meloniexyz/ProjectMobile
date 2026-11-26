/**
 * Word-by-word lyrics: when each word of a synced line lights up.
 * - Lyrics with per-word times (enhanced LRC) use them as they are.
 * - Otherwise the line's words are spread over the time it's sung: from the line's start until
 *   the next line (or about as long as the words take to sing, whichever is shorter, so a long
 *   instrumental gap after a line doesn't stretch it), each word getting a share by its length.
 */

export interface LyricLine {
  time: number
  text: string
  words?: { time: number; text: string }[]
}

/** about how long singing one letter takes (s), for lines without word times */
const PER_LETTER = 0.075
/** a line never takes longer than this to sing (s) */
const MAX_LINE = 8

export function lineWords(line: LyricLine, nextTime: number | undefined): { time: number; text: string }[] {
  if (line.words?.length) return line.words
  const words = line.text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const letters = words.reduce((n, w) => n + w.length + 1, 0)
  const gap = nextTime !== undefined ? Math.max(0.3, nextTime - line.time - 0.15) : MAX_LINE
  const span = Math.min(gap, MAX_LINE, Math.max(0.8, letters * PER_LETTER + 0.25))
  let before = 0
  return words.map((text) => {
    const time = line.time + (span * before) / letters
    before += text.length + 1
    return { time, text }
  })
}

/** The line being sung at `at` seconds (-1: before the first). */
export function currentLine(lines: LyricLine[], at: number) {
  let lo = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= at + 0.15) lo = i
    else break
  }
  return lo
}
