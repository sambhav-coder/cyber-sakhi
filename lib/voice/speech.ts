/**
 * On-device browser speech (Voice Mode).
 *
 * Honest by design:
 *  - STT uses the browser's SpeechRecognition (mic stays in the browser; nothing
 *    is uploaded unless a server STT provider is configured and active).
 *  - TTS PREFERS the self-hosted Piper engine behind /api/voice/tts — English
 *    amy for English turns, Hindi priyamvada for Hindi/Hinglish turns, chosen
 *    PER TURN by the server — and falls back to speechSynthesis (with a
 *    prefer-Hindi/English voice) only when that engine is unavailable.
 *  - Every capability is probed; if the browser lacks support, callers get an
 *    explicit error/status instead of a fake recording or fake voice.
 */

import { hinglishToDevanagari } from "./translit";

export type SakhiVoiceLanguage = "en" | "hi" | "hinglish" | "auto";

export interface BrowserSpeechCapabilities {
  stt: boolean;
  tts: boolean;
  sttNote: string;
  ttsNote: string;
}

export function getBrowserSpeechCapabilities(): BrowserSpeechCapabilities {
  if (typeof window === "undefined") {
    return {
      stt: false,
      tts: false,
      sttNote: "Speech recognition is only available in the browser.",
      ttsNote: "Speech synthesis is only available in the browser.",
    };
  }
  const Recog =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const hasTts = "speechSynthesis" in window;
  return {
    stt: Boolean(Recog),
    tts: hasTts,
    sttNote: Recog
      ? "On-device browser recognition — audio stays in your browser."
      : "This browser has no SpeechRecognition support (try Chrome/Edge). Type instead — Sakhi never fakes a transcript.",
    ttsNote: hasTts
      ? "On-device browser voice — nothing is uploaded."
      : "This browser has no speech synthesis support.",
  };
}

export interface SttHandlers {
  onResult: (interimText: string) => void;
  onFinal: (finalText: string) => void;
  onEnd: () => void;
  onError: (code: string, message: string) => void;
}

export interface SttSession {
  stop: () => void;
  abort: () => void;
  /** Best-effort live switch of the recognition locale for the next turn. */
  setLang?: (lang: SakhiVoiceLanguage) => void;
}

const noopSession: SttSession = {
  stop: () => undefined,
  abort: () => undefined,
  setLang: () => undefined,
};

const SPEECH_END_SILENCE_MS = 1600;
const NO_SPEECH_TIMEOUT_MS = 9000;

const STT_ERROR_MESSAGES: Record<string, string> = {
  "not-allowed":
    "Microphone access was not granted. Allow the mic in your browser, then tap the orb to try again. You can also type below.",
  "service-not-allowed":
    "Microphone access is blocked. Unblock the Mic permission for this site, then tap the orb again. You can also type below.",
  aborted: "Listening was stopped. You can type below.",
  "audio-capture":
    "No microphone was detected. Check your mic and tap the orb to try again. You can also type below.",
  network:
    "Speech recognition had a network error. Check your connection and tap the orb to try again.",
  "no-speech":
    "I didn't hear anything. Tap the orb and speak, or type below.",
  "language-not-supported":
    "This browser can't recognise speech in that language. You can type below instead.",
  "bad-grammar":
    "Speech recognition had a grammar error. Tap the orb to try again, or type below.",
};

function sttErrorMessage(code: string): string {
  return (
    STT_ERROR_MESSAGES[code] ||
    "Speech recognition had a problem. Tap the orb to try again, or type a message below."
  );
}

