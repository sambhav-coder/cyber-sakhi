/**
 * Self-hosted local TTS — Piper (piper-tts 1.8.0, GPL-3.0) sidecar manager.
 *
 * Server-only. Spawns and keeps warm a small Python engine on 127.0.0.1 that
 * synthesizes Hindi/Hinglish (hi_IN-priyamvada-medium) and English
 * (en_GB-aru-medium) voices into WAV frames. No cloud, no API keys, no
 * telemetry; the model files live in models/piper and the Python runtime in
 * .piper-venv (both gitignored).
 *
 * Voice choice is PER TURN and decided here from the detected language:
 *   en       -> en_GB-aru-medium
 *   hi       -> hi_IN-priyamvada-medium
 *   hinglish -> hi_IN-priyamvada-medium (code-mixed output from the Hindi voice)
 *
 * The same sidecar also hosts local OFF-LINE speech-to-text via Vosk
 * (Apache-2.0). No cloud, no Gemini calls, no network — audio never leaves
 * this machine.
 */

import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { hinglishToDevanagari } from "./translit";

export type LocalVoiceLanguage = "en" | "hi" | "hinglish" | "auto";

interface PiperRuntime {
  child: ChildProcess;
}

const VOICE_BY_LANGUAGE: Record<string, string> = {
  en: "en_GB-aru-medium",
  hi: "hi_IN-priyamvada-medium",
  hinglish: "hi_IN-priyamvada-medium",
};

function projectRoot(): string {
  return process.cwd();
}

function pythonExe(): string {
  const fromEnv = process.env.SAKHI_TTS_PYTHON?.trim();
  if (fromEnv) return fromEnv;
  return path.join(projectRoot(), ".piper-venv", "Scripts", "python.exe");
}

function sidecarScript(): string {
  return path.join(projectRoot(), "scripts", "piper_sidecar.py");
}

function modelsDir(): string {
  return process.env.SAKHI_TTS_MODELS_DIR?.trim() || path.join(projectRoot(), "models", "piper");
}

function voskModelsDir(): string {
  return process.env.SAKHI_STT_MODELS_DIR?.trim() || path.join(projectRoot(), "models", "vosk");
}

function port(): number {
  const p = Number(process.env.SAKHI_PIPER_PORT || 1947);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : 1947;
}

function piperBaseUrl(): string {
  return `http://127.0.0.1:${port()}`;
}

/** Honest availability: engine files present and loadable on this machine. */
export function localTtsAvailable(): boolean {
  try {
    if (!fs.existsSync(pythonExe())) return false;
    if (!fs.existsSync(sidecarScript())) return false;
    const dir = modelsDir();
    if (!fs.statSync(dir).isDirectory()) return false;
    return fs.readdirSync(dir).some((f) => f.endsWith(".onnx"));
  } catch {
    return false;
  }
}

/** Honest availability: local off-line Vosk STT models (en + hi) present. */
export function localSttAvailable(): boolean {
  try {
    const root = voskModelsDir();
    if (!fs.statSync(root).isDirectory()) return false;
    const subs = fs.readdirSync(root).filter((n) => fs.statSync(path.join(root, n)).isDirectory());
    return subs.some((n) => /en-us|hi/i.test(n));
  } catch {
    return false;
  }
}

interface PiperHealth {
  ok: boolean;
  stt: boolean;
}

