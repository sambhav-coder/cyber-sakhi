# Cyber Sakhi — Controlled Final Fix (Closing Report)

Project root (authoritative): `C:\Users\ry526\.gemini\antigravity\scratch\cyber-sakhi`
Date: 2026-09-13 · Mode: CONTROLLED FINAL FIX · Status: complete

This report is the 14-section closing report required by the final-fix spec. It
contains no API keys, no raw request/response payloads, and no call transcripts.

---

## 1. Scope and running mode

This run applied the controlled final fix to the authoritative Cyber Sakhi
project only. Work was performed under strict quota rules:

- At most **one** real Gemini request per capability.
- **No** retry loops, **no** polling loops, **no** automated conversation suites.
- Verification stopped after each success; one fix → one verified request.

The Gemini API key was rotated by the operator to a new account/project before
this run. The key is read exclusively from server environment variables
(`GEMINI_API_KEY` in `.env.local`), is never written to logs, never printed,
never returned to the client, and never committed. `.env.local` is not tracked.

## 2. Environment / model verification

- `GEMINI_API_KEY` present in `.env.local`: **yes** (existence only — key value
  intentionally not printed or logged).
- `GEMINI_MODEL=gemini-3.5-flash` present and matching the expected value.
- Runtime fallback in `lib/ai/gemini.ts` aligned to `gemini-3.5-flash` so the
  resolved model is identical even without the env line.
- Dev server restarted after code changes and confirmed ready
  (`/api/auth/providers` HTTP 200; app login HTTP 200).

## 3. Root cause — Chat language drift ("Hi" replied in Hindi)

**Symptom:** a plain English `"Hi"` in Chat Mode was answered in Devanagari
Hindi (`नमस्ते! मैं सखी हूँ…`), persisting even when the previous turn was
English. This is exactly the "short English greeting must never inherit a
previous language" failure the final-fix spec prohibits.

**Root cause (two layered causes):**
1. The Gemini system prompt told the model to "follow the user's language", but
   the API layer **never injected the deterministically detected per-message
   language** — language selection was left entirely to the model, so it could
   freely pick an earlier/heuristic language.
2. Stored companion memory could contain a `sakhi.language` preference row from
   earlier Hindi/Hinglish turns (e.g. `sakhi.language: hi`). That row was fed
   to the model inside `<DATA><MEMORY>`, which biased it toward Hindi even for
   a fresh English message.

**Fix (deterministic, per the spec):**
- Local, per-message detection is now the single authority. `detectLanguage`
  was rewritten as a layered classifier (step 4):
  1. Devanagari script → `hi`;
  2. short English small-talk phrases (`hi`, `hello`, `i am good`, `how are
     you`, `okay got it`, …) → `en`, regardless of history;
  3. distinctive Hinglish vocabulary with word boundaries (`kya`, `hai`, `hoon`,
     `mujhe`, `batao`, `bhai`, `didi`, `samajh`, `chahiye`, `madad`, …) —
     even a single marker → `hinglish`;
  4. otherwise → `en`.
  Detection remains fully local — **no Gemini call is ever used for language**.
- An explicit request override wins: `"tell me in Hindi"` → `hi`,
  `"answer in hinglish"` → `hinglish` (`explicitLanguageRequest`).
- The API now injects the detected language as a direct instruction for the
  current turn (`<TURN_LANGUAGE>`) with an explicit "this overrides history
  and memory; earlier turns never lock this reply" rule.
- `sakhi.language*` rows are filtered out of the memory context before prompt
  construction, eliminating the preference-bias vector.

**Verification (one request, after fix):**
`"Hi"` in Chat Mode → `"Hello! I am Sakhi. I'm here to support you through any
online safety, harassment, or scam worries you might be facing. How can I help
you today?"` — clear English, no Devanagari, no Hinglish markers, HTTP 200,
**exactly one** `POST /api/chat`.

## 4. Root cause — Voice / STT

**Symptom history:** Voice Mode showed `"Sakhi couldn't reach her AI service —
retryable"`. Under the old key this was Gemini HTTP `429` (`You exceeded your
current quota`) surfacing as the app's honest 503; no app bug.

**What was fixed/kept here:**
- STT (`lib/voice/speech.ts`) silence-based session stays as-is (silence end
  after ~1.6 s, no-speech timeout ~9 s, single `onend`). Added a best-effort
  `setLang` so the recognition locale follows the detected per-turn language
  (applies next recognition pass; browser-dependent by nature).
- The typing fallback inside Voice Mode is preserved (spec requirement) and was
  used for the controlled voice smoke.
- The voice path now inherits the same deterministic per-message language fix
  as Chat (same `/api/chat` route, same `reasonGeneral` provider call).

**Verification (one request):**
`"Cybercrime kya hota hai?"` typed in Voice Mode → Hinglish reply:
`"Cybercrime ka matlab hai koi bhi aisi gair-kanooni activity jo computer,
mobile ya internet ke zariye ki jaye. Isme online paise thagna, hacking, bina
ijazat ke …"` — correct per-message Hinglish (roman script), HTTP 200,
**exactly one** `POST /api/chat`.

## 5. Root cause — Image / multimodal

**Symptom history:** images could not reach Gemini when the quota was exhausted
(same 429 as everything else). The pipeline itself was already correct:
real bytes travel client → API → Gemini `inlineData`; filenames are never
substituted for content; images are never persisted (attachment meta stores
`preview: null`); size/type gating (3 images, 8 MB each, 15 MB total) enforced
server-side.

**What was fixed/kept:** no pipeline change required; the image UI shows the
attach states (`Attached` / `Analyzing image…` / `Analyzed` / error) as before.

