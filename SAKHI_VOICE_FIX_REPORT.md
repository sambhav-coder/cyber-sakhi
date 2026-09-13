# SAKHI_VOICE_FIX_REPORT — Targeted Voice Fixes (Intro Truncation, Voice-Mode Unify, Real Mic/STT)

**Scope:** Cyber Sakhi companion voice (Hindi / Hinglish / English).
**Root:** `C:\Users\ry526\.gemini\antigravity\scratch\cyber-sakhi` (authoritative; `.trae\worktrees\cyber-sakhi` is a sync worktree, NOT the canonical project).
**Status:** DONE. All 22 final acceptance assertions passed. No API key, secrets, or paid-TTS dependency remain. STT never uses Gemini.

---

## 1. Objective & Verdict

Fix three stale voice behaviours and prove them with a browser QA drive:

1. **Landing intro truncation** — Sakhi stopped mid-intro at `"…I am Sakhi…"` because the autoplay-block timer cancelled speech even after it had started.
2. **Two different English scripts** — Voice Mode spoke a different English welcome if the browser voice was used.
3. **Mic / STT that actually works** — the old mic relied on browser `SpeechRecognition` (absent in headless, flaky on-device); now a real local Vosk STT engine captures and transcribes.

**VERDICT — PASS.** The landing speaks the FULL canonical English intro, the same canonical English is the single source for both Landing and Voice Mode, and the mic now records real audio and transcribes it locally with the on-device Vosk engine, culminating in exactly **one** Gemini reasoning call for the single QA turn.

## 2. Fix 1 — Landing intro truncation

- `components/companion/SakhiHub.tsx`: the autoplay-block timer (`AUTOPLAY_BLOCK_DETECT_MS = 2600` ms) now **only** fires when speech never started. A new `speechStartedRef` is set in the speaker's `onStart`; at the 2.6 s mark the timer returns early if `speechStartedRef.current` is true, so Sakhi keeps speaking the whole intro instead of being cut off mid-sentence.
- Before: the timer cancelled regardless → truncation at "…I am Sakhi…". After: full intro, no block card, no manual click.

## 3. Fix 2 — One canonical English intro

- NEW single source of truth: `lib/voice/content.ts` → `SAKHI_LANDING_INTRO` (exact text below).
- `SakhiHub.tsx`: `const HUB_INTRO = SAKHI_LANDING_INTRO;`
- `VoiceModePortal.tsx`: `const WELCOME_TEXT = SAKHI_VOICE_INTRO;` (same string).
- Text: *"Welcome to Sakhi AI. I am Sakhi, your smart cyber safety companion. Choose Chat Mode for a private text conversation, or Voice Mode to talk to me out loud. I understand English, Hindi and Hinglish. So, what would you like to do today?"*
- The old second Voice-Mode-only script ("Welcome to Voice Mode of Sakhi AI…") is gone; QA asserts it is absent.

## 4. Fix 3 — Real mic + local STT (Vosk)

**Server side (STT route, local-first):** `app/api/voice/stt/route.ts` accepts JSON `{audioB64, language}` or multipart `audio`, transcribes with the self-hosted **Vosk** engine (`source: "local"`, model reported), falls back to an inert upstream slot (`SAKHI_STT_*`, unset by default), then an honest `501`. It never calls Gemini.

**Engine:** `scripts/piper_sidecar.py` now also serves `POST /stt` (stdout-WAV decode, mono 16-bit, linear resample to 16 kHz, both `vosk-model-small-en-us-0.15` and `vosk-model-small-hi-0.22` run per request; the model matching the requested language wins, text chosen by requested language then length). `/health` reports `stt`. Lazy per-language model load with a lock.

**Client recorder:** NEW `lib/voice/localStt.ts` — `getUserMedia` + `AudioContext` + `ScriptProcessorNode`, PCM16 mono/16 kHz WAV base64, silence auto-stop (1500 ms), 15 s cap, 8 s start timeout, and streaming partials (every ~900 ms) so the user sees a live transcript. Hands the session back as `{stop, abort}` so tap-again commits.

**Client UX:** `VoiceModePortal.tsx` is local-first — `startListening()` goes straight to the Vosk recorder; interim results stream live; the final transcript drives `handleUtterance` (one Gemini turn); errors fall back honestly (no-speech → idle, mic denied → guidance, engine missing → browser recognition if available, else the typing box). `stopListening()` aborts local then stops browser recognition. Welcome copy now says "private on-device speech engine".

## 5. Architecture (all local, all free)

```
Mic ──► getUserMedia ─► ScriptProcessorNode ─► PCM16/16 kHz WAV (base64)
        ▼
   POST /api/voice/stt ──► local Vosk sidecar (en + hi models)
        ▼ (final transcript)
   POST /api/chat ──► Gemini reasoning ONLY ──► {reply, detectedLanguage(hi|en|hinglish)}
        ▼
   POST /api/voice/tts ──► Piper sidecar (en_GB-aru-medium / hi_IN-priyamvada-medium)
        ▼
   WAV blob ─► speakers ─► TalkingHead avatar
```
- STT and TTS never touch Gemini or any SaaS. No audio leaves the device except to the local sidecar on `127.0.0.1:1947`.