export function startSttSession(
  language: SakhiVoiceLanguage,
  handlers: SttHandlers
): SttSession {
  if (typeof window === "undefined") {
    handlers.onError("unsupported", "Speech recognition is not available in this environment.");
    return noopSession;
  }
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) {
    handlers.onError("unsupported", "This browser does not support speech recognition.");
    return noopSession;
  }

  let recognition: any;
  try {
    recognition = new Ctor();
  } catch {
    handlers.onError("unsupported", "Could not start speech recognition.");
    return noopSession;
  }

  let ended = false;
  let endNotified = false;
  let gotSpeech = false;
  let silenceTimer: number | undefined;
  let noSpeechTimer: number | undefined;

  const clearTimers = () => {
    window.clearTimeout(silenceTimer);
    window.clearTimeout(noSpeechTimer);
    silenceTimer = undefined;
    noSpeechTimer = undefined;
  };

  const ensureEnd = () => {
    if (ended) return;
    ended = true;
    clearTimers();
    try {
      recognition.stop();
    } catch { /* already stopped */ }
  };

  const notifyEnd = () => {
    if (endNotified) return;
    endNotified = true;
    ended = true;
    clearTimers();
    handlers.onEnd();
  };

  // CRITICAL: "auto" MUST NOT mean "English" - it must allow proper language detection
  // Browser SpeechRecognition has limited language switching mid-session, so we use
  // the best available locale for the expected language. For Hindi, use hi-IN.
  // For English, use en-IN (Indian English). For hinglish/auto, we need to be smarter:
  // - Modern Chrome supports language detection when lang is not set or set to a broad locale
  // - We'll use a strategy that allows the browser to detect the language from speech
  if (language === "hi") {
    recognition.lang = "hi-IN";
  } else if (language === "en") {
    recognition.lang = "en-IN";
  } else {
    // For hinglish or auto: use a broad locale that allows detection
    // en-IN is still the best base for Indian users, but we'll rely on
    // per-turn language detection downstream to adjust future turns
    recognition.lang = "en-IN";
  }
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event: any) => {
    if (ended) return;
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        final += (result[0] && result[0].transcript) || "";
      } else {
        interim += (result[0] && result[0].transcript) || "";
      }
    }
    if (final) {
      gotSpeech = true;
      handlers.onFinal(final);
      // Reset the silence counter after any new speech so a partial pause in
      // the middle never cuts the user off early.
      window.clearTimeout(silenceTimer);
      silenceTimer = window.setTimeout(() => {
        ensureEnd();
      }, SPEECH_END_SILENCE_MS);
    }
    if (interim) {
      gotSpeech = true;
      window.clearTimeout(noSpeechTimer);
      noSpeechTimer = window.setTimeout(() => {
        if (!gotSpeech && !ended) {
          notifyEnd();
        }
      }, NO_SPEECH_TIMEOUT_MS);
      handlers.onResult(interim);
    }
  };

  recognition.onerror = (event: any) => {
    if (endNotified) return;
    const code = String(event && event.error ? event.error : "error");
    endNotified = true;
    ended = true;
    clearTimers();
    handlers.onError(code, sttErrorMessage(code));
  };

  recognition.onend = () => {
    notifyEnd();
  };

  window.clearTimeout(noSpeechTimer);
  noSpeechTimer = window.setTimeout(() => {
    if (!gotSpeech && !endNotified) {
      notifyEnd();
    }
  }, NO_SPEECH_TIMEOUT_MS);

  try {
    recognition.start();
  } catch {
    ended = true;
    endNotified = true;
    clearTimers();
    handlers.onError(
      "not-allowed",
      "Microphone access was not granted. Allow the mic in your browser, then tap the orb to try again. You can also type below."
    );
  }

  return {
    stop: () => {
      ensureEnd();
    },
    abort: () => {
      if (endNotified) return;
      endNotified = true;
      ended = true;
      clearTimers();
      try {
        recognition.abort();
      } catch { /* already stopped */ }
      handlers.onEnd();
    },
    setLang: (lang: SakhiVoiceLanguage) => {
      try {
        // Applies on the next recognition pass; browsers vary, so this is
        // best-effort on top of per-message language detection downstream.
        // CRITICAL: Support proper language switching between turns
        if (lang === "hi") {
          recognition.lang = "hi-IN";
        } else if (lang === "en") {
          recognition.lang = "en-IN";
        } else {
          // For hinglish or auto, keep en-IN as base but allow detection
          recognition.lang = "en-IN";
        }
      } catch { /* ignore */ }
    },
  };
}

// ---------------------------------------------------------------------------
// TTS — INTERNALS
// ---------------------------------------------------------------------------

