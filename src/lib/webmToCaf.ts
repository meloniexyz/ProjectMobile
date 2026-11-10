/**
 * YouTube's best free audio is Opus (itag 251, ~130-160 kbps), the stream its own apps play.
 * It comes in a WebM container, which iPhones can't open, while iOS plays Opus fine inside Apple's
 * CAF container. This moves the Opus packets from WebM into CAF as they are: nothing is re-encoded,
 * so the sound is exactly YouTube's. Laid out like ffmpeg's `-c:a copy out.caf`.
 */

// ---------- WebM (EBML) ----------

const ID = {
  Segment: 0x18538067,
  Info: 0x1549a966,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Audio: 0xe1,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
} as const

/** Containers whose children we walk into (everything else is skipped). */
const MASTER = new Set<number>([ID.Segment, ID.Tracks, ID.TrackEntry, ID.Audio, ID.Cluster, ID.BlockGroup])

function readId(b: Uint8Array, i: number): [id: number, len: number] {
  const first = b[i]
  let len = 1
  while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++
  if (len > 4) throw new Error('bad WebM element id')
  let id = 0
  for (let k = 0; k < len; k++) id = id * 256 + b[i + k]
  return [id, len]
}

/** Element size; -1 = unknown (a live stream's open-ended cluster). */
function readSize(b: Uint8Array, i: number): [size: number, len: number] {
  const first = b[i]
  let len = 1
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++
  if (len > 8) throw new Error('bad WebM element size')
  let v = first & (0xff >> len)
  let allOnes = v === 0xff >> len
  for (let k = 1; k < len; k++) {
    v = v * 256 + b[i + k]
    if (b[i + k] !== 0xff) allOnes = false
  }
  return [allOnes ? -1 : v, len]
}

const readUint = (b: Uint8Array, i: number, n: number) => {
  let v = 0
  for (let k = 0; k < n; k++) v = v * 256 + b[i + k]
  return v
}

interface Parsed {
  codec: string
  channels: number
  opusHead: Uint8Array | null
  trackNumber: number
  packets: Uint8Array[]
}

function parseWebm(b: Uint8Array): Parsed {
  const out: Parsed = { codec: '', channels: 0, opusHead: null, trackNumber: 1, packets: [] }
  const block = (start: number, end: number) => {
    const [track, tl] = readSize(b, start)
    const flags = b[start + tl + 2]
    if (track !== out.trackNumber) return
    if (flags & 0x06) throw new Error('laced WebM blocks are not supported')
    out.packets.push(b.subarray(start + tl + 3, end))
  }
  const walk = (start: number, end: number) => {
    let i = start
    while (i < end) {
      const [id, il] = readId(b, i)
      const [size, sl] = readSize(b, i + il)
      const body = i + il + sl
      const stop = size < 0 ? end : Math.min(end, body + size)
      if (MASTER.has(id)) walk(body, stop)
      else if (id === ID.SimpleBlock) block(body, stop)
      else if (id === ID.Block) block(body, stop)
      else if (id === ID.CodecID) out.codec = String.fromCharCode(...b.subarray(body, stop))
      else if (id === ID.CodecPrivate) out.opusHead = b.slice(body, stop)
      else if (id === ID.Channels) out.channels = readUint(b, body, stop - body)
      i = stop
    }
  }
  // EBML header first, then the Segment
  walk(0, b.length)
  return out
}

// ---------- Opus ----------

/** Samples (at 48 kHz) in one Opus packet, from its TOC byte (RFC 6716 §3.1). */
export function opusSamples(p: Uint8Array): number {
  if (!p.length) return 0
  const toc = p[0]
  const config = toc >> 3
  const frame = config < 12 ? [480, 960, 1920, 2880][config & 3] : config < 16 ? [480, 960][config & 1] : [120, 240, 480, 960][config & 3]
  const code = toc & 3
  const frames = code === 0 ? 1 : code === 3 ? (p[1] ?? 0) & 0x3f : 2
  return frame * frames
}