## 6. Supporting status/telemery

- `app/api/voice/status/route.ts` now advertises `local: { tts, stt }` from the server (not client guesswork).
- `lib/voice/localPiper.ts` gained `localSttAvailable()`, `localSttTranscribe()`, health `{ok, stt}`, and passes `--vosk-models-dir` when it spawns the sidecar.

## 7. Acceptance evidence (final run, `QA_CHAT=1`)

All 22 assertions passed. Highlights:

| # | Assertion | Result |
|---|-----------|--------|
| A1 | Landing intro TTS started (chip "Speaking") | PASS |
| A2 | Autoplay-block cancel did NOT fire at 2.6 s (no "Getting ready…") | PASS |
| A3 | No autoplay-block / Meet-Sakhi card after the 2.6 s mark | PASS |
| A4 | Landing renders the canonical English intro | PASS |
| A5 | Landing completes end-to-end WITHOUT any manual play | PASS |
| A6 | Landing intro requested local TTS audio (1 POST /api/voice/tts) | PASS |
| B1 | Voice Mode welcome = SAME canonical English intro | PASS |
| B2 | Old second Voice-Mode-only script absent | PASS |
| C1–C4 | Orb enabled → mic engaged ("Stop and send") → auto-resolved → recorder POSTed 7 STT partials with ZERO Gemini | PASS |
| D1 | `/api/voice/stt` HTTP 200, `source=local`, real transcript (Vosk `vosk-model-small-hi-0.22`) | PASS |
| D2 | `/api/voice/status` advertises local STT | PASS |
| E1–E5 | Exactly ONE `/api/chat`; Hinglish detected (`hinglish`); reply TTS in Hindi/Hinglish voice; total `/api/chat` POSTs = 1 | PASS |

- Local STT turned a real (Piper-synthesized) Hindi phrase into Devanagari:
  `साबरकांठा काे होटल हाई और मेंं कद को के इस बात` — model `vosk-model-small-hi-0.22`.
- Single QA turn: `"Cybercrime kya hota hai?"` → `detectedLanguage: "hinglish"`, reply spoken by `hi_IN-priyamvada-medium`, per-turn language respected.

## 8. Human acceptance (not automatable headlessly)

Headless browsers serve a fake mic (a tone, not words) and a virtual fast audio clock, so the following are for a real-browser check after handoff:

1. Open Voice Mode at `http://localhost:3000/companion/voice`, log in, tap the orb.
2. Say `"Cybercrime kya hota hai?"` into the real mic → transcript appears live, Sakhi answers in Hinglish, spoken by the Hindi voice.
3. Say `"What is phishing?"` → English answer in the English voice.
4. Closing/reopening the landing: the full English intro plays once, no "Meet Sakhi" button, no truncation.

## 9. Pieces changed

| File | What |
|---|---|
| `lib/voice/content.ts` | NEW — canonical English intro (single source) |
| `components/companion/SakhiHub.tsx` | `HUB_INTRO = SAKHI_LANDING_INTRO`; `speechStartedRef` guard on the 2.6 s timer |
| `components/companion/VoiceModePortal.tsx` | `WELCOME_TEXT = SAKHI_VOICE_INTRO`; local-first Vosk mic + browser-STT fallback + typing fallback |
| `scripts/piper_sidecar.py` | Piper TTS **+ Vosk STT** (`/stt`); `/health` reports STT; `--vosk-models-dir` |
| `lib/voice/localPiper.ts` | `localSttAvailable()`, `localSttTranscribe()`, health `{ok,stt}` |
| `lib/voice/localStt.ts` | NEW client recorder (WAV encode, silence stop, streaming partials) |
| `app/api/voice/stt/route.ts` | Local-first STT (Vosk → inert slot → 501); never Gemini |
| `app/api/voice/status/route.ts` | Reports `local.{tts,stt}` |
| `models/vosk/` (gitignored) | `vosk-model-small-en-us-0.15`, `vosk-model-small-hi-0.22` |

## 10. Environment & tools (auxiliary, non-project)

- QA driver (temp): `C:\Users\ry526\AppData\Local\Temp\opencode\qa\qa_targeted_fix.cjs`; probe WAV `stt_probe_hi.wav`; screenshots `shots_target\`.
- Edge headless with `--autoplay-policy=no-user-gesture-required`, `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`.
- Dev server + app-owned Piper sidecar on `127.0.0.1:1947`; `npm run build` and `npx tsc --noEmit` clean.

## 11. Limitations / notes

- The mic tests prove **record → capture → local transcribe** end-to-end with real audio against the local engine; only a human can verify real speech quality with their own voice (Section 8).
- Do not start a second sidecar on 1947 — the dev server spawns its own; a port collision silently fell back to `speechSynthesis` in QA.
- STT input is limited to mono 16-bit PCM WAV (any rate ≤ 48 kHz, resampled); non-WAV/multi-channel audio is rejected with a clear message rather than mangled.

## 12. No secrets

No API keys, tokens, endpoints, or `.env` values are contained in this report or in the changed files. `.env.local` remains untracked and unread by any tooling.