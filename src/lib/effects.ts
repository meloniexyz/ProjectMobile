import { DEFAULT_MOBILE_SETTINGS as DEFAULT_SETTINGS, getSettings, updateSettings, type FxSettings } from './settings'

/**
 * The Speed panel (iPhone; same as the desktop app): playback speed, pitch, "link speed to pitch", "keep across tracks"
 * and reverb. Saved in the settings; player.ts sends them to the native player (modules/negusify-audio).
 * - Linked (default): speed changes pitch like a record (12 semitones per doubling), and moving
 *   either one moves the other.
 * - Not linked: speed keeps the key, and pitch is shifted on its own.
 * - "Keep across tracks" off: speed and pitch go back to normal when a new song starts.
 */

export const RATE_MIN = 0.5
export const RATE_MAX = 2
export const PITCH_MIN = -12
export const PITCH_MAX = 12

export const fxOf = (): FxSettings => ({ ...DEFAULT_SETTINGS.fx, ...getSettings().fx })
const save = (patch: Partial<FxSettings>) => updateSettings({ fx: { ...fxOf(), ...patch } })

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round = (v: number, digits: number) => Number(v.toFixed(digits))
/** the pitch a speed gives on a record, and back */
export const pitchOfRate = (rate: number) => round(12 * Math.log2(rate), 1)
export const rateOfPitch = (pitch: number) => clamp(round(2 ** (pitch / 12), 2), RATE_MIN, RATE_MAX)

export function setRate(v: number) {
  const rate = clamp(round(v, 2), RATE_MIN, RATE_MAX)
  save(fxOf().linked ? { rate, pitch: pitchOfRate(rate) } : { rate })
}

export function setPitch(v: number) {
  const pitch = clamp(round(v, 1), PITCH_MIN, PITCH_MAX)
  save(fxOf().linked ? { pitch, rate: rateOfPitch(pitch) } : { pitch })
}

export function setLinked(linked: boolean) {
  // linking again: the pitch is whatever the speed gives
  save(linked ? { linked, pitch: pitchOfRate(fxOf().rate) } : { linked })
}

export const setKeep = (keep: boolean) => save({ keep })

export function setReverb(on: boolean) {
  // switched on while turned all the way down: start at a level you can hear
  save(on && fxOf().reverbLevel < 0.1 ? { reverb: on, reverbLevel: 0.4 } : { reverb: on })
}

export const setReverbLevel = (v: number) => save({ reverbLevel: clamp(round(v, 2), 0, 1) })

/** A new song starts: unless "Keep across tracks" is on, speed and pitch go back to normal. */
export function newTrack() {
  const fx = fxOf()
  if (!fx.keep && (fx.rate !== 1 || fx.pitch !== 0)) save({ rate: 1, pitch: 0 })
}

/** Anything changed from normal (the button next to EQ lights up). */
export const fxActive = (fx: FxSettings) => Math.abs(fx.rate - 1) > 0.001 || Math.abs(fx.pitch) > 0.01 || fx.reverb
