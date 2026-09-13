"use client";

/**
 * LiveSakhiAvatar — React shell around a real 3D human head-and-shoulders
 * avatar rendered with TalkingHead (met4citizen) + Three.js (WebGL).
 *
 *  - The GLB (public/assets/design/sakhi.glb, Ready Player Me "brunette",
 *    CC BY-NC 4.0) ships ARKit + Oculus viseme blend shapes, so TalkingHead
 *    drives a phoneme-level mouth from timed words via its `speakAudio` queue.
 *  - The page remains the audio source of truth (Web Speech API): on TTS
 *    onStart the page calls speakStart(sentence) — we enqueue a viseme track
 *    clocked by a silent AudioBuffer of an estimated sentence duration — and
 *    on onEnd/onError the page calls speakEnd(), which stops the queue, so the
 *    mouth NEVER animates when audio is not being produced.
 *  - Custom "warm" / "concern" moods are layered over the built-in
 *    neutral/happy moods; blinking, breathing, head movement and idle eye
 *    contact come from the runtime's own animation loop.
 *  - Boot / loading / error states are polished; no fake "live" state is ever
 *    shown before the model is actually loaded.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { TalkingHead } from "@met4citizen/talkinghead";
import { LipsyncEn } from "@met4citizen/talkinghead/modules/lipsync-en.mjs";

const SAKHI_GLB = "/assets/design/sakhi.glb";

// Web Speech exposes no audio timestamps, so we drive the viseme timeline with
// an estimated character rate. onEnd() always cancels the remainder (speakEnd),
// so the mouth can never outrun the real audio.
const CHARS_PER_SECOND = 15.5;
const TAIL_PAD_MS = 320;

/**
 * Converts a timed-word track into TalkingHead viseme animation events using
 * the library's own English G2P module, then pushes them straight onto the
 * engine's animQueue. This is the SAME entry shape speakAudio() produces
 * (talkinghead.mjs `speakAudio` -> `template:{name:'viseme'}`, ts =
 * [rise, hold, release]) and the slide's 'viseme_*' morph targets are driven
 * by the engine's animation clock — real per-phoneme mouth shapes, no timers.
 *
 * We bypass the Web Audio playlist on purpose: that path only queues visemes
 * once a WebAudio buffer is actually PLAYING, and browsers keep the
 * AudioContext suspended until a user gesture, so an auto-run intro (no
 * gesture) would silently drop every viseme. Directly scheduling the same
 * visemes decouples the mouth from autoplay policy while speech (via page
 * TTS onStart/onEnd) stays the source of truth for WHEN she talks.
 */
function pushG2pVisemes(head: any, sentence: string): boolean {
  if (!head?.lipsyncWordsToVisemes || !head?.lipsyncPreProcessText) return false;

  // Clean punctuation ourselves BEFORE G2P: the lib expands '?', '%', '&' …
  // into spoken words (" question mark ") which the real voice never says,
  // which would add ghost mouth movement.
  const cleaned = sentence
    .replace(/[?%&+$]/g, " ")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return false;

  const totalChars = words.join("").length;
  const estMs = Math.max(1100, Math.round((totalChars / CHARS_PER_SECOND) * 1000) + TAIL_PAD_MS);
  const charUnit = estMs / Math.max(1, totalChars);

  const wtimes: number[] = [];
  const wdurations: number[] = [];
  let cursor = 0;
  for (const word of words) {
    const dur = Math.max(90, Math.round(word.length * charUnit));
    wtimes.push(cursor);
    wdurations.push(dur);
    cursor += dur;
  }
  const scale = estMs / Math.max(1, cursor);
  for (let i = 0; i < wdurations.length; i += 1) {
    wdurations[i] = Math.round(wdurations[i] * scale);
    if (i > 0) wtimes[i] = wtimes[i - 1] + wdurations[i - 1];
  }

  // Start the track just after the current animation clock so no early event
  // is skipped by the engine (which guards `animClock < x.ts[0]; continue`).
  const base = head.animClock + 24;
  const entries: any[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const time = wtimes[i];
    let duration = wdurations[i];
    if (!word.length || !duration) continue;

    let val: any = null;
    try {
      val = head.lipsyncWordsToVisemes(head.lipsyncPreProcessText(word, "en"), "en");
    } catch {
      continue;
    }
    if (!val || !val.visemes || !val.visemes.length) continue;

    const dTotal = val.times[val.visemes.length - 1] + val.durations[val.visemes.length - 1];
    if (!(dTotal > 0)) continue;

    // Same intensity scheduling as the library: longer words mouth wider.
    const overdrive = Math.min(duration, Math.max(0, duration - val.visemes.length * 150));
    const level = 0.6 + (duration > 0 ? (overdrive / duration) * 0.4 : 0);
    const durTarget = Math.min(duration, val.visemes.length * 200);

    for (let j = 0; j < val.visemes.length; j += 1) {
      const tt = time + (val.times[j] / dTotal) * durTarget;
      const d = (val.durations[j] / dTotal) * durTarget;
      const viseme = val.visemes[j];
      const peak = viseme === "PP" || viseme === "FF" ? 0.9 : level;
      entries.push({
        template: { name: "viseme" },
        ts: [
          base + tt - Math.min(60, (2 * d) / 3),
          base + tt + Math.min(25, d / 2),
          base + tt + d + Math.min(60, d / 2),
        ],
        vs: { ["viseme_" + viseme]: [null, peak, 0] },
      });
    }
  }

  if (!entries.length) return false;

  // Clamp the earliest onset so nothing starts before the engine clock.
  const minStart = Math.min(...entries.map((e) => e.ts[0]));
  if (minStart < head.animClock) {
    const shift = head.animClock - minStart + 16;
    for (const e of entries) {
      for (let k = 0; k < e.ts.length; k += 1) e.ts[k] += shift;
    }
  }

  head.animQueue.push(...entries);
  return true;
}