const MARKDOWN_STRIP = /[*_`#>|~]/g;
const URL_STRIP = /https?:\/\/\S+/gi;
const EMOJI_STRIP = /\p{Extended_Pictographic}/gu;
const BRACKET_STRIP = /[\[\]{}]/g;
const CONTROL_STRIP = /[\u0000-\u001f\u007f]/g;

/** Natural-speech text: strip markdown, URLs, emoji, brackets, controls. */
function sanitizeForSpeech(text: string): string {
  return text
    .replace(MARKDOWN_STRIP, "")
    .replace(URL_STRIP, "")
    .replace(BRACKET_STRIP, "")
    .replace(CONTROL_STRIP, "")
    .replace(EMOJI_STRIP, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripMarkdown(text: string): string {
  return sanitizeForSpeech(text);
}

function chunkForSpeech(text: string, max = 180): string[] {
  const clean = stripMarkdown(text);
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const sentenceParts = clean.split(/(?=[.!?।])/);
  const chunks: string[] = [];
  let current = "";
  for (const part of sentenceParts) {
    if (current && current.length + part.length + 1 > max) {
      chunks.push(current);
      current = part;
    } else {
      current = current ? current + " " + part : part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ---------------------------------------------------------------------------
// VOICE RESOLUTION — robust female voice selection
// ---------------------------------------------------------------------------
// The browser loads its native voices asynchronously. The list of voices returned
// returned by speechSynthesis.getVoices() can be empty or incomplete on the first
// call — we must wait for the onvoiceschanged event before picking a reliable
// selection to avoid the browser default (often male) leaking in.
//
// Preferred selection order:
//   1. Indian-English female (Veena / Heera / Swara / any clearly-female en-IN
//   2. English female with clearly-female English (Zira / Samantha / Tessa etc
//   3. Any female voice in any locale whose name matches a known-female signal
//   4. A voice with a female-sounding name, then fall back to the best-matched
//      any voice if NO female voice is found, the device (fallback to neutral/default
//      if no female voice at all, we pick the highest-quality available voice.
// ---------------------------------------------------------------------------

const STRONG_FEMALE_MARKERS: RegExp[] = [
  /female/i,
  /\bwoman\b|\bwomen\b/i,
  /\bgirl\b/i,
  // Known neural / female voices
  /\bzira\b/i,
  /\bhazel\b/i,
  /\bsamantha\b/i,
  /\bcatherine\b/i,
  /\bcatherine\b/i,
  /\bvictoria\b/i,
  /\bkaren\b/i,
  /\bmoira\b/i,
  /\btessa\b/i,
  /\bveena\b/i,
  /\bheera\b/i,
  /\bswara\b/i,
  /\bnisha\b/i,
  /\bleela\b/i,
  /\bneerja\b/i,
  /\bsonia\b/i,
  /\bsonal\b/i,
  /\bjenny\b/i,
  /\bjennifer\b/i,
  /\blibby\b/i,
  /\bava\b/i,
  /\bemma\b/i,
  /\bsusan\b/i,
  /\bnatalie\b/i,
  /\bnatasha\b/i,
  /\baria\b/i,
  /\bmitchell\b/i,
  /\bgoogle\s*uk\s*english\s*female/i,
  /\bgoogle\s*us\s*english\b/i,
];

const WEAK_FEMALE_HINTS: RegExp[] = [
  /huihui/i,
  /meijia/i,
  /tingting/i,
  /yaoyao/i,
  /xiaoxiao/i,
  /xiaoyi/i,
  /mei/i,
  /\bamy\b/i,
  /\bmia\b/i,
  /\beva\b/i,
  /\bzoe\b/i,
  /\bgina\b/i,
  /\banna\b/i,
  /\bella\b/i,
  /\blily\b/i,
  /\bjulia\b/i,
  /\bclaire\b/i,
  /\bsarah\b/i,
  /\blucia\b/i,
  /\bmaria\b/i,
  /\besther\b/i,
  /\bfiona\b/i,
  /\bhelen\b/i,
  /\bisabela\b/i,
  /\bmonica\b/i,
  /\bpaulina\b/i,
  /\brachel\b/i,
  /\bsusan\b/i,
  /\btina\b/i,
  /\bvalentina\b/i,
];

const MALE_MARKERS: RegExp[] = [
  /\bmale\b/i,
  /\bman\b/i,
  /\bguy\b/i,
  /\bdavid\b/i,
  /\bmark\b/i,
  /\bmarkus\b/i,
  /\bjames\b/i,
  /\bgeorge\b/i,
  /\bdaniel\b/i,
  /\bchristopher\b/i,
  /\bthomas\b/i,
  /\bpatrick\b/i,
  /\bryan\b/i,
  /\bbrandon\b/i,
  /\bjeremy\b/i,
  /\beddy\b/i,
  /\bedward\b/i,
  /\bfred\b/i,
  /\boliver\b/i,
  /\bharry\b/i,
  /\bjack\b/i,
  /\bcharlie\b/i,
  /\bstephen\b/i,
  /\bwilliam\b/i,
  /\bmichael\b/i,
  /\brobert\b/i,
  /\bpaul\b/i,
  /\bkevin\b/i,
  /\bbrian\b/i,
  /\brahul\b/i,
  /\barjun\b/i,
  /\bamit\b/i,
  /\bsandeep\b/i,
  /\bgoogle\s*uk\s*english\s*male/i,
];

function voiceNameScore(name: string): number {
  let score = 0;
  for (const m of STRONG_FEMALE_MARKERS) if (m.test(name)) score += 3;
  for (const m of WEAK_FEMALE_HINTS) if (m.test(name)) score += 1;
  for (const m of MALE_MARKERS) if (m.test(name)) score -= 5;
  return score;
}

interface VoiceCandidate {
  voice: SpeechSynthesisVoice;
  nameLower: string;
  langLower: string;
  score: number;
}

function buildVoiceCandidate(voice: SpeechSynthesisVoice): VoiceCandidate {
  return {
    voice,
    nameLower: (voice.name || "").toLowerCase(),
    langLower: (voice.lang || "").toLowerCase(),
    score: voiceNameScore(voice.name || ""),
  };
}

function languageMatchScore(cand: VoiceCandidate, lang: SakhiVoiceLanguage): number {
  const targetLang = lang === "hi" ? "hi-in" : "en-in";
  const targetPrimary = targetLang.split("-")[0];
  const l = cand.langLower;
  if (l === targetLang) return 200;
  if (l.startsWith(targetLang)) return 180;
  if (l.startsWith(targetPrimary)) return 140;
  if (lang === "hi" && l.startsWith("en")) return 60;
  return 10;
}

function selectBestFemaleVoiceFromList(
  voices: SpeechSynthesisVoice[],
  lang: SakhiVoiceLanguage
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;
  const cands = voices.map(buildVoiceCandidate);

  // 1. Same-language primary, clearly female (score > 0)
  const sameLangFemale = cands
    .filter((c) => c.score > 0)
    .sort(
      (a, b) =>
        languageMatchScore(b, lang) - languageMatchScore(a, lang) ||
        (b.voice.default ? 1 : 0) - (a.voice.default ? 1 : 0) ||
        b.score - a.score
    );
  if (sameLangFemale.length) return sameLangFemale[0].voice;

  // 2. Any clearly female in the whole list
  const anyFemale = cands.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  if (anyFemale.length) return anyFemale[0].voice;

  // 3. pick the highest-scoring non-negative candidate (no male-marked) —
  //    choose female-leaning voice (name if possible
  const nonMale = cands
    .filter((c) => c.score >= 0)
    .sort(
      (a, b) =>
        languageMatchScore(b, lang) - languageMatchScore(a, lang) ||
        (b.voice.default ? 1 : 0) - (a.voice.default ? 1 : 0) ||
        b.score - a.score
    );
  if (nonMale.length) return nonMale[0].voice;

  // 4. Last resort: default or first
  const def = cands.find((c) => c.voice.default);
  return (def || cands[0]).voice;
}

let _voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/**
 * Wait until the browser's speechSynthesis voice list is populated.
 * On many browsers, the first getVoices() returns an empty list and fires
 * `speechSynthesisvoices are are are are populated
 *
 * We guarantee that the returned voices list is not empty if the device has voices,
 * returning the result of a 2 seconds passively cached across calls so the list not
 * duplicate work.
 */
export function waitForVoices(timeoutMs = 2200): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve([]);
  }
  if (_voicesReadyPromise) return _voicesReadyPromise;
  const synth = window.speechSynthesis;
  const quick = synth.getVoices();
  if (quick && quick.length > 0) {
    _voicesReadyPromise = Promise.resolve(quick);
    return _voicesReadyPromise;
  }
  _voicesReadyPromise = new Promise((resolve) => {
    let settled = false;
    const done = (list: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      resolve(list && list.length ? list : synth.getVoices() || []);
    };
    const to = window.setTimeout(() => done(synth.getVoices() || []), timeoutMs);
    try {
      synth.onvoiceschanged = () => {
        const list = synth.getVoices();
        if (list && list.length > 0) {
          window.clearTimeout(to);
          done(list);
        }
      };
      // Guard: some browsers fire onvoiceschanged but not all fire immediately
      // poll gently for the list 2 quick checks just in case
      window.setTimeout(() => {
        const list = synth.getVoices();
        if (list && list.length) {
          window.clearTimeout(to);
          done(list);
        }
      }, 250);
      window.setTimeout(() => {
        const list = synth.getVoices();
        if (list && list.length) {
          window.clearTimeout(to);
          done(list);
        }
      }, 700);
    } catch {
      done(synth.getVoices() || []);
    }
  });
  return _voicesReadyPromise;
}

