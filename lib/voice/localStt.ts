/**
 * Local on-device speech session for Voice Mode (fallback path).
 *
 * Captures mic audio as PCM16 @ 16 kHz mono, waits for a natural pause,
 * auto-stops, streams growing "partial" transcripts for a live feel, then
 * sends the final WAV to /api/voice/stt. That route runs the LOCAL Vosk engine
 * (free, off-line, no Gemini, no cloud). This file only runs in the browser.
 */

export interface LocalSttHandlers {
  /** Live microphone level (0..1) so the orb can pulse. */
  onLevel?: (rms: number) => void;
  /** Growing transcript while the user is still speaking. */
  onInterim?: (text: string) => void;
  /** Final recognized text for exactly ONE dialog turn. */
  onFinal: (text: string) => void;
  /** Codes: mic_not_available | mic_denied | no_speech | stt_unavailable | stt_error */
  onError: (code: string, message: string) => void;
  /** Fired once after final/abort/error — recording fully torn down. */
  onEnd: () => void;
}

export interface LocalSttSession {
  /** Commit what was captured (tap again / pause already commits). */
  stop: () => void;
  /** Discard this capture without transcribing. */
  abort: () => void;
}

const SAMPLE_RATE = 16000;
const SILENCE_MS = 1500;
const MAX_SPEECH_MS = 15_000;
const START_TIMEOUT_MS = 8_000;
const PARTIAL_INTERVAL_MS = 900;
const VOICE_RMS_THRESHOLD = 0.008;

/** WAV (PCM16 mono) of the given Float32 mono samples. */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);
  let offset = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

/** Resample a stereo/mono buffer to mono 16 kHz via linear interpolation. */
function toMono16k(
  channels: Float32Array[],
  inRate: number,
  outRate: number
): Float32Array {
  const mixes: Float32Array[] = channels.length
    ? channels
    : [new Float32Array(0)];
  const mix = mixes.length === 1 ? mixes[0] : new Float32Array(mixes[0].length);
  if (mixes.length > 1) {
    for (let i = 0; i < mix.length; i++) {
      let sum = 0;
      for (const ch of mixes) sum += ch[i];
      mix[i] = sum / mixes.length;
    }
  }
  if (inRate === outRate || mix.length === 0) return mix;
  const nOut = Math.max(1, Math.round((mix.length * outRate) / inRate));
  const out = new Float32Array(nOut);
  const ratio = (mix.length - 1) / Math.max(1, nOut - 1);
  for (let i = 0; i < nOut; i++) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, mix.length - 1);
    const frac = pos - lo;
    out[i] = mix[lo] + (mix[hi] - mix[lo]) * frac;
  }
  return out;
}

function rms(buf: Float32Array): number {
  if (!buf.length) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function b64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function transcribe(audioB64: string, language: string): Promise<string> {
  const res = await fetch("/api/voice/stt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioB64, language }),
  });
  if (!res.ok) throw new Error(`stt_http_${res.status}`);
  const data = (await res.json()) as { transcript?: string };
  return String(data.transcript || "").trim();
}

/**
 * Acquire the mic with a graceful constraint ladder. Some microphones/drivers
 * reject the full "echo-cancellation + noise-suppression + auto-gain" combo
 * with an OverconstrainedError; we fall back to progressively simpler audio
 * constraints instead of failing the voice turn.
 */
async function acquireMic(): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== "function") {
    throw new Error("mic_api_missing");
  }
  const attempts: MediaStreamConstraints[] = [
    {
      audio: {
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    },
    { audio: { echoCancellation: true, noiseSuppression: true } },
    { audio: { channelCount: { ideal: 1 } } },
    { audio: true },
  ];
  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      return await md.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError === null
    ? new Error("mic_denied")
    : (lastError as Error);
}

