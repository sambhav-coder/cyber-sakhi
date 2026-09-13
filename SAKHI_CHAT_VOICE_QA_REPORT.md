# Cyber Sakhi — Chat Mode & Voice Mode Completion Report

**Date:** 2026-09-13
**Workspace:** `C:\Users\ry526\.gemini\antigravity\scratch\cyber-sakhi` (the `.trae` worktree is not the source of truth)
**Head commit:** `c457963 feat: finalize email forensics and production auth`
**Status:** Chat + Voice fully working end-to-end in the browser against the real Gemini brain, with real DB persistence. Nothing committed.

---

## 1. Objective
Rebuild Cyber Sakhi's Chat Mode and Voice Mode into a premium, immersive cyber-safety AI companion experience, browser-first QA'd, with no hardcoded answers and no faked AI replies. Chat Mode is text-only (zero voice/mic affordance); Voice Mode is an immersive avatar + voice + live transcript + planetary-orb product. Both run through one unified Gemini-only brain with real STT/TTS and the existing 3D TalkingHead avatar.

## 2. Environment & Constraints
- Windows sandbox, no Google Chrome (drives Edge via puppeteer-core).
- Dev server: Next.js 14.2.35 on `http://localhost:3000`, started in background with logs in `dev-server.log`.
- Dev-login enabled only via `ALLOW_DEV_LOGIN=true` (non-production builds only).
- No commits; repo changed files are listed in section 22.
- Final gates executed: `npx tsc --noEmit` clean, `npm run build` success, client-bundle secret audit clean.

## 3. Architecture: Chat Mode (`/companion`)
- Text-first companion with an immersive landing, one primary CTA (**START NEW CONVERSATION**), a "Name your conversation" modal (shared between landing and workspace), a workspace with a conversations rail, message pane (user right / Sakhi left), composer, attachment picker, and Evidence Locker picker.
- No voice or mic affordance anywhere in Chat Mode (verified by a regex scan of the landing copy).
- Real Gemini answer path: composer → `POST /api/chat` (with `conversationId`) → `lib/sakhiReasoning.ts` → `lib/ai/gemini.ts` (server-only REST) → parsed spec → rendered as a Sakhi bubble with `RichText` (bold rendered, never literal `*`).
- On create: conversation is persisted, then displayed in an empty state ("Ask me anything about cyber safety.").

## 4. Architecture: Voice Mode (`/companion/voice`)
- New immersive route (server component, `export const dynamic = "force-dynamic"`, Suspense fallback "Waking Sakhi's voice…").
- `VoiceModePortal` (rewritten from a modal to a full page component): welcome phase with bilingual intro, active phase with live transcript segments (user right / Sakhi left), interim captioning, thinking dots, mute, typed fallback ("Type instead of speaking…"), document upload, Evidence Locker picker, error banner with **Retry** (`failedUtteranceRef`).
- Creates its own "Voice conversation" via `POST /api/chat/conversations` and posts utterances to `POST /api/chat` with that `conversationId` → same brain + session memory.
- Autoplay-safe: welcome speech only attempts after a user gesture; a detected autoplay block (`AUTOPLAY_BLOCK_DETECT_MS = 2600`) surfaces a "Play Sakhi's Welcome" button.

## 5. Sakhi Orb
- Rebuilt `components/companion/SakhiOrb.tsx` as a planetary RGB sphere — no shield, no emoji, no plain circle.
- States: `idle | listening | thinking | speaking | error` (idle = cool RGB rotation, listening = green, thinking = amber sweep, speaking = crimson waves, error = rose alarm pulse).
- CSS conic sheen animated via `@property --sakhi-orb-angle` with rotate/breathe/radar/wave/sweep/alarm keyframes.