export type SakhiAvatarStatus = "loading" | "ready" | "error";
export type SakhiExpression = "neutral" | "warm" | "concern";

interface SakhiDebug {
  version: number;
  getHead: () => any | null;
  state: () => Record<string, unknown>;
  watch: (maxFrames?: number) => void;
  stopWatch: () => void;
}

declare global {
  interface Window {
    __sakhiDebug?: SakhiDebug;
  }
}

// Dev-only diagnostic — proves whether G2P entries reach the engine and
// whether the REAL face-mesh morphTargetInfluences actually change while
// Sakhi speaks. Set window.__sakhiDebugWatch = true before pressing play.
let sakhiDebugWatch = false;
let sakhiDebugFrames = 0;
const DEBUG_PROBES = [
  "viseme_aa",
  "viseme_E",
  "viseme_I",
  "viseme_O",
  "viseme_U",
  "viseme_PP",
  "viseme_FF",
  "viseme_SS",
  "jawOpen",
  "mouthOpen",
];

function installSakhiDebug(host: {
  getHead: () => any | null;
  getStatus: () => SakhiAvatarStatus;
  getLastPush: () => Record<string, unknown> | null;
}) {
  if (typeof window === "undefined") return;
  const api: SakhiDebug = {
    version: 1,
    getHead: host.getHead,
    state: () => {
      const head = host.getHead();
      if (!head) return { status: host.getStatus() };
      const mesh = head.armature?.getObjectByName("Wolf3D_Head");
      const dict = mesh?.morphTargetDictionary;
      const infl = mesh?.morphTargetInfluences;
      return {
        status: host.getStatus(),
        lastPush: host.getLastPush(),
        animClock: Math.round(head.animClock),
        queuedVisemes: head.animQueue.filter((x: any) => x.template?.name === "viseme").length,
        mtAvatarVisemeKeys: Object.keys(head.mtAvatar).filter((k) => k.startsWith("viseme")).length,
        mtAvatarHasJaw: head.mtAvatar.hasOwnProperty("jawOpen"),
        meshDictHasViseme: Boolean(dict?.["viseme_aa"]),
        sample: DEBUG_PROBES.reduce((acc, name) => {
          const i = dict?.[name];
          acc[name] = i === undefined ? null : infl?.[i] ?? null;
          return acc;
        }, {} as Record<string, number | null>),
        isRunning: head.isRunning,
        isAvatarOnly: head.isAvatarOnly,
      };
    },
    watch: (maxFrames = 600) => {
      sakhiDebugWatch = true;
      sakhiDebugFrames = Math.max(1, maxFrames);
      console.info("[__sakhiDebug] sampling real mesh morphTargetInfluences…");
    },
    stopWatch: () => {
      sakhiDebugWatch = false;
      console.info("[__sakhiDebug] sampling stopped");
    },
  };
  window.__sakhiDebug = api;
}

