"""Local Piper TTS + Vosk STT sidecar for Cyber Sakhi.

Thin, dependency-light HTTP wrapper around two LOCAL, free, open-source engines:
  - piper-tts (TTS): voices held in memory, returns WAV audio.
  - vosk       (STT): offline speech-to-text, no cloud, no network needed.

Binds to 127.0.0.1 only. No cloud, no API keys, no telemetry.

Endpoints:
  GET  /health        -> {"ok": true, "voices": [...], "stt": bool}
  GET  /voices        -> same list
  POST /synthesize    -> {"text", "voice"} -> audio/wav bytes (16-bit PCM)
  POST /stt           -> {"audioB64", "language"?} -> {"ok", "text", "model"}

Run:
  .piper-venv\\Scripts\\python.exe scripts/piper_sidecar.py \
      --models-dir models/piper --vosk-models-dir models/vosk --port 1947
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Dict, List, Optional

from piper import PiperVoice, SynthesisConfig

MAX_TEXT_CHARS = 2000
INTER_SENTENCE_SILENCE_SECONDS = 0.12
STT_SAMPLE_RATE = 16000


class VoiceBank:
    def __init__(self, models_dir: Path) -> None:
        self.voices: Dict[str, PiperVoice] = {}
        for onnx in sorted(models_dir.glob("*.onnx")):
            if not Path(f"{onnx}.json").exists():
                continue
            self.voices[onnx.stem] = PiperVoice.load(onnx)
        if not self.voices:
            raise SystemExit(f"No piper voices found under {models_dir}")

    def synths(self, text: str, requested: Optional[str]) -> bytes:
        voice = self.voices.get(requested or "") or next(iter(self.voices.values()))
        cfg = SynthesisConfig()
        out = io.BytesIO()
        with wave.open(out, "wb") as wf:
            first = True
            for chunk in voice.synthesize(text, cfg):
                if first:
                    wf.setframerate(chunk.sample_rate)
                    wf.setsampwidth(chunk.sample_width)
                    wf.setnchannels(chunk.sample_channels)
                    first = False
                else:
                    wf.writeframes(
                        b"\x00\x00"
                        * int(voice.config.sample_rate * INTER_SENTENCE_SILENCE_SECONDS)
                    )
                wf.writeframes(chunk.audio_int16_bytes)
        return out.getvalue()


def _resample_pcm16(pcm16: bytes, in_rate: int, out_rate: int) -> bytes:
    """Naive linear-interpolation resample (short utterances, fine in Python)."""
    if in_rate == out_rate or not pcm16:
        return pcm16
    n = len(pcm16) // 2
    if n == 0:
        return pcm16

    def s16(i: int) -> int:
        v = pcm16[2 * i] | (pcm16[2 * i + 1] << 8)
        return v - 65536 if v >= 32768 else v

    out_n = max(1, round(n * out_rate / in_rate))
    ratio = (n - 1) / max(1, out_n - 1)
    out = bytearray(out_n * 2)
    for i in range(out_n):
        pos = i * ratio
        lo = int(pos)
        hi = min(lo + 1, n - 1)
        frac = pos - lo
        val = int(s16(lo) + (s16(hi) - s16(lo)) * frac)
        val = max(-32768, min(32767, round(val))) & 0xFFFF
        out[2 * i] = val & 0xFF
        out[2 * i + 1] = (val >> 8) & 0xFF
    return bytes(out)


class SttBank:
    """Lazily loads the Vosk models; each model dir maps to a model file."""

    def __init__(self, models_dir: Optional[Path]) -> None:
        self.models_dir = models_dir
        self._lock = threading.Lock()
        self._models: Dict[str, object] = {}

    def available(self) -> bool:
        return self.models_dir is not None and self.models_dir.is_dir()

    def _ensure(self) -> Dict[str, object]:
        if not self.available():
            return {}
        with self._lock:
            if self._models:
                return self._models
            try:
                from vosk import Model
            except Exception:
                return {}
            loaded: Dict[str, object] = {}
            for d in sorted(self.models_dir.iterdir()):
                if d.is_dir() and (d / "am" / "final.mdl").exists():
                    loaded[d.name] = Model(str(d))
            self._models = loaded if loaded else self._models
            return self._models

    def transcribe(self, wav_bytes: bytes) -> List[dict]:
        """Decode the WAV, run every loaded model, return [{model, text}]."""
        models = self._ensure()
        results: List[dict] = []
        try:
            import wave as _wave
            with _wave.open(io.BytesIO(wav_bytes), "rb") as wf:
                rate = wf.getframerate()
                ch = wf.getnchannels()
                sw = wf.getsampwidth()
                frames = wf.readframes(wf.getnframes())
        except Exception:
            return results
        if sw != 2:
            return results
        if ch != 1:
            return results
        if rate != STT_SAMPLE_RATE:
            frames = _resample_pcm16(frames, rate, STT_SAMPLE_RATE)
        if not frames:
            return results
        try:
            from vosk import KaldiRecognizer
        except Exception:
            return results
        for name, model in models.items():
            try:
                rec = KaldiRecognizer(model, STT_SAMPLE_RATE)
                rec.SetWords(False)
                chunk = 4000
                for i in range(0, len(frames), chunk):
                    if rec.AcceptWaveform(frames[i : i + chunk]):
                        pass
                text = json.loads(rec.FinalResult()).get("text", "").strip()
                if text:
                    results.append({"model": name, "text": text})
            except Exception:
                continue
        return results


class PiperHandler(BaseHTTPRequestHandler):
    engine: Optional[VoiceBank] = None
    stt: Optional[SttBank] = None
    server_version = "SakhiLocalVoices/1.0"

    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in ("/health", "/voices"):
            names = sorted(self.engine.voices.keys())
            self._json(
                200,
                {
                    "ok": True,
                    "voices": names,
                    "stt": self.stt.available() if self.stt else False,
                },
            )
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        if self.path == "/synthesize":
            self._post_synthesize()
            return
        if self.path == "/stt":
            self._post_stt()
            return
        self._json(404, {"ok": False, "error": "not found"})

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) or b"{}"
        return json.loads(raw)

    def _post_synthesize(self) -> None:
        try:
            data = self._read_json()
        except Exception as exc:
            self._json(400, {"ok": False, "error": f"bad request: {exc}"})
            return
        text = str(data.get("text") or "").strip()
        if not text:
            self._json(400, {"ok": False, "error": "no text"})
            return
        if len(text) > MAX_TEXT_CHARS:
            self._json(400, {"ok": False, "error": "text too long"})
            return
        voice = str(data.get("voice") or "").strip() or None
        started = time.monotonic()
        try:
            wav = self.engine.synths(text, voice)
        except Exception as exc:
            self._json(500, {"ok": False, "error": f"synth failed: {exc}"})
            return
        elapsed_ms = int((time.monotonic() - started) * 1000)
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.send_header("X-Piper-Voice", voice or next(iter(self.engine.voices.keys())))
        self.send_header("X-Piper-Ms", str(elapsed_ms))
        self.end_headers()
        self.wfile.write(wav)

    def _post_stt(self) -> None:
        if not self.stt or not self.stt.available():
            self._json(501, {"ok": False, "error": "stt unavailable"})
            return
        try:
            data = self._read_json()
        except Exception as exc:
            self._json(400, {"ok": False, "error": f"bad request: {exc}"})
            return
        audio_b64 = str(data.get("audioB64") or "")
        if not audio_b64:
            self._json(400, {"ok": False, "error": "no audioB64"})
            return
        try:
            wav = base64.b64decode(audio_b64)
        except Exception:
            self._json(400, {"ok": False, "error": "bad audioB64"})
            return
        started = time.monotonic()
        try:
            results = self.stt.transcribe(wav)
        except Exception as exc:
            self._json(500, {"ok": False, "error": f"stt failed: {exc}"})
            return
        elapsed_ms = int((time.monotonic() - started) * 1000)

        lang = str(data.get("language") or "").strip().lower()
        texts = {r["model"]: r["text"] for r in results}
        best_text = ""
        
        # Extract Hindi and English model results
        hi_text = next((t for m, t in texts.items() if "hi" in m and t), "")
        en_text = next((t for m, t in texts.items() if "en-us" in m and t), "")
        
        # CRITICAL: For auto mode, run BOTH models and choose the better result
        # using intelligent detection based on Unicode characters and confidence
        if lang == "auto":
            # Run both models and choose based on content analysis
            if hi_text and en_text:
                # Check which transcript has Hindi characters (Devanagari)
                hi_has_devanagari = any('\u0900' <= c <= '\u097F' for c in hi_text)
                en_has_devanagari = any('\u0900' <= c <= '\u097F' for c in en_text)
                
                if hi_has_devanagari and not en_has_devanagari:
                    # Hindi model produced Devanagari - use it
                    best_text = hi_text
                elif en_has_devanagari and not hi_has_devanagari:
                    # English model produced Devanagari (unlikely but possible) - use it
                    best_text = en_text
                elif hi_has_devanagari and en_has_devanagari:
                    # Both have Devanagari - choose the longer/more complete one
                    best_text = hi_text if len(hi_text) >= len(en_text) else en_text
                else:
                    # Neither has Devanagari - this is likely English or Roman Hinglish
                    # Check for Hinglish markers in both
                    hinglish_markers = ['main', 'mera', 'meri', 'tera', 'teri', 'mujhe', 'tumhe', 'aap', 'kya', 'kaise', 'kyu', 'kyun', 'hai', 'nahi', 'batao', 'samajh', 'karna', 'chahiye', 'theek', 'paisa', 'madad', 'bhai', 'didi', 'bhaiya']
                    hi_has_hinglish = any(marker in hi_text.lower() for marker in hinglish_markers)
                    en_has_hinglish = any(marker in en_text.lower() for marker in hinglish_markers)
                    
                    if hi_has_hinglish and not en_has_hinglish:
                        best_text = hi_text
                    elif en_has_hinglish and not hi_has_hinglish:
                        best_text = en_text
                    else:
                        # Both or neither have Hinglish markers - choose by length/quality
                        best_text = hi_text if len(hi_text) >= len(en_text) else en_text
            elif hi_text and not en_text:
                best_text = hi_text
            elif en_text and not hi_text:
                best_text = en_text
            else:
                # No valid transcript from either model
                best_text = max(texts.values(), key=len, default="").strip()
        elif lang in ("hi", "hinglish"):
            # Prefer Hindi model for explicit Hindi/Hinglish requests
            if hi_text:
                best_text = hi_text
            elif en_text:
                # Fallback to English if Hindi model produced nothing
                best_text = en_text
            else:
                best_text = max(texts.values(), key=len, default="").strip()
        elif lang == "en":
            # Prefer English model for explicit English requests
            if en_text:
                best_text = en_text
            elif hi_text:
                # Fallback to Hindi if English model produced nothing
                best_text = hi_text
            else:
                best_text = max(texts.values(), key=len, default="").strip()
        else:
            # Unknown language - use length-based fallback
            best_text = max(texts.values(), key=len, default="").strip()

        chosen = next((m for m, t in texts.items() if t == best_text), "")

        if not best_text:
            self._json(
                200,
                {
                    "ok": True,
                    "text": "",
                    "model": chosen,
                    "note": "No speech recognised.",
                    "stt_ms": elapsed_ms,
                },
            )
            return
        self._json(
            200,
            {
                "ok": True,
                "text": best_text,
                "model": chosen,
                "stt_ms": elapsed_ms,
            },
        )

    def log_message(self, fmt: str, *args) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="Local piper-tss + vosk tts sidecar")
    parser.add_argument("--models-dir", required=True, help="Directory of .onnx + .onnx.json voices")
    parser.add_argument("--vosk-models-dir", default=None, help="Directory of vosk model folders")
    parser.add_argument("--port", type=int, default=1947, help="Listen port (127.0.0.1)")
    args = parser.parse_args()

    bank = VoiceBank(Path(args.models_dir))
    stt_bank = SttBank(Path(args.vosk_models_dir) if args.vosk_models_dir else None)
    PiperHandler.engine = bank
    PiperHandler.stt = stt_bank
    server = ThreadingHTTPServer(("127.0.0.1", args.port), PiperHandler)
    server.daemon_threads = True
    print(
        f"[voice-sidecar] ready on 127.0.0.1:{args.port} "
        f"voices={list(bank.voices)} stt={stt_bank.available()}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()