## 6. Navigation
- `components/AppSidebar.tsx`: "Sakhi AI" now "AI chat companion" (`/companion`); added **"Sakhi Voice"** nav item (`Mic`, `/companion/voice`, "One-to-one voice companion").
- Chat landing copy updated to "Chat Mode" with no voice/flower CTA; the "Try Voice Mode" card was removed (replaced by a single START NEW CONVERSATION CTA + secondary "Open a previous conversation").

## 7. Server / API layer
- `app/api/chat/conversations/route.ts`: GET list + pins, POST create, PATCH rename/pin, DELETE; shared modal now works from landing thanks to a shared `newConversationModal` render.
- `app/api/chat/route.ts`: general-companion path with conversation history, non-sensitive memory, document/evidence/report briefs, language detection, and owner-scoped persistence; returns `{...reply, provider, context}`.

## 8. Database provisioning
- The Sakhi memory tables (`sakhi_conversations`, `sakhi_messages`, `sakhi_memory`) **did not exist** in the remote Supabase project (`PGRST205`). The committed, idempotent migration `supabase/migrations/step4_sakhi_memory.sql` was applied by the owner in the Supabase SQL Editor; verified reachable + writable via service-role REST (`OK rows=0` on all three tables), and all conversation APIs now return 200 with `memoryPersisted:true`.

## 9. Auth / dev-bypass fix
- Dev personas used non-UUID ids (`dev_user_bypass`/`dev_admin_bypass`) which broke every owner-scoped insert into `uuid` columns (conversations AND cases returned 500). Fixed in `lib/devAuth.ts`: ids are now deterministic valid UUIDs (`10000000-…-000000000001/2`). No production behavior changed.

## 10. AI model upgrade
- The configured model `gemini-2.0-flash` was retired by Google (HTTP 404 in 2026). Set `GEMINI_MODEL=gemini-3.6-flash` in `.env.local` and updated the fallback default in `lib/ai/gemini.ts`. Live calls verified (`POST /api/chat 200 in ~5–6s`).

## 11. Brain & guardrails
- `lib/sakhiReasoning.ts` → `lib/ai/gemini.ts` remain the single reasoning path. Server-only key (`x-goog-api-key`), enforced verified helplines (112/1091/14416/1930/cybercrime.gov.in), untrusted `<DATA>` handling, no invented facts, truthful errors with Retry. Question/answer regression test answered correctly (3 signs of phishing emailed back accurately).

## 12. Language handling
- Auto language detection per message (en/hi/hinglish) for chat reply, transcript, and TTS; no visible toggle; no hardcoded English badge; bilingual welcome intro (English + Hinglish) because the user's language is unknown before the first utterance.

## 13. Voice pipeline
- `lib/voice/speech.ts`: `getBrowserSpeechCapabilities`, `startSttSession` (silence timeout 2200ms), `speakWithVoice`, `resolveFemaleVoice`, `waitForVoices`, `SpeakHandle`/`SttSession`.
- `LiveSakhiAvatar` (TalkingHead) drives `setExpression` / `speakStart` / `speakEnd` lip-sync; in headless it degrades gracefully (init failure logged, UI continues — verified).

## 14. Persistence & memory
- Conversations + messages persist in Supabase (`sakhi_conversations`, `sakhi_messages`); memory via `sakhi_memory` (language preference saved when non-English). Browser evidence: conversations survived page navigations across runs; `memoryPersisted: true` in API responses.

## 15. Browser QA methodology
- Puppeteer-core driving Edge in `C:\Users\ry526\AppData\Local\Temp\opencode\qa` (`qa2.js` + focused `dbg*.mjs` scripts); screenshots in `shots/`, `shots2/`.
- Case-insensitive text matching because `innerText` reflects CSS `text-transform: uppercase`. Placeholder text is NOT in `innerText`, so hint checks read the `placeholder` attribute.
- Real-mic STT unreliable in headless, so voice UI states + fallbacks verified; the Gemini round-trip verified via typed replies.

