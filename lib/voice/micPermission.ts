/**
 * Explicit microphone-permission probe for Voice Mode.
 *
 * The STT engine itself is the browser's on-device SpeechRecognition
 * (`lib/voice/speech.ts` `startSttSession` — audio stays in the browser).
 * SpeechRecognition triggers its own mic prompt, but its errors alone cannot
 * distinguish "no microphone", "insecure context", "unsupported API", and
 * "permission denied". This helper runs AFTER an explicit user gesture
 * (orb tap) and BEFORE starting recognition so the UI can show the mandated
 * states: Idle, Requesting Permission, Listening, Recording, Transcribing,
 * Thinking, Speaking, Error.
 *
 * Policy:
 * - Only called from a user gesture. Never on render.
 * - Works on secure contexts (HTTPS / localhost); reports insecure contexts
 *   with a clear error instead of a silent failure.
 * - Requests a short-lived audio stream and IMMEDIATELY stops every track so
 *   no duplicate streams leak and nothing is recorded or uploaded.
 * - Never fabricates transcripts. Never exposes secrets.
 * - Callers must stop the returned stream's tracks when done; `releaseMicProbe`
 *   does this defensively as well.
 */

export type MicPermissionOutcome =
  | { ok: true; stream: MediaStream }
  | { ok: false; code: MicPermissionErrorCode; message: string };

export type MicPermissionErrorCode =
  | "unsupported"
  | "insecure-context"
  | "permission-denied"
  | "no-microphone"
  | "not-readable"
  | "empty-recording";

export const MIC_PERMISSION_MESSAGES: Record<MicPermissionErrorCode, string> = {
  "unsupported":
    "This browser cannot access the microphone here. Use Chrome or Edge on HTTPS or localhost — or type below.",
  "insecure-context":
    "Microphone access needs a secure context (HTTPS or localhost). You are on an insecure origin, so the mic is blocked — please type instead or open the secure URL.",
  "permission-denied":
    "Microphone access was not granted. Allow the mic for this site in your browser, then tap the orb to try again. You can also type below.",
  "no-microphone":
    "No microphone was detected. Check your mic is plugged in and enabled, then tap the orb to try again. You can also type below.",
  "not-readable":
    "The microphone is busy or unreadable (another app may be using it). Close other recorders and tap the orb to try again.",
  "empty-recording":
    "The microphone opened but captured no audio. Check the mic volume and try again, or type below.",
};

function isSecureContextOk(): boolean {
  if (typeof window === "undefined") return false;
  // `window.isSecureContext` is the authoritative signal (true for
  // HTTPS + localhost, including `http://localhost`).
  if (typeof window.isSecureContext === "boolean") return window.isSecureContext;
  const host = window.location?.hostname || "";
  return (
    window.location?.protocol === "https:" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]"
  );
}

/**
 * Request mic permission after an explicit user gesture. Resolves with a
 * live (briefly) stream on success — the caller MUST call `releaseMicProbe`
 * (or stop tracks directly) once permission state is known.
 */
export async function requestMicrophonePermission(
  timeoutMs = 12000
): Promise<MicPermissionOutcome> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { ok: false, code: "unsupported", message: MIC_PERMISSION_MESSAGES["unsupported"] };
  }
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    return { ok: false, code: "unsupported", message: MIC_PERMISSION_MESSAGES["unsupported"] };
  }
  if (!isSecureContextOk()) {
    return {
      ok: false,
      code: "insecure-context",
      message: MIC_PERMISSION_MESSAGES["insecure-context"],
    };
  }

  let stream: MediaStream | null = null;
  try {
    const request = mediaDevices.getUserMedia({ audio: true });
    const timeout = new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new DOMException("Timed out", "TimeoutError")), timeoutMs)
    );
    stream = (await Promise.race([request, timeout])) as MediaStream;
  } catch (err) {
    const name = err instanceof DOMException ? err.name : (err as Error)?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { ok: false, code: "permission-denied", message: MIC_PERMISSION_MESSAGES["permission-denied"] };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return { ok: false, code: "no-microphone", message: MIC_PERMISSION_MESSAGES["no-microphone"] };
    }
    if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
      return { ok: false, code: "not-readable", message: MIC_PERMISSION_MESSAGES["not-readable"] };
    }
    if (name === "OverconstrainedError") {
      return { ok: false, code: "no-microphone", message: MIC_PERMISSION_MESSAGES["no-microphone"] };
    }
    return { ok: false, code: "not-readable", message: MIC_PERMISSION_MESSAGES["not-readable"] };
  }

  // Sanity: a stream with zero live audio tracks is an empty capture.
  try {
    const tracks = stream.getAudioTracks();
    if (!tracks.length || tracks.every((t) => t.readyState === "ended" || t.muted)) {
      releaseMicProbe(stream);
      return { ok: false, code: "empty-recording", message: MIC_PERMISSION_MESSAGES["empty-recording"] };
    }
  } catch {
    releaseMicProbe(stream);
    return { ok: false, code: "empty-recording", message: MIC_PERMISSION_MESSAGES["empty-recording"] };
  }

  return { ok: true, stream };
}

/** Stop every track of a permission-probe stream. Safe to call twice. */
export function releaseMicProbe(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* noop */
      }
    });
  } catch {
    /* noop */
  }
}
