/**
 * Real audio-driven lip-sync math (pure, unit-tested).
 *
 * The avatar's phoneme shapes still come from TalkingHead's G2P viseme
 * queue, but the VISIBLE jaw motion for Edge-TTS playback is driven by the
 * actual audio signal: an AnalyserNode on the playing <audio> element feeds
 * byte time-domain data here every animation frame, and the resulting level
 * writes the `jawOpen` morph target directly. Silence/paused/ended audio
 * yields level 0, so the mouth provably stops when the audio stops —
 * no timers, no guessing.
 */

export const ANALYSER_FFT_SIZE = 512;
/** Levels below this are treated as silence (mic/encoder noise floor). */
export const SILENCE_GATE = 0.02;
/** Maximum jawOpen influence (keeps the motion subtle, never grotesque). */
export const MAX_JAW_OPEN = 0.85;
/** Envelope follower rates per animation frame. */
export const ATTACK_RATE = 0.55;
export const RELEASE_RATE = 0.16;

/** RMS amplitude of getByteTimeDomainData output (values 0..255, center 128). */
export function rmsFromTimeDomain(data: ArrayLike<number>): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

/**
 * One-pole envelope follower: fast attack so the jaw opens the instant
 * speech energy appears, slower release so it closes naturally between
 * words instead of chattering.
 */
export function smoothLevel(
  prev: number,
  target: number,
  attack: number = ATTACK_RATE,
  release: number = RELEASE_RATE
): number {
  if (target >= prev) return prev + (target - prev) * attack;
  return prev + (target - prev) * release;
}

/** Map a smoothed 0..1 level to a jawOpen morph influence (gated). */
export function jawOpenForLevel(level: number): number {
  if (!Number.isFinite(level) || level < SILENCE_GATE) return 0;
  return Math.min(MAX_JAW_OPEN, level * 2.4);
}
