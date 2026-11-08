import { File, FileMode } from 'expo-file-system'

/**
 * FLAC files the Jellyfin server converts on the fly (from WAV, DSD, APE...) are written by ffmpeg
 * into a pipe, so it can't go back and fill in the song's length: STREAMINFO says "0 samples".
 * iOS then treats the song as having no length and every seek lands back at 0:00.
 * This fills in the real length (from the last audio frame), which is all iOS needs to seek.
 */

const TAIL = 512 * 1024 // the last frames are well within this

// CRC-8 (poly 0x07) that guards each FLAC frame header
const CRC8 = (() => {
  const t = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let b = 0; b < 8; b++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff
    t[i] = c
  }
  return t
})()

interface Frame {
  /** frame number (fixed block size) or first sample (variable) */
  number: number
  blockSize: number
  variable: boolean
}

/** Reads a frame header at `i`, or null if it isn't a valid one. */
function frameAt(buf: Uint8Array, i: number, channelsCode: number): Frame | null {
  if (buf[i] !== 0xff || (buf[i + 1] & 0xfe) !== 0xf8) return null
  const variable = (buf[i + 1] & 1) === 1
  const bsCode = buf[i + 2] >> 4
  const srCode = buf[i + 2] & 0x0f
  const chCode = buf[i + 3] >> 4
  const bpsCode = (buf[i + 3] >> 1) & 7
  if (bsCode === 0 || srCode === 15 || chCode > 10 || bpsCode === 3 || (buf[i + 3] & 1) !== 0) return null
  if (chCode <= 7 ? chCode !== channelsCode : channelsCode !== 1) return null
  // UTF-8-style coded number (up to 36 bits)
  let p = i + 4
  const first = buf[p++]
  let extra: number
  let number: number
  if (first < 0x80) [extra, number] = [0, first]
  else if ((first & 0xe0) === 0xc0) [extra, number] = [1, first & 0x1f]
  else if ((first & 0xf0) === 0xe0) [extra, number] = [2, first & 0x0f]
  else if ((first & 0xf8) === 0xf0) [extra, number] = [3, first & 0x07]
  else if ((first & 0xfc) === 0xf8) [extra, number] = [4, first & 0x03]
  else if ((first & 0xfe) === 0xfc) [extra, number] = [5, first & 0x01]
  else if (first === 0xfe) [extra, number] = [6, 0]
  else return null
  for (let k = 0; k < extra; k++) {
    const b = buf[p++]
    if ((b & 0xc0) !== 0x80) return null
    number = number * 64 + (b & 0x3f)
  }
  let blockSize: number
  if (bsCode === 1) blockSize = 192
  else if (bsCode <= 5) blockSize = 576 << (bsCode - 2)
  else if (bsCode === 6) blockSize = buf[p++] + 1
  else if (bsCode === 7) {
    blockSize = ((buf[p] << 8) | buf[p + 1]) + 1
    p += 2
  } else blockSize = 256 << (bsCode - 8)
  if (srCode === 12) p += 1
  else if (srCode === 13 || srCode === 14) p += 2
  if (p >= buf.length) return null
  let crc = 0
  for (let k = i; k < p; k++) crc = CRC8[crc ^ buf[k]]
  if (crc !== buf[p]) return null
  return { number, blockSize, variable }
}

/**
 * Fills in a FLAC file's length when it's missing. `fallbackSeconds` (the server's length) is used
 * if the last frame can't be found. Returns true if the file was changed.
 */
export function fixFlacLength(file: File, fallbackSeconds?: number): boolean {
  if (!file.exists) return false
  const h = file.open(FileMode.ReadWrite)
  try {
    const head = h.readBytes(42)
    // "fLaC", then STREAMINFO (type 0, 34 bytes) is always the first block
    if (head.length < 42 || head[0] !== 0x66 || head[1] !== 0x4c || head[2] !== 0x61 || head[3] !== 0x43 || (head[4] & 0x7f) !== 0) return false
    const si = head.subarray(8)
    const total = (si[13] & 0x0f) * 2 ** 32 + ((si[14] << 24) >>> 0) + (si[15] << 16) + (si[16] << 8) + si[17]
    if (total > 0) return false
    const sampleRate = (si[10] << 12) | (si[11] << 4) | (si[12] >> 4)
    const channelsCode = (si[12] >> 1) & 7 // channels - 1
    if (!sampleRate) return false

    const size = h.size ?? file.size ?? 0
    const start = Math.max(42, size - TAIL)
    h.offset = start
    const tail = h.readBytes(size - start)

    // the last frame, confirmed by the one before it lining up with it
    // (scanning back from the end, the first header that the one before it lines up with is the
    // last frame; a false match inside audio data practically never lines up with anything)
    let samples = 0
    const seen: Frame[] = []
    for (let i = tail.length - 6; i >= 0 && !samples; i--) {
      const f = frameAt(tail, i, channelsCode)
      if (!f) continue
      for (const l of seen) {
        if (l.variable !== f.variable) continue
        if (f.variable ? f.number + f.blockSize === l.number : f.number + 1 === l.number) {
          samples = (l.variable ? l.number : l.number * f.blockSize) + l.blockSize
          break
        }
      }
      seen.push(f)
    }
    if (!samples && fallbackSeconds && fallbackSeconds > 0) samples = Math.round(fallbackSeconds * sampleRate)
    if (!samples) return false

    const hi = Math.floor(samples / 2 ** 32) & 0x0f
    const lo = samples % 2 ** 32
    const patch = new Uint8Array([(si[13] & 0xf0) | hi, (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff])
    h.offset = 8 + 13
    h.writeBytes(patch)
    return true
  } finally {
    h.close()
  }
}
