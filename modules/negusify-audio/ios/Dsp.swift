import AVFoundation
import Foundation
import MediaToolbox
import os

/// One EQ filter, described the same way as a Web Audio BiquadFilterNode (so the desktop
/// app's EQ curves sound identical here).
struct FilterSpec {
  enum Kind { case peaking, lowshelf, highshelf }
  let kind: Kind
  let freq: Double
  let q: Double
  let gainDb: Double
}

/// Normalized biquad coefficients (a0 = 1).
struct Biquad {
  var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0

  /// Web Audio's formulas (Audio EQ Cookbook; shelves use slope S = 1 and ignore Q).
  static func make(_ f: FilterSpec, sampleRate: Double) -> Biquad {
    let nyquist = sampleRate / 2
    let freq = min(max(f.freq, 10), nyquist * 0.999)
    let A = pow(10, f.gainDb / 40)
    let w0 = 2 * Double.pi * freq / sampleRate
    let cw = cos(w0)
    let sw = sin(w0)
    var b0 = 1.0, b1 = 0.0, b2 = 0.0, a0 = 1.0, a1 = 0.0, a2 = 0.0
    switch f.kind {
    case .peaking:
      let alpha = sw / (2 * max(f.q, 0.0001))
      b0 = 1 + alpha * A
      b1 = -2 * cw
      b2 = 1 - alpha * A
      a0 = 1 + alpha / A
      a1 = -2 * cw
      a2 = 1 - alpha / A
    case .lowshelf:
      let alpha = sw / 2 * sqrt(2.0)
      let k = 2 * sqrt(A) * alpha
      b0 = A * ((A + 1) - (A - 1) * cw + k)
      b1 = 2 * A * ((A - 1) - (A + 1) * cw)
      b2 = A * ((A + 1) - (A - 1) * cw - k)
      a0 = (A + 1) + (A - 1) * cw + k
      a1 = -2 * ((A - 1) + (A + 1) * cw)
      a2 = (A + 1) + (A - 1) * cw - k
    case .highshelf:
      let alpha = sw / 2 * sqrt(2.0)
      let k = 2 * sqrt(A) * alpha
      b0 = A * ((A + 1) + (A - 1) * cw + k)
      b1 = -2 * A * ((A - 1) + (A + 1) * cw)
      b2 = A * ((A + 1) + (A - 1) * cw - k)
      a0 = (A + 1) - (A - 1) * cw + k
      a1 = 2 * ((A - 1) - (A + 1) * cw)
      a2 = (A + 1) - (A - 1) * cw - k
    }
    return Biquad(b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0)
  }
}

/// Settings shared by every playing item: EQ filters, leveling target and on/off.
/// Written from the main thread, read (as a snapshot) from the audio thread.
final class DspParams {
  private var lock = os_unfair_lock()
  private var filters: [FilterSpec] = []
  private var eqPeakRiseDb = 0.0
  private var normalize = true
  private var offsetDb = 0.0
  private var pitch = 0.0
  private var reverbOn = false
  private var reverbLevel = 0.35
  private var version = 1

  struct Snapshot {
    let version: Int
    let filters: [FilterSpec]
    let eqPeakRiseDb: Double
    let normalize: Bool
    let offsetDb: Double
    /// semitones to shift without changing speed (0: off)
    let pitch: Double
    let reverbOn: Bool
    let reverbLevel: Double
  }

  /// The Speed panel: pitch shift (semitones) and reverb (0...1).
  func setEffects(pitch p: Double, reverbOn r: Bool, reverbLevel l: Double) {
    os_unfair_lock_lock(&lock)
    pitch = p
    reverbOn = r
    reverbLevel = l
    version += 1
    os_unfair_lock_unlock(&lock)
  }

  func setEq(_ f: [FilterSpec], peakRiseDb: Double) {
    os_unfair_lock_lock(&lock)
    filters = f
    eqPeakRiseDb = peakRiseDb
    version += 1
    os_unfair_lock_unlock(&lock)
  }

  func setLevel(normalize n: Bool, offsetDb o: Double) {
    os_unfair_lock_lock(&lock)
    normalize = n
    offsetDb = o
    version += 1
    os_unfair_lock_unlock(&lock)
  }

  var currentVersion: Int {
    os_unfair_lock_lock(&lock)
    defer { os_unfair_lock_unlock(&lock) }
    return version
  }

  func snapshot() -> Snapshot {
    os_unfair_lock_lock(&lock)
    defer { os_unfair_lock_unlock(&lock) }
    return Snapshot(
      version: version, filters: filters, eqPeakRiseDb: eqPeakRiseDb, normalize: normalize, offsetDb: offsetDb,
      pitch: pitch, reverbOn: reverbOn, reverbLevel: reverbLevel)
  }
}