**Verification (one request):**
A synthetic phishing-SMS image (`URGENT: OTP 123456`, `Verify now at
sakhi-check.net`, `Suspicious SMS detected`) was attached in Voice Mode and
asked `"What does this image show?"`. Reply:
`"This image shows a highly suspicious SMS alert, which looks like a phishing
(or smishing) attempt. It is trying to create a false sense of urgency by
asking you to verify an OTP on an unofficial link ('sakhi-check.net')."` —
**real image content was analyzed**, HTTP 200, **exactly one** `POST /api/chat`.

## 6. Root cause — Hindi TTS (steering TTS by the current turn)

**Symptom:** `VoiceModePortal.sendUtterance` spread the server-detected language
into state and then called `speakReply` in the same closure; `speakReply` read
the React `language` variable, which could be stale for that turn — the spoken
voice could trail the just-detected language (drift / session locking).

**Fix:**
- A `languageRef` is updated at utterance time (local detection) and again from
  the server-authoritative `detectedLanguage` response.
- `speakReply` reads `languageRef.current`, so the TTS voice/script always
  follows the current turn's language.
- STT `setLang` keeps the mic locale in step for the next recognition pass.

## 7. Per-message language detection — layering and statelessness

- Devanagari → `hi`; English small-talk phrases → `en`; Hinglish markers →
  `hinglish`; fallback → `en`; explicit request override wins.
- Detector is stateless: `मुझे मदद चाहिए` → `hi`, then `"Hi"` → `en` in the
  same session.
- A device-independent unit harness (`langcheck.cjs`) compiled the **real**
  `lib/sakhiAI.ts` module and ran **21/21 cases, zero API calls** (greetings,
  English small-talk, Hinglish phrasing, Devanagari, overrides, statelessness).

## 8. Sidebar navigation fix

- Removed the "Sakhi Voice" primary-nav item from
  `components/AppSidebar.tsx` (entry + now-unused `Mic` import).
- Sidebar now shows exactly: **Dashboard, Sakhi AI, Email Forensics, My Cases,
  Evidence Locker** — verified in the browser.
- Voice Mode remains reachable only through **Sakhi AI Hub → Voice Mode card**
  (`/companion/voice`) — verified via hub card navigation. No `/companion/voice`
  link exists in the sidebar (also confirmed `Navbar.tsx` never had one).
- The `"Sakhi Voice"` route/label no longer appears anywhere in navigation.

## 9. Duplicate-request audit (one user action = one Gemini request)

- Every `POST /api/chat` (the only Gemini path) originates from an explicit user
  action: Chat Mode form submit / Enter (`app/companion/page.tsx`), Voice Mode
  typed-utterance send (`VoiceModePortal.sendUtterance` → `handleUtterance`),
  and case-scoped chat. No `useEffect`/mount/interval fires a Gemini call
  (voice welcome TTS is pure browser speech synthesis, zero API).
- Each of the three smoke sends was counted at the network layer and asserted
  **exactly 1** `POST /api/chat`:
  - Chat `"Hi"` → 1
  - Voice `"Cybercrime kya hota hai?"` → 1
  - Image `"What does this image show?"` → 1
- No duplicate requests, no double-fire on form submit, no StrictMode
  double-submit observed.

## 10. Smoke results (the controlled ONE-request runs)

| Capability | Probe (one request) | Result |
|---|---|---|
| TEST 0 — UI only | sidebar nav + hub + page walk | 0 requests fired; sidebar correct; Voice only via Hub |
| TEST 1 — Chat | `"Hi"` → verify English greeting | PASS, 1 request, warm English greeting |
| TEST 2 — Voice | `"Cybercrime kya hota hai?"` → verify Hinglish | PASS, 1 request, Hinglish answer |
| TEST 3 — Image | attach phishing-SMS image + `"What does this image show?"` | PASS, 1 request, content read correctly |

Plus the local detector harness: 21/21 with zero Gemini calls.

## 11. TypeScript

`npx tsc --noEmit` → **clean, exit 0**, no type errors (after all fixes).

## 12. Production build

`npm run build` → **exit 0**. Key routes confirmed: `/sakhi` (ƒ), `/companion`
(○), `/companion/voice` (ƒ), middleware 49.8 kB. No build warnings/errors.

## 13. Client secret audit

Scanned the entire `.next/static` client bundle (62 files) for
`GEMINI_API_KEY`, `AIza…` markers, `AQ.Ab…` markers, `x-goog-api-key`,
`generativelanguage.googleapis.com`, and `GEMINI_MODEL`:
**CLEAN — no secret or key material in the client bundle.** The API key exists
only as a server environment variable.

## 14. Genuine limitations

- **STT microphone audio** was not exercised end-to-end in this controlled run
  (headless, no real audio input). Current-web standard limitations apply: the
  Web Speech API runs in the browser, recognition is remote and subject to its
  availability; mid-session locale switches are best-effort (applies next
  recognition pass). The voice smoke used the (still present) typing fallback,
  which shares the full send/reply/TTS pipeline.
- **TTS output audio** is not asserted in headless (no audio sink). The speech
  layer guards for missing/no Hindi-capable voices (falls back to `hi-IN`/English
  voice selection) and the language steering (`languageRef`) is verified
  deterministically; audible pronunciation depends on the OS voice pack.
- **Language matching is heuristic by necessity:** ambiguous roman strings can
  still be mislabelled; detection is intentionally posted on the side of
  Hinglish when distinct markers appear (`"what is phishing bhai?"` →
  `hinglish`). It is fully local, deterministic, unit-tested (21 cases), and
  explicit override always wins.
- **Voice/image smoke sent exactly one request each; no further quotas were
  consumed.** Re-running any probe beyond this report would consume quota and
  was deliberately avoided.

*End of report — no API key material, no raw call logs, nothing committed or
pushed.*