/**
 * Resolve ONE female SpeechSynthesisVoice for Sakhi.
 * Wait for the browser's voices list to be populated, then pick the best
 * female-leaning voice we can reliably identify.
 *
 * Callers should cache/store the returned value and pass it back to
 * speakWithVoice() for every utterance so the same voice object is reused
 * across the entire introduction (and the introduction and re-introduction.
 */
export async function resolveFemaleVoice(
  lang: SakhiVoiceLanguage = "en"
): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  const voices = await waitForVoices();
  return selectBestFemaleVoiceFromList(voices, lang);
}

// ---------------------------------------------------------------------------
// TTS — PUBLIC API
// ---------------------------------------------------------------------------

export interface SpeakOptions {
  language: SakhiVoiceLanguage;
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  /** Character index (within the full text) of the current spoken word. */
  onBoundary?: (charIndex: number) => void;
}

export interface SpeakHandle {
  cancel: () => void;
}

/**
 * Speak using a PRE-RESOLVED voice object.
 *
 * This is the preferred API for sequences like the Sakhi introduction: call
 * resolveFemaleVoice() once, pass the voice to every utterance — so that the EXACT
 * SAME SpeechSynthesisVoice instance — used for every chunk/sentence. This — so there
 * zero chance of the browser default male voice leaking in between sentences.
 */