// Called from the engine's rAF via opt.update to sample the REAL mesh values
// every frame while the debug watch is on.
function debugFrameSample(head: any, _dt?: number) {
  if (!sakhiDebugWatch || !head?.armature) return;
  if (sakhiDebugFrames-- <= 0) {
    sakhiDebugWatch = false;
    return;
  }
  const mesh = head.armature.getObjectByName("Wolf3D_Head");
  const dict = mesh?.morphTargetDictionary;
  const infl = mesh?.morphTargetInfluences;
  if (!dict || !infl) return;
  const vals = DEBUG_PROBES.map((name) => {
    const i = dict[name];
    return i === undefined ? 0 : infl[i];
  });
  const max = Math.max(...vals.map(Math.abs));
  if (max > 0.05) {
    const line = vals
      .map((v, i) => `${DEBUG_PROBES[i]}=${v.toFixed(2)}`)
      .join(" ");
    console.info(`[__sakhiDebug] t=${Math.round(head.animClock)} ${line}`);
  }
}

export interface LiveSakhiAvatarHandle {
  /** Begin lip-syncing `sentence` — call on TTS onStart. */
  speakStart: (sentence: string) => void;
  /** Stop all mouth activity — call on TTS onEnd/onError/cancel. */
  speakEnd: () => void;
  /** Switch Sakhi's expression (maps onto a TalkingHead mood). */
  setExpression: (expression: SakhiExpression) => void;
}

interface LiveSakhiAvatarProps {
  isSpeaking: boolean;
  reducedMotion: boolean;
  className?: string;
  onStatus?: (status: SakhiAvatarStatus) => void;
}

function moodBaseline(expression: SakhiExpression): Record<string, number> {
  switch (expression) {
    case "warm":
      return {
        mouthSmile: 0.18,
        browInnerUp: 0.16,
        eyesLookDown: 0.1,
        mouthDimpleLeft: 0.05,
        mouthDimpleRight: 0.05,
      };
    case "concern":
      return {
        browInnerUp: 0.34,
        eyeSquintLeft: 0.16,
        eyeSquintRight: 0.16,
        mouthPressLeft: 0.14,
        mouthPressRight: 0.14,
        mouthFrownLeft: 0.08,
        mouthFrownRight: 0.08,
        eyesLookDown: 0.12,
      };
    default:
      return { eyesLookDown: 0.1 };
  }
}

function buildMoods(head: any) {
  const eyes = head.animTemplateEyes;
  const blink = head.animTemplateBlink;

  head.animMoods["warm"] = {
    baseline: moodBaseline("warm"),
    speech: { deltaRate: 0, deltaPitch: 0.08, deltaVolume: 0 },
    anims: [
      head.animMoods.happy.anims[0],
      head.animMoods.happy.anims[1],
      head.animMoods.neutral.anims[2],
      eyes,
      blink,
      {
        name: "mouth",
        delay: [1500, 6000],
        dt: [[100, 500], [100, 5000, 2]],
        vs: {
          mouthSmile: [[0, 0.25, 3]],
          mouthLeft: [[0, 0.2, 2]],
          mouthRollLower: [[0, 0.25, 2]],
          mouthRollUpper: [[0, 0.25, 2]],
          mouthStretchLeft: [[0, 0.2]],
          mouthStretchRight: [[0, 0.2]],
          mouthPucker: [[0, 0.2]],
        },
      },
      {
        name: "misc",
        delay: [900, 5000],
        dt: [[100, 500], [1200, 5000, 2]],
        vs: {
          browInnerUp: [[0, 0.35, 2]],
          eyeSquintLeft: [[0, 0.18, 2]],
          eyeSquintRight: [[0, 0.18, 2]],
          browOuterUpLeft: [[0, 0.15, 2]],
          browOuterUpRight: [[0, 0.15, 2]],
        },
      },
    ],
  };

  head.animMoods["concern"] = {
    baseline: moodBaseline("concern"),
    speech: { deltaRate: 0, deltaPitch: 0, deltaVolume: 0 },
    anims: [
      {
        name: "breathing",
        delay: 1800,
        dt: [1400, 500, 1400],
        vs: { chestInhale: [0.45, 0.45, 0] },
      },
      {
        name: "pose",
        alt: [
          { p: 0.5, delay: [5000, 30000], vs: { pose: ["side"] } },
          { p: 0.3, delay: [5000, 30000], vs: { pose: ["straight"] } },
          { delay: [5000, 30000], vs: { pose: ["hip"] } },
        ],
      },
      head.animMoods.neutral.anims[2],
      eyes,
      blink,
      {
        name: "mouth",
        delay: [1200, 6000],
        dt: [[100, 500], [1200, 6000, 2]],
        vs: {
          mouthPressLeft: [[0, 0.3, 2]],
          mouthPressRight: [[0, 0.3, 2]],
          mouthRollLower: [[0, 0.2, 2]],
          mouthRollUpper: [[0, 0.2, 2]],
          mouthPucker: [[0, 0.15]],
        },
      },
      {
        name: "misc",
        delay: [600, 4500],
        dt: [[100, 500], [1500, 6000, 2]],
        vs: {
          browInnerUp: [[0.15, 0.6, 2]],
          browDownLeft: [[0, 0.15, 2]],
          eyeSquintLeft: [[0, 0.3, 2]],
          eyeSquintRight: [[0, 0.3, 2]],
        },
      },
    ],
  };
}