export function startLocalSttRecording(
  language: "en" | "hi" | "hinglish" | "auto",
  handlers: LocalSttHandlers
): LocalSttSession {
  const onLevel = handlers.onLevel;
  const onInterim = handlers.onInterim;

  let ctx: AudioContext | null = null;
  let track: MediaStreamTrack | null = null;
  let node: ScriptProcessorNode | null = null;
  let streamsOn = true;
  let finished = false;
  let speechSeen = false;
  let lastLoudAt = 0;
  let audioStartAt = 0;
  let maxBy = 0;
  let startTimer: number | undefined;
  let partialTimer: number | undefined;
  let partialPending = false;
  let lastPartial = "";

  const chunks: Float32Array[] = [];
  let fmtTotal = 0;
  let captureRate = SAMPLE_RATE;

  function allSamples(): Float32Array {
    const out = new Float32Array(fmtTotal);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  function encodeCurrent(): string {
    const mono = toMono16k([allSamples()], captureRate, SAMPLE_RATE);
    return b64(encodeWav(mono, SAMPLE_RATE));
  }

  function teardown() {
    streamsOn = false;
    if (partialTimer !== undefined) window.clearInterval(partialTimer);
    if (startTimer !== undefined) window.clearTimeout(startTimer);
    try {
      node?.disconnect();
    } catch {
      /* noop */
    }
    try {
      track?.stop();
    } catch {
      /* noop */
    }
    track = null;
    node = null;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {});
    }
    ctx = null;
  }

  function finish() {
    if (finished) return;
    finished = true;
    teardown();
    const audioB64 = encodeCurrent();
    transcribe(audioB64, language)
      .then((text) => {
        if (!text) {
          handlers.onError(
            "no_speech",
            "I couldn't hear anything — try speaking a bit louder."
          );
        } else {
          handlers.onFinal(text);
        }
      })
      .catch(() => {
        handlers.onError(
          "stt_unavailable",
          "My on-device speech engine is unavailable right now."
        );
      })
      .finally(() => handlers.onEnd());
  }

  function stop() {
    finish();
  }

  function abort() {
    if (finished) return;
    finished = true;
    teardown();
    handlers.onEnd();
  }

  async function start() {
    if (finished) return;
    let stream: MediaStream;
    try {
      stream = await acquireMic();
    } catch {
      handlers.onError(
        "mic_denied",
        "Microphone access was denied or unavailable. You can type instead."
      );
      handlers.onEnd();
      return;
    }
    if (finished) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    track = stream.getAudioTracks()[0] || null;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      stream.getTracks().forEach((t) => t.stop());
      handlers.onError(
        "stt_unavailable",
        "This browser cannot record audio. You can type instead."
      );
      handlers.onEnd();
      return;
    }
    try {
      ctx = new Ctor();
    } catch {
      ctx = null as unknown as AudioContext;
    }
    if (!ctx) {
      stream.getTracks().forEach((t) => t.stop());
      handlers.onError(
        "stt_unavailable",
        "This browser cannot record audio. You can type instead."
      );
      handlers.onEnd();
      return;
    }

    ctx.resume().catch(() => {});
    captureRate = ctx.sampleRate || SAMPLE_RATE;
    maxBy = Date.now() + MAX_SPEECH_MS;
    const source = ctx.createMediaStreamSource(stream);
    node = ctx.createScriptProcessor(2048, 2, 2);
    node.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!streamsOn || finished) return;
      const left = e.inputBuffer.getChannelData(0);
      const right = e.inputBuffer.getChannelData(1);
      const mono = right && right.length ? new Float32Array(left.length) : left;
      if (right && right.length) {
        for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) / 2;
      }
      const now = Date.now();
      const lvl = rms(mono);
      onLevel?.(Math.min(1, lvl * 25));
      chunks.push(mono);
      fmtTotal += mono.length;
      if (!audioStartAt) audioStartAt = now;
      if (maxBy && now >= maxBy) {
        finish();
        return;
      }
      if (lvl > VOICE_RMS_THRESHOLD) {
        speechSeen = true;
        lastLoudAt = now;
      } else if (speechSeen && now - lastLoudAt >= SILENCE_MS) {
        finish();
      }
    };
    source.connect(node);
    node.connect(ctx.destination);

    audioStartAt = Date.now();
    startTimer = window.setTimeout(() => {
      if (streamsOn && !speechSeen && !finished) {
        abort();
        handlers.onError(
          "no_speech",
          "I didn't hear speech — tap the orb when you're ready to talk."
        );
      }
    }, START_TIMEOUT_MS);

    partialTimer = window.setInterval(() => {
      if (!streamsOn || finished || partialPending || !speechSeen) return;
      if (Date.now() - lastLoudAt >= SILENCE_MS) return; // pending auto-stop
      partialPending = true;
      const audioB64 = encodeCurrent();
      transcribe(audioB64, language)
        .then((text) => {
          if (text && text !== lastPartial) {
            lastPartial = text;
            onInterim?.(text);
          }
        })
        .catch(() => {})
        .finally(() => {
          partialPending = false;
        });
    }, PARTIAL_INTERVAL_MS);
  }

  void start();

  return { stop, abort };
}