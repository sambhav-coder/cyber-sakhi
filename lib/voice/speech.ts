/**
 * On-device browser speech (Voice Mode) — Web Speech API.
 *
 * Honest by design:
 *  - STT uses the browser's SpeechRecognition (mic stays in the browser; nothing
 *    is uploaded unless a server STT provider is configured and active).
 *  - TTS uses speechSynthesis with a prefer-Hindi/English voice.
 *  - Every capability is probed; if the browser lacks support, callers get an
 *    explicit error/status instead of a fake recording or fake voice.
 */

export type SakhiVoiceLanguage = "en" | "hi" | "hinglish";

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
}

const noopSession: SttSession = { stop: () => undefined, abort: () => undefined };

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

  recognition.lang = language === "hi" ? "hi-IN" : "en-IN";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event: any) => {
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
    if (final) handlers.onFinal(final);
    if (interim) handlers.onResult(interim);
  };

  recognition.onerror = (event: any) => {
    handlers.onError(
      String(event && event.error ? event.error : "error"),
      "Speech recognition error. You can type your message instead."
    );
  };

  recognition.onend = () => handlers.onEnd();

  try {
    recognition.start();
  } catch {
    handlers.onError("not-allowed", "Microphone access was not granted. You can type instead.");
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch { /* already stopped */ }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch { /* already stopped */ }
    },
  };
}

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

const MARKDOWN_STRIP = /[*_`#>|~]/g;

function stripMarkdown(text: string): string {
  return text.replace(MARKDOWN_STRIP, "").replace(/\n{2,}/g, " ").trim();
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

function pickVoice(lang: SakhiVoiceLanguage, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const langCode = lang === "hi" ? "hi-IN" : "en-IN";
  const exact = voices.find((v) => v.lang === langCode);
  const starts = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(langCode.toLowerCase()));
  return exact || starts || voices.find((v) => v.default) || null;
}

export interface SpeakOptions {
  language: SakhiVoiceLanguage;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export interface SpeakHandle {
  cancel: () => void;
}

export function speakNow(text: string, opts: SpeakOptions): SpeakHandle {
  const cancel: (() => void)[] = [];
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    if (opts.onError) opts.onError("Speech synthesis is not supported in this browser.");
    return { cancel: () => undefined };
  }

  const synth = window.speechSynthesis;
  let active = false;

  const safeCancel = () => {
    try {
      synth.cancel();
    } catch { /* noop */ }
  };

  const speakChunk = (chunk: string) => {
    const u = new SpeechSynthesisUtterance(chunk);
    const voices = synth.getVoices();
    const voice = pickVoice(opts.language, voices);
    if (voice) u.voice = voice;
    u.lang = opts.language === "hi" ? "hi-IN" : "en-IN";
    u.rate = opts.rate ?? 1;
    u.pitch = 1.05;
    u.onstart = () => {
      if (!active) {
        active = true;
        if (opts.onStart) opts.onStart();
      }
    };
    u.onend = () => {
      window.setTimeout(() => {
        if (opts.onEnd) opts.onEnd();
      }, 0);
    };
    u.onerror = () => {
      if (opts.onError) opts.onError("Voice playback stopped (browser error or mute).");
    };
    cancel.push(() => {
      try {
        synth.cancel();
      } catch { /* noop */ }
    });
    synth.speak(u);
  };

  chunksForSpeech(text).forEach(speakChunk);

  return {
    cancel: safeCancel,
  };
}

function chunksForSpeech(text: string): string[] {
  return chunkForSpeech(text);
}