/// Per-item processing state: filter memory, the song's own leveling gain and the limiter.
final class TapContext {
  let params: DspParams
  /// gain (dB) that brings this song to the reference loudness
  var trackGainDb: Double

  private var sampleRate = 44100.0
  private var channels = 2
  private var interleaved = false
  private var isFloat = true
  private var version = -1
  private var coeffs: [Biquad] = []
  /// filter memory, flat: [channel][filter][z1, z2]
  private var z: [Double] = []
  private var gain: Float = 1
  private var targetGain: Float = 1
  private var limiterOn = false
  private var env: Float = 1
  private var release: Float = 0.001
  /// pitch shift and reverb, before the EQ (same order as the desktop app)
  private let fx = Effects()

  init(params: DspParams, trackGainDb: Double) {
    self.params = params
    self.trackGainDb = trackGainDb
  }

  func prepare(_ format: AudioStreamBasicDescription) {
    sampleRate = format.mSampleRate > 0 ? format.mSampleRate : 44100
    channels = max(1, Int(format.mChannelsPerFrame))
    interleaved = (format.mFormatFlags & kAudioFormatFlagIsNonInterleaved) == 0 && channels > 1
    isFloat = (format.mFormatFlags & kAudioFormatFlagIsFloat) != 0 && format.mBitsPerChannel == 32
    // 60 ms release: quick enough that a boost stays audible, slow enough not to distort
    release = Float(1 - exp(-1 / (0.06 * sampleRate)))
    fx.prepare(sampleRate: sampleRate, channels: channels)
    version = -1
  }

  private func refresh() {
    let s = params.snapshot()
    if s.version == version { return }
    let changedFilters = coeffs.count != s.filters.count
    coeffs = s.filters.map { Biquad.make($0, sampleRate: sampleRate) }
    if changedFilters || z.count != channels * coeffs.count * 2 {
      z = Array(repeating: 0, count: channels * coeffs.count * 2)
    }
    let levelDb = s.normalize ? trackGainDb + s.offsetDb : 0
    targetGain = Float(pow(10, levelDb / 20))
    if version == -1 { gain = targetGain } // first buffer: start at the right level
    // limiter only when something can push peaks above the original
    limiterOn = levelDb + max(0, s.eqPeakRiseDb) > 0.5
    fx.set(pitch: s.pitch, reverbOn: s.reverbOn, level: s.reverbLevel)
    version = s.version
  }

  func process(_ abl: UnsafeMutableAudioBufferListPointer, frames: Int) {
    guard isFloat, frames > 0 else { return }
    refresh()
    coeffs.withUnsafeBufferPointer { cp in
      z.withUnsafeMutableBufferPointer { zp in
        run(abl, frames: frames, cp: cp, zp: zp)
      }
    }
  }

  private func run(
    _ abl: UnsafeMutableAudioBufferListPointer, frames: Int,
    cp: UnsafeBufferPointer<Biquad>, zp: UnsafeMutableBufferPointer<Double>
  ) {
    let nFilters = coeffs.count
    let startGain = gain
    let step = (targetGain - startGain) / Float(frames)
    let threshold: Float = 0.944 // -0.5 dBFS

    if interleaved {
      guard let data = abl[0].mData?.assumingMemoryBound(to: Float.self) else { return }
      let effects = fx.active
      for i in 0..<frames {
        let g = startGain + step * Float(i)
        var peak: Float = 0
        if effects { fx.tick() }
        for c in 0..<channels {
          var x = Double(effects ? fx.process(data[i * channels + c], c) : data[i * channels + c])
          if nFilters > 0 { x = Self.filter(x, base: c * nFilters * 2, cp: cp, zp: zp) }
          let y = Float(x) * g
          data[i * channels + c] = y
          peak = max(peak, abs(y))
        }
        if limiterOn {
          let want: Float = peak > threshold ? threshold / peak : 1
          if want < env { env = want } else { env += (1 - env) * release }
          if env < 0.9999 { for c in 0..<channels { data[i * channels + c] *= env } }
        }
      }
    } else {
      let count = min(channels, abl.count)
      var ptrs: [UnsafeMutablePointer<Float>] = []
      for c in 0..<count {
        guard let p = abl[c].mData?.assumingMemoryBound(to: Float.self) else { return }
        ptrs.append(p)
      }
      let effects = fx.active
      for i in 0..<frames {
        let g = startGain + step * Float(i)
        var peak: Float = 0
        if effects { fx.tick() }
        for c in 0..<count {
          var x = Double(effects ? fx.process(ptrs[c][i], c) : ptrs[c][i])
          if nFilters > 0 { x = Self.filter(x, base: c * nFilters * 2, cp: cp, zp: zp) }
          let y = Float(x) * g
          ptrs[c][i] = y
          peak = max(peak, abs(y))
        }
        if limiterOn {
          let want: Float = peak > threshold ? threshold / peak : 1
          if want < env { env = want } else { env += (1 - env) * release }
          if env < 0.9999 { for c in 0..<count { ptrs[c][i] *= env } }
        }
      }
    }
    gain = targetGain
  }