// ---------- CAF ----------

class Writer {
  private chunks: Uint8Array[] = []
  length = 0
  bytes(b: Uint8Array) {
    this.chunks.push(b)
    this.length += b.length
  }
  private num(n: number, size: number, f: (v: DataView) => void) {
    const a = new Uint8Array(size)
    f(new DataView(a.buffer))
    this.bytes(a)
  }
  u16 = (v: number) => this.num(v, 2, (d) => d.setUint16(0, v))
  u32 = (v: number) => this.num(v, 4, (d) => d.setUint32(0, v >>> 0))
  i32 = (v: number) => this.num(v, 4, (d) => d.setInt32(0, v))
  i64 = (v: number) => this.num(v, 8, (d) => d.setBigInt64(0, BigInt(v)))
  f64 = (v: number) => this.num(v, 8, (d) => d.setFloat64(0, v))
  tag = (s: string) => this.bytes(new Uint8Array([...s].map((ch) => ch.charCodeAt(0))))
  chunk(type: string, size: number) {
    this.tag(type)
    this.i64(size)
  }
  /** CAF's variable-length integer: 7 bits per byte, most significant first */
  varint(v: number, into: number[]) {
    const tmp = [v & 0x7f]
    v = Math.floor(v / 128)
    while (v > 0) {
      tmp.push((v & 0x7f) | 0x80)
      v = Math.floor(v / 128)
    }
    for (let k = tmp.length - 1; k >= 0; k--) into.push(tmp[k])
  }
  result(): Uint8Array {
    const out = new Uint8Array(this.length)
    let o = 0
    for (const c of this.chunks) {
      out.set(c, o)
      o += c.length
    }
    return out
  }
}

/** Channel layout tags (CoreAudioTypes): mono, stereo. */
const LAYOUT: Record<number, number> = { 1: (100 << 16) | 1, 2: (101 << 16) | 2 }

/** WebM with Opus audio → CAF with the same Opus packets. Throws if the file isn't that. */
export function webmOpusToCaf(webm: Uint8Array): Uint8Array {
  const p = parseWebm(webm)
  if (p.codec !== 'A_OPUS') throw new Error(`not Opus audio (${p.codec || 'unknown'})`)
  const channels = p.channels || p.opusHead?.[9] || 2
  const packets = p.packets.filter((x) => x.length > 0)
  if (packets.length < 10) throw new Error('no audio in the WebM file')
  const samples = packets.map(opusSamples)
  const fixed = samples.every((s) => s === samples[0]) ? samples[0] : 0
  const total = samples.reduce((a, s) => a + s, 0)

  const table: number[] = []
  const w = new Writer()
  for (let k = 0; k < packets.length; k++) {
    w.varint(packets[k].length, table)
    if (!fixed) w.varint(samples[k], table)
  }
  const dataBytes = packets.reduce((a, x) => a + x.length, 0)

  w.tag('caff')
  w.u16(1)
  w.u16(0)
  // desc: 48 kHz Opus, variable bytes per packet
  w.chunk('desc', 32)
  w.f64(48000)
  w.tag('opus')
  w.u32(0) // format flags
  w.u32(0) // bytes per packet (variable)
  w.u32(fixed) // frames per packet (0 = each packet's own count is in the table)
  w.u32(channels)
  w.u32(0) // bits per channel
  if (LAYOUT[channels]) {
    w.chunk('chan', 12)
    w.u32(LAYOUT[channels])
    w.u32(0)
    w.u32(0)
  }
  // packet table
  w.chunk('pakt', 24 + table.length)
  w.i64(packets.length)
  w.i64(total) // valid frames (priming and remainder left at 0, as ffmpeg does)
  w.i32(0)
  w.i32(0)
  w.bytes(new Uint8Array(table))
  // audio
  w.chunk('data', 4 + dataBytes)
  w.u32(0) // edit count
  for (const x of packets) w.bytes(x)
  return w.result()
}