## 16. QA results (final run)
- Chat landing: `WELCOME TO SAKHI AI` OK, `Chat Mode` OK, `START NEW CONVERSATION` OK, **no voice/mic affordance** OK.
- Modal opens, "Name your conversation" OK; after start: sidebar + empty state OK; composer hint OK.
- Real Gemini reply: answer pane 534–744 chars, real answer present, no `*` markers, no error bubble, error-free console.
- Voice welcome: Sakhi / Voice / START YOUR NEW VOICE CONVERSATION / Hindi / Hinglish all OK; "Live Transcript" + orb control OK after start.

## 17. Issues found & fixed (this session)
1. New-conversation modal did not open from the landing — modal JSX lived only in the workspace return; extracted to a shared `newConversationModal` rendered in both.
2. Passing `GEMINI_API_KEY` through terminal output — avoided going forward; never printed or committed.
3. `/api/chat/conversations` 500 — missing Supabase tables; applied `step4_sakhi_memory.sql` (owner) → 200.
4. 500 persisted after tables were created — dev persona non-UUID ids; fixed to UUIDs.
5. Post-create chat never left the landing — missing `setShowLanding(false)` in `createNamedConversation`; added.
6. `gemini-2.0-flash` deprecated → `GEMINI_MODEL=gemini-3.6-flash`.
7. QA-only false negatives on uppercase text and placeholder text; scripts corrected.

## 18. TypeScript verification
`npx tsc --noEmit` → **TSC CLEAN** (after all edits, including the shared modal refactor).

## 19. Production build
`npm run build` → success. Routes emitted include `○ /companion (16 kB)` and `ƒ /companion/voice (12 kB)`; middleware 49.8 kB; no build errors.

## 20. Client-bundle secret audit
Scanned all 60 files under `.next/static` for `GEMINI_API_KEY`, `x-goog-api-key`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, and `AIza…`-style keys → **CLEAN** (no secrets in client bundles).

## 21. Known limitations / notes
- `dev-server.log` and the deleted design photo are untracked byproducts; several modified files predate this session.
- Headless Edge cannot exercise real microphone STT or full WebGL avatar rendering; those paths were verified via fallback UI and API evidence, and loud failure modes (banner + Retry) are in place.
- Applying the migration to the remote project was done by the repository owner; this sandbox has no direct Postgres route (DNS + port filtering).
- A one-time accidental exposure of the Gemini key in a terminal tool output is noted for the record; the key was not persisted to the repo or report.

## 22. Files changed / not committed
Modified: `app/api/chat/conversations/route.ts`, `app/api/chat/route.ts`, `app/companion/page.tsx`, `app/globals.css`, `components/AppSidebar.tsx`, `components/companion/SakhiOrb.tsx`, `components/companion/VoiceModePortal.tsx`, `lib/ai/provider.ts`, `lib/db/sakhiMemory.ts`, `lib/devAuth.ts`, `lib/sakhiAI.ts`, `lib/sakhiReasoning.ts`, `lib/voice/speech.ts`, `package.json`, `package-lock.json`.
New untracked: `app/companion/voice/`, `app/share/`, `app/api/ai/`, `app/api/chat/conversations/[id]/`, `app/api/chat/share/`, `lib/ai/gemini.ts`, `components/companion/LiveSakhiAvatar.tsx`, `types/talkinghead.d.ts`, `public/assets/design/sakhi.glb`, `THIRD_PARTY_LICENSES.md`.
Deleted (untracked file removed): `public/assets/design/photo_2026-09-12_17-27-45.jpg`.
README & report infrastructure unchanged. **No commit or push was made.**

## NOTE: Voice Model Correction (2026-09-13)

The previously documented English voice model `en_US-amy-medium` was incorrect. The actual installed and configured English voice model is `en_GB-aru-medium`. This has been corrected in:
- `lib/voice/localPiper.ts` (VOICE_BY_LANGUAGE configuration)
- `app/api/voice/tts/route.ts` (API documentation)
- All related comments and documentation

The Piper sidecar correctly loads and uses `en_GB-aru-medium.onnx` for English language synthesis.