  /// Runs one sample through the filter chain (transposed direct form II).
  @inline(__always) private static func filter(
    _ input: Double, base: Int, cp: UnsafeBufferPointer<Biquad>, zp: UnsafeMutableBufferPointer<Double>
  ) -> Double {
    var x = input
    var i = base
    for k in cp {
      let y = k.b0 * x + zp[i]
      zp[i] = k.b1 * x - k.a1 * y + zp[i + 1]
      zp[i + 1] = k.b2 * x - k.a2 * y
      x = y
      i += 2
    }
    return x
  }
}

// MARK: - Speed panel effects: pitch shift and reverb

/**
 Pitch without changing speed, and reverb (the Speed panel), run on every sample before the EQ.
 - Pitch: the desktop app's two-tap delay-line shifter. Two read heads sweep through an 80 ms
   delay (a delay that keeps growing plays lower, one that keeps shrinking plays higher), half a
   sweep apart; one is heard at a time, with a 15% crossfade at each handover.
 - Reverb: Freeverb-style (six damped combs, three allpasses), tuned to the desktop reverb's
   2.6 s tail and loudness, its bass removed above the low end (120 Hz high-pass).
 Changes glide over ~20 ms; the reverb keeps ringing out after it's switched off.
 */
final class Effects {
  private static let window = 0.08 // seconds
  private static let fade = 0.15 // part of each sweep spent crossfading
  /// wet level that matches the desktop reverb at the same setting
  private static let wetScale: Float = 1.5

  private var sampleRate = 44100.0
  private var shifters: [Shifter] = []
  private var reverbs: [Reverb] = []
  private var windowSamples = 3528.0
  private var phase = 0.0
  private var phaseStep = 0.0
  private var up = true
  private var mix: Float = 0
  private var mixTarget: Float = 0
  private var wet: Float = 0
  private var wetTarget: Float = 0
  private var glide: Float = 0.001

  /// anything to do (on, or still fading out / ringing)
  var active: Bool { mixTarget > 0 || mix > 0.0001 || wetTarget > 0 || wet > 0.0001 }

  func prepare(sampleRate sr: Double, channels: Int) {
    sampleRate = sr
    windowSamples = Effects.window * sr
    let size = Int(windowSamples) + 8
    shifters = (0..<channels).map { _ in Shifter(size: size) }
    reverbs = (0..<channels).map { Reverb(sampleRate: sr, spread: $0 == 0 ? 0 : 23) }
    glide = Float(1 - exp(-1 / (0.02 * sr)))
  }

  func set(pitch: Double, reverbOn: Bool, level: Double) {
    if abs(pitch) < 0.02 {
      mixTarget = 0
    } else {
      let ratio = pow(2.0, pitch / 12)
      up = ratio > 1
      // the delay moves through the window at |1 - ratio| seconds per second
      phaseStep = abs(1 - ratio) / windowSamples
      mixTarget = 1
    }
    wetTarget = reverbOn ? Float(max(0, min(1, level))) * Effects.wetScale : 0
  }

  /// once per frame, before its channels
  @inline(__always) func tick() {
    mix += (mixTarget - mix) * glide
    wet += (wetTarget - wet) * glide
    phase += phaseStep
    if phase >= 1 { phase -= 1 }
  }

  @inline(__always) func process(_ x: Float, _ c: Int) -> Float {
    guard c < shifters.count else { return x }
    var y = x
    if mixTarget > 0 || mix > 0.0001 {
      let shifted = shifters[c].process(x, phase: phase, up: up, window: windowSamples)
      y = x * (1 - mix) + shifted * mix
    }
    if wetTarget > 0 || wet > 0.0001 {
      y += reverbs[c].process(y) * wet
    }
    return y
  }

  /// in over the first part of a sweep, held, out after half way (when the other head comes in)
  @inline(__always) static func envelope(_ x: Double) -> Float {
    if x < fade { return Float(pow(sin(Double.pi / 2 * (x / fade)), 2)) }
    if x < 0.5 { return 1 }
    if x < 0.5 + fade { return Float(pow(cos(Double.pi / 2 * ((x - 0.5) / fade)), 2)) }
    return 0
  }
}

/// One channel's delay line for the pitch shifter.
struct Shifter {
  private var buf: [Float]
  private var w = 0

  init(size: Int) { buf = [Float](repeating: 0, count: size) }