async function piperHealth(): Promise<PiperHealth> {
  try {
    const res = await fetch(`${piperBaseUrl()}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      console.log("[Sakhi Voice] Piper health check failed HTTP:", res.status);
      return { ok: false, stt: false };
    }
    const data: unknown = await res.json();
    const result = {
      ok: (data as { ok?: boolean })?.ok === true,
      stt: (data as { stt?: boolean })?.stt === true,
    };
    console.log("[Sakhi Voice] Piper health check result:", result);
    return result;
  } catch (e) {
    console.log("[Sakhi Voice] Piper health check error:", e);
    return { ok: false, stt: false };
  }
}

function getState(): PiperRuntime | undefined {
  return (globalThis as unknown as { __SAKHI_LOCAL_PIPER__?: PiperRuntime }).__SAKHI_LOCAL_PIPER__;
}

function setState(state: PiperRuntime | undefined): void {
  (globalThis as unknown as { __SAKHI_LOCAL_PIPER__?: PiperRuntime }).__SAKHI_LOCAL_PIPER__ = state;
}

/** Ensure the sidecar is running; reuse the warm process across requests/reloads. */
async function ensureRunning(): Promise<boolean> {
  // If the sidecar is already running and healthy, reuse it immediately
  if ((await piperHealth()).ok) {
    console.log("[Sakhi Voice] Piper sidecar already running and healthy");
    return true;
  }

  const existing = getState();
  if (existing && existing.child.exitCode === null) {
    try {
      existing.child.kill();
    } catch {
      /* already dead */
    }
    setState(undefined);
  }

  console.log("[Sakhi Voice] Starting Piper sidecar:", pythonExe(), sidecarScript());
  const child = spawn(
    pythonExe(),
    [
      sidecarScript(),
      "--models-dir",
      modelsDir(),
      "--vosk-models-dir",
      voskModelsDir(),
      "--port",
      String(port()),
    ],
    {
      cwd: projectRoot(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );
  child.stdout?.on("data", (data) => {
    console.log("[Sakhi Voice] Piper stdout:", data.toString().trim());
  });
  child.stderr?.on("data", (data) => {
    console.error("[Sakhi Voice] Piper stderr:", data.toString().trim());
  });
  setState({ child });

  // First boot loads both ~60MB ONNX voices (several seconds on CPU).
  const deadline = Date.now() + 60_000;
  console.log("[Sakhi Voice] Waiting for Piper sidecar to become healthy...");
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      console.error("[Sakhi Voice] Piper sidecar exited prematurely");
      setState(undefined);
      return false;
    }
    if ((await piperHealth()).ok) {
      console.log("[Sakhi Voice] Piper sidecar is healthy and ready");
      return true;
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  console.error("[Sakhi Voice] Piper sidecar failed to become healthy within timeout");
  try {
    child.kill();
  } catch {
    /* noop */
  }
  setState(undefined);
  return false;
}

export interface LocalTtsAudio {
  buffer: Buffer;
  mimeType: string;
  voice: string;
  synthesizeMs: number;
}

export async function localTtsSynthesize(
  text: string,
  language: LocalVoiceLanguage
): Promise<LocalTtsAudio | null> {
  console.log("[Sakhi Voice] localTtsSynthesize called:", { language, textLength: text.length });
  if (!localTtsAvailable()) {
    console.error("[Sakhi Voice] Local TTS not available - files missing");
    return null;
  }
  if (!(await ensureRunning())) {
    console.error("[Sakhi Voice] Failed to start Piper sidecar");
    return null;
  }
  
  // For auto mode, detect language from text first
  let effectiveLanguage: "en" | "hi" | "hinglish" = language === "auto" ? "en" : language;
  if (language === "auto") {
    // Simple detection: check for Devanagari characters
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    effectiveLanguage = hasDevanagari ? "hi" : "en";
  }
  
  const voice = VOICE_BY_LANGUAGE[effectiveLanguage] || "en_GB-aru-medium";
  console.log("[Sakhi Voice] Using voice:", voice, "for language:", effectiveLanguage);
  // Hindi/Hinglish quality: never feed ROMAN script to the Hindi voice (that is
  // the robotic letter-by-letter "A A, P P" failure). Roman → Devanagari first;
  // already-Devanagari text passes through untouched.
  const speakText =
    effectiveLanguage === "hi" || effectiveLanguage === "hinglish"
      ? hinglishToDevanagari(text)
      : text;
  try {
    console.log("[Sakhi Voice] Requesting synthesis from:", `${piperBaseUrl()}/synthesize`);
    const res = await fetch(`${piperBaseUrl()}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: speakText, voice }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error("[Sakhi Voice] Piper synthesis failed:", res.status, res.statusText);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      console.error("[Sakhi Voice] Piper returned empty audio buffer");
      return null;
    }
    const synthesizeMs = Number(res.headers.get("x-piper-ms") || 0);
    console.log("[Sakhi Voice] Synthesis successful:", { bufferSize: buffer.length, synthesizeMs, voice });
    return {
      buffer,
      mimeType: "audio/wav",
      voice,
      synthesizeMs,
    };
  } catch (e) {
    console.error("[Sakhi Voice] Synthesis error:", e);
    return null;
  }
}

export interface LocalSttResult {
  text: string;
  model: string;
  sttMs: number;
}

/**
 * Off-line local speech-to-text via the warm Vosk sidecar.
 * `audioB64` is a WAV file (16-bit PCM, mono, ~16 kHz) as base64.
 * No network, no cloud, no Gemini — the audio never leaves this machine.
 * `language` hints which Vosk model to prefer (en | hi | hinglish | auto).
 */
export async function localSttTranscribe(
  audioB64: string,
  language: string = "auto"
): Promise<LocalSttResult | null> {
  if (!localSttAvailable()) return null;
  if (!(await ensureRunning())) return null;
  try {
    const res = await fetch(`${piperBaseUrl()}/stt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioB64, language }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      text?: string;
      model?: string;
      stt_ms?: number;
    };
    if (data.ok !== true) return null;
    return {
      text: String(data.text || "").trim(),
      model: String(data.model || ""),
      sttMs: Number(data.stt_ms || 0),
    };
  } catch {
    return null;
  }
}