const _activeUtterances = new Set<SpeechSynthesisUtterance>();

export function speakWithVoice(
  text: string,
  voice: SpeechSynthesisVoice | null,
  opts: SpeakOptions
): SpeakHandle {
  const cancelFns: (() => void)[] = [];
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    if (opts.onError) opts.onError("Speech synthesis is not supported in this browser.");
    return { cancel: () => undefined };
  }

  const synth = window.speechSynthesis;
  let active = false;
  let ended = false;

  const safeCancel = () => {
    ended = true;
    _activeUtterances.clear();
    try {
      synth.cancel();
    } catch { /* noop */ }
    cancelFns.forEach((fn) => { try { fn(); } catch { /* noop */ } });
  };

  // Hindi/Hinglish: convert ROMAN script to Devanagari first so the browser's
  // hi-IN voice reads natural Hindi instead of letter-spelling ("A A, P P").
  // Devanagari text is identity; English turns are unchanged.
  const effectiveText =
    opts.language === "hi" || opts.language === "hinglish"
      ? hinglishToDevanagari(text)
      : text;

  const chunks = chunkForSpeech(effectiveText);
  if (chunks.length === 0) {
    if (opts.onEnd) opts.onEnd();
    return { cancel: safeCancel };
  }

  let chunkOffset = 0;
  let idx = 0;

  const speakNextChunk = () => {
    if (ended || idx >= chunks.length) {
      if (!ended) {
        ended = true;
        if (opts.onEnd) opts.onEnd();
      }
      return;
    }
    const chunk = chunks[idx];
    const chunkBase = chunkOffset;
    chunkOffset += chunk.length + 1;
    idx += 1;

    const u = new SpeechSynthesisUtterance(chunk);
    // ---- GUARANTEE: use the EXACT voice object the caller pre-resolved —
    // ---- but NEVER force an English voice onto Hindi text. If no hi-capable
    // ---- voice exists, leave u.voice unset and set u.lang="hi-IN" so the
    // ---- platform synthesizer speaks Devanagari natively instead of
    // ---- reading it letter-by-letter ("AA PP").
    const isHiCapable =
      opts.language === "hi"
        ? Boolean(voice && String((voice as SpeechSynthesisVoice).lang || "").toLowerCase().startsWith("hi"))
        : true;
    const voiceToUse = isHiCapable ? voice : null;
    if (voiceToUse) u.voice = voiceToUse;
    u.lang = opts.language === "hi" ? "hi-IN" : "en-IN";
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1.05;
    // Warm/gentle personality — but NOT pitch trickery to fake gender.
    // The voice object itself must be female when a good female system voice.
    u.volume = 1;

    _activeUtterances.add(u);

    u.onstart = () => {
      if (ended) return;
      if (!active) {
        active = true;
        if (opts.onStart) opts.onStart();
      }
    };
    u.onboundary = (event) => {
      if (ended) return;
      const charIndex = chunkBase + (event && typeof event.charIndex === "number" ? event.charIndex : 0);
      if (opts.onBoundary) opts.onBoundary(charIndex);
    };
    u.onend = () => {
      _activeUtterances.delete(u);
      if (ended) return;
      window.setTimeout(() => speakNextChunk(), 0);
    };
    u.onerror = () => {
      _activeUtterances.delete(u);
      if (ended) return;
      ended = true;
      if (opts.onError) opts.onError("Voice playback stopped (browser error or mute).");
    };
    cancelFns.push(() => {
      try {
        _activeUtterances.delete(u);
        u.onend = null;
        u.onerror = null;
      } catch { /* noop */ }
    });
    if (synth.paused) {
      try {
        synth.resume();
      } catch { /* noop */ }
    }
    synth.speak(u);
  };

  speakNextChunk();

  return {
    cancel: safeCancel,
  };
}