  mutating func process(_ x: Float, phase: Double, up: Bool, window: Double) -> Float {
    let n = buf.count
    buf[w] = x
    var out: Float = 0
    for k in 0..<2 {
      var ph = phase + Double(k) * 0.5
      if ph >= 1 { ph -= 1 }
      let delay = 2 + window * (up ? 1 - ph : ph) // samples
      var pos = Double(w) - delay
      if pos < 0 { pos += Double(n) }
      let i0 = Int(pos) % n
      let f = Float(pos - Double(Int(pos)))
      let i1 = (i0 + 1) % n
      out += Effects.envelope(ph) * (buf[i0] * (1 - f) + buf[i1] * f)
    }
    w += 1
    if w == n { w = 0 }
    return out
  }
}

/// One channel of the Freeverb-style reverb (the right channel's delays are a little longer, for width).
struct Reverb {
  private static let combTunings = [1116, 1188, 1277, 1356, 1422, 1491] // at 44.1 kHz
  private static let allpassTunings = [556, 441, 341]
  private static let feedback: Float = 0.935
  private static let damp: Float = 0.3

  private var combs: [[Float]]
  private var combIdx: [Int]
  private var combStore: [Float]
  private var alls: [[Float]]
  private var allIdx: [Int]
  private var hpX: Float = 0
  private var hpY: Float = 0
  private let hpA: Float

  init(sampleRate: Double, spread: Int) {
    let scale = sampleRate / 44100
    combs = Reverb.combTunings.map { [Float](repeating: 0, count: max(1, Int(Double($0 + spread) * scale))) }
    combIdx = [Int](repeating: 0, count: Reverb.combTunings.count)
    combStore = [Float](repeating: 0, count: Reverb.combTunings.count)
    alls = Reverb.allpassTunings.map { [Float](repeating: 0, count: max(1, Int(Double($0 + spread) * scale))) }
    allIdx = [Int](repeating: 0, count: Reverb.allpassTunings.count)
    hpA = Float(exp(-2 * Double.pi * 120 / sampleRate))
  }

  mutating func process(_ x: Float) -> Float {
    let input = x * 0.015
    var out: Float = 0
    for k in 0..<combs.count {
      let i = combIdx[k]
      let y = combs[k][i]
      combStore[k] = y * (1 - Reverb.damp) + combStore[k] * Reverb.damp
      combs[k][i] = input + combStore[k] * Reverb.feedback
      combIdx[k] = i + 1 == combs[k].count ? 0 : i + 1
      out += y
    }
    for k in 0..<alls.count {
      let i = allIdx[k]
      let b = alls[k][i]
      let y = -out + b
      alls[k][i] = out + b * 0.5
      allIdx[k] = i + 1 == alls[k].count ? 0 : i + 1
      out = y
    }
    // keep the low end clean: high-pass the reverb at 120 Hz
    let hp = hpA * (hpY + out - hpX)
    hpX = out
    hpY = hp
    return hp
  }
}

// MARK: - MTAudioProcessingTap glue (C callbacks)

private let tapInit: MTAudioProcessingTapInitCallback = { _, clientInfo, tapStorageOut in
  tapStorageOut.pointee = clientInfo
}

private let tapFinalize: MTAudioProcessingTapFinalizeCallback = { tap in
  Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).release()
}

private let tapPrepare: MTAudioProcessingTapPrepareCallback = { tap, _, format in
  let ctx = Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
  ctx.prepare(format.pointee)
}

private let tapUnprepare: MTAudioProcessingTapUnprepareCallback = { _ in }

private let tapProcess: MTAudioProcessingTapProcessCallback = { tap, numberFrames, _, bufferListInOut, numberFramesOut, flagsOut in
  let status = MTAudioProcessingTapGetSourceAudio(tap, numberFrames, bufferListInOut, flagsOut, nil, numberFramesOut)
  if status != noErr { return }
  let ctx = Unmanaged<TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
  ctx.process(UnsafeMutableAudioBufferListPointer(bufferListInOut), frames: Int(numberFramesOut.pointee))
}

/// An audio mix that runs the item's audio through our EQ / leveling / limiter.
func makeAudioMix(track: AVAssetTrack, context: TapContext) -> AVAudioMix? {
  var callbacks = MTAudioProcessingTapCallbacks(
    version: kMTAudioProcessingTapCallbacksVersion_0,
    clientInfo: UnsafeMutableRawPointer(Unmanaged.passRetained(context).toOpaque()),
    init: tapInit,
    finalize: tapFinalize,
    prepare: tapPrepare,
    unprepare: tapUnprepare,
    process: tapProcess
  )
  var tap: MTAudioProcessingTap?
  let status = MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks, kMTAudioProcessingTapCreationFlag_PostEffects, &tap)
  guard status == noErr, let tap else {
    Unmanaged<TapContext>.fromOpaque(callbacks.clientInfo!).release()
    return nil
  }
  let input = AVMutableAudioMixInputParameters(track: track)
  input.audioTapProcessor = tap
  let mix = AVMutableAudioMix()
  mix.inputParameters = [input]
  return mix
}