export const LiveSakhiAvatar = forwardRef<LiveSakhiAvatarHandle, LiveSakhiAvatarProps>(
  function LiveSakhiAvatar(
    { isSpeaking, reducedMotion, className = "", onStatus },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const headRef = useRef<any>(null);
    const lipsyncRef = useRef<LipsyncEn | null>(null);
    const statusRef = useRef(onStatus);
    const statusNowRef = useRef<SakhiAvatarStatus>("loading");
    const lastPushRef = useRef<Record<string, unknown> | null>(null);
    const pendingSentenceRef = useRef<string | null>(null);
    const pendingExpressionRef = useRef<SakhiExpression | null>(null);

    const [status, setStatus] = useState<SakhiAvatarStatus>("loading");
    const [errMsg, setErrMsg] = useState<string | null>(null);

    statusRef.current = onStatus;

    const report = (next: SakhiAvatarStatus) => {
      statusNowRef.current = next;
      setStatus(next);
      statusRef.current?.(next);
    };

    useEffect(() => {
      let cancelled = false;
      let head: any = null;
      const container = containerRef.current;
      if (!container || typeof window === "undefined") return;

      // TalkingHead's stop() never removes its renderer canvas from the DOM
      // (it only halts the loop and suspends the AudioContext). In dev,
      // StrictMode/HMR remounts this effect on the SAME container div, which
      // would stack a second canvas + frozen duplicate model behind the live
      // one. Purge any stale canvases so there is EXACTLY ONE renderer/model.
      container.querySelectorAll("canvas").forEach((c) => c.remove());

      void (async () => {
        try {
          const dpr = Math.min(2, window.devicePixelRatio || 1);

          head = new TalkingHead(container, {
            lipsyncLang: "en",
            lipsyncModules: [],
            avatarIdleEyeContact: reducedMotion ? 0.15 : 0.35,
            avatarIdleHeadMove: reducedMotion ? 0.15 : 0.4,
            avatarSpeakingEyeContact: 0.6,
            modelPixelRatio: dpr,
            modelFPS: 30,
            cameraRotateEnable: false,
            cameraPanEnable: false,
            cameraZoomEnable: false,
            avatarMood: "neutral",
            update: (dt: number) => debugFrameSample(headRef.current, dt),
          });

          lipsyncRef.current = new LipsyncEn();
          head.lipsync = { en: lipsyncRef.current };

          buildMoods(head);

          await head.showAvatar(
            { url: SAKHI_GLB, body: "F", lipsyncLang: "en", avatarMood: "neutral" },
            () => {}
          );

          if (cancelled || !head.armature) throw new Error("Avatar rig failed to load");

          head.setView("upper", { cameraDistance: 0.4, cameraX: 0, cameraY: 0.44 });

          // Crimson environment — cool ambient, warm key, crimson rim from behind.
          head.setLighting({
            lightAmbientColor: "#4a4466",
            lightAmbientIntensity: 0.5,
            lightDirectColor: "#ffdfc8",
            lightDirectIntensity: 1.35,
            lightDirectPhi: 1.1,
            lightDirectTheta: 0.8,
            lightSpotColor: "#e11d48",
            lightSpotIntensity: 2.3,
            lightSpotPhi: 0.45,
            lightSpotTheta: 3.0,
            lightSpotDispersion: 0.5,
          });

          headRef.current = head;
          if (cancelled) return;

          // The page may call speakStart while the model is still loading and
          // headRef is still null (auto-run intro fires at ~600ms). Buffer the
          // sentence/expression and flush them the moment the avatar is ready,
          // otherwise the mouth stays silent for that entire run.
          const pendingSentence = pendingSentenceRef.current;
          pendingSentenceRef.current = null;
          if (pendingSentence) {
            try {
              head.stopSpeaking();
              pushG2pVisemes(head, pendingSentence);
              lastPushRef.current = {
                at: Date.now(),
                sentence: pendingSentence.slice(0, 60),
                flushed: true,
                animClock: Math.round(head.animClock),
                pushed: head.animQueue.filter(
                  (x: any) => x.template?.name === "viseme"
                ).length,
              };
            } catch {
              /* never let lip-sync take Chat/Voice down */
            }
          }
          if (pendingExpressionRef.current) {
            const expression = pendingExpressionRef.current;
            pendingExpressionRef.current = null;
            try {
              head.setMood(expression);
              head.makeEyeContact(4000);
            } catch {
              /* noop */
            }
          }

          installSakhiDebug({
            getHead: () => headRef.current,
            getStatus: () => statusNowRef.current,
            getLastPush: () => lastPushRef.current,
          });
          report("ready");
        } catch (err) {
          console.error("[LiveSakhiAvatar] init failed", err);
          if (cancelled) return;
          const msg =
            err instanceof Error
              ? err.message
              : "Avatar failed to initialize. Chat Mode and Voice Mode still work below.";
          setErrMsg(msg);
          report("error");
        }
      })();

      return () => {
        cancelled = true;
        headRef.current = null;
        try {
          head?.stop();
          // TalkingHead's stop() leaves renderer.domElement in the DOM — remove
          // and dispose it so an unmount/remount can never stack two canvases.
          head?.renderer?.domElement?.remove();
          head?.renderer?.dispose?.();
          head?.resizeobserver?.disconnect?.();
        } catch {
          /* noop */
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(
      ref,
      (): LiveSakhiAvatarHandle => ({
        speakStart(sentence) {
          if (!sentence) return;
          const head = headRef.current;
          if (!head) {
            // Avatar still loading — remember it and flush once ready.
            pendingSentenceRef.current = sentence;
            return;
          }
          pendingSentenceRef.current = null;
          let pushed = false;
          try {
            head.stopSpeaking();
            pushed = pushG2pVisemes(head, sentence);
          } catch {
            /* never let lip-sync take Chat/Voice down */
          }
          lastPushRef.current = {
            at: Date.now(),
            sentence: sentence.slice(0, 60),
            pushed,
            animClock: Math.round(head.animClock),
            queuedVisemes: head.animQueue.filter(
              (x: any) => x.template?.name === "viseme"
            ).length,
          };
          try {
            head.lookAtCamera(500);
          } catch {
            /* optional */
          }
          if (!pushed) {
            console.warn(
              "[LiveSakhiAvatar] G2P produced no visemes for:",
              sentence.slice(0, 80)
            );
          }
        },
        speakEnd() {
          pendingSentenceRef.current = null;
          const head = headRef.current;
          if (!head) return;
          try {
            head.stopSpeaking();
          } catch {
            /* noop */
          }
        },
        setExpression(expression) {
          const head = headRef.current;
          if (!head) {
            pendingExpressionRef.current = expression;
            return;
          }
          pendingExpressionRef.current = null;
          try {
            const mood =
              expression === "warm"
                ? "warm"
                : expression === "concern"
                  ? "concern"
                  : "neutral";
            head.setMood(mood);
            head.makeEyeContact(expression === "concern" ? 2200 : 4000);
          } catch {
            /* noop */
          }
        },
      }),
      []
    );

    const pill = status === "ready" ? (isSpeaking ? "speaking" : "live") : null;

    return (
      <div
        className={`sakhi-avatar-3d ${className}`}
        ref={containerRef}
        role="img"
        aria-label="Sakhi, a 3D companion avatar"
      >
        {status === "loading" && (
          <div className="sakhi-avatar-state" role="status">
            <div className="sakhi-avatar-boot" aria-hidden />
            <p>Loading Sakhi&hellip;</p>
          </div>
        )}

        {status === "error" && (
          <div className="sakhi-avatar-state" role="status">
            <p className="sakhi-avatar-state-title">Avatar failed to start</p>
            <p className="sakhi-avatar-state-desc">
              {errMsg ?? "An unexpected error occurred. Chat Mode and Voice Mode still work below."}
            </p>
          </div>
        )}

        {pill && (
          <div
            className="sakhi-avatar-pill"
            role="status"
            aria-label={pill === "speaking" ? "Sakhi speaking" : "Sakhi live"}
          >
            <span className={`sakhi-avatar-dot ${pill === "speaking" ? "is-speaking" : ""}`} aria-hidden />
            <span className="sakhi-avatar-pill-text">
              {pill === "speaking" ? "Speaking" : "Live"}
            </span>
          </div>
        )}
      </div>
    );
  }
);