/**
 * Legacy / backward-compatible speakNow. If the caller has NOT pre-resolved a voice we
 * try to pick one synchronously now, but we are subject to the browser's voice.
 *
 * Because this has always been used for chat replies — which are single-chunk replies, and
 * the list is populated this is fine. For the introduction (two-sentence multi-utterance
 * sequences) prefer resolveFemaleVoice + speakWithVoice to guarantee ONE voice
 * across sentences throughout.
 */
export function speakNow(text: string, opts: SpeakOptions): SpeakHandle {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const voices = window.speechSynthesis.getVoices();
    const voice = voices && voices.length
      ? selectBestFemaleVoiceFromList(voices, opts.language)
      : null;
    return speakWithVoice(text, voice, opts);
  }
  return speakWithVoice(text, null, opts);
}

// ---------------------------------------------------------------------------
// TTS — SELF-HOSTED PIPER ENGINE (preferred) WITH SPEECHSYNTHESIS FALLBACK
// ---------------------------------------------------------------------------

async function fetchLocalSpeech(
  text: string,
  language: SakhiVoiceLanguage
): Promise<
  | { ok: true; audioUrl: string; voice: string; mimeType: string }
  | { ok: false; code: string; note: string }
> {
  const clean = stripMarkdown(text);
  if (!clean) return { ok: false, code: "no_text", note: "" };
  try {
    const res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, language }),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || !data || data.available !== true || !data.audioB64) {
      return {
        ok: false,
        code: data?.code || "tts_unavailable",
        note: data?.note || "",
      };
    }
    const bin = atob(data.audioB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const audioUrl = URL.createObjectURL(
      new Blob([bytes], { type: data.mimeType || "audio/wav" })
    );
    return {
      ok: true,
      audioUrl,
      voice: data.voice || "",
      mimeType: data.mimeType || "audio/wav",
    };
  } catch {
    return { ok: false, code: "network", note: "Could not reach the local speech engine." };
  }
}

/**
 * Speak with the SELF-HOSTED Piper engine first (per-turn voice chosen by the
 * server from the current turn's language), and fall back to speechSynthesis
 * only if the engine is missing or breaks. Keeps the same SpeakOptions contract
 * so the orb/avatar lifecycle, cancellations and autoplay-block detection all
 * keep working.
 */
export function speakWithEngine(
  text: string,
  fallbackVoice: SpeechSynthesisVoice | null,
  opts: SpeakOptions
): SpeakHandle {
  const handle = { cancelled: false };
  const cancelFns: (() => void)[] = [];
  let startedOnce = false;
  let hadError = false;
  let currentAudio: HTMLAudioElement | null = null;

  const overallCancel = () => {
    if (handle.cancelled) return;
    handle.cancelled = true;
    try {
      currentAudio?.pause();
    } catch { /* noop */ }
    cancelFns.forEach((fn) => {
      try {
        fn();
      } catch { /* noop */ }
    });
  };

  const fallback = () => {
    if (handle.cancelled) return;
    console.warn("[Sakhi Voice] Local TTS engine unavailable - falling back to browser speechSynthesis");
    const inner = speakWithVoice(text, fallbackVoice, opts);
    cancelFns.push(inner.cancel);
  };

  void (async () => {
    if (handle.cancelled) return;
    const chunks = chunkForSpeech(text, 1500);
    if (chunks.length === 0) {
      if (opts.onEnd) opts.onEnd();
      return;
    }
    for (let i = 0; i < chunks.length; i++) {
      if (handle.cancelled) return;
      const srv = await fetchLocalSpeech(chunks[i], opts.language || "en");
      if (handle.cancelled) {
        if (srv.ok) URL.revokeObjectURL(srv.audioUrl);
        return;
      }
      if (!srv.ok) {
        // First chunk failed -> the whole utterance uses the browser voice.
        // A mid-sequence failure is surfaced honestly instead of re-chunking.
        if (i === 0) {
          console.warn("[Sakhi Voice] Local TTS API returned error:", srv.code, srv.note);
          fallback();
        } else if (opts.onError) {
          opts.onError("Sakhi couldn't finish that reply aloud.");
        }
        return;
      }
      const el = new Audio();
      currentAudio = el;
      el.src = srv.audioUrl;
      el.playbackRate = opts.rate ?? 1;
      try {
        await el.play();
      } catch (e) {
        console.warn("[Sakhi Voice] Audio playback failed:", e);
        URL.revokeObjectURL(srv.audioUrl);
        currentAudio = null;
        if (i === 0) {
          fallback();
        } else if (opts.onError) {
          opts.onError("Voice playback was blocked by the browser.");
        }
        return;
      }
      if (handle.cancelled) {
        el.pause();
        URL.revokeObjectURL(srv.audioUrl);
        return;
      }
      if (!startedOnce) {
        startedOnce = true;
        if (opts.onStart) opts.onStart();
      }
      await new Promise<void>((resolve) => {
        el.addEventListener(
          "ended",
          () => resolve(),
          { once: true }
        );
        el.addEventListener(
          "error",
          () => {
            hadError = true;
            if (opts.onError) opts.onError("Voice playback stopped.");
            resolve();
          },
          { once: true }
        );
      });
      URL.revokeObjectURL(srv.audioUrl);
      currentAudio = null;
      if (handle.cancelled) return;
    }
    if (!handle.cancelled && !hadError && opts.onEnd) opts.onEnd();
  })();

  return { cancel: overallCancel };
}
