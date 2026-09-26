/**
 * Statistical URL-risk scorer (url-risk-lr-v1, experimental).
 *
 * Mirrors scripts/gov-datasets/train-url-risk-model.py exactly: same
 * lexical features, same z-scoring, same sigmoid. Scores are UNCALIBRATED
 * model outputs, not probabilities. The out-of-distribution probe (46.5%
 * flag rate on reporter-tagged phishing URLs) is surfaced wherever scores
 * are shown: every output is a suggestion requiring analyst review.
 */

import modelJson from "@/docs/ml/url-risk-v1/model.json";
import { scoreUrlRisk, URL_RISK_FEATURE_SCHEMA } from "./urlRiskRules";

interface ModelArtifact {
  version: string;
  trained_at: string;
  feature_order: string[];
  scaler_mean: number[];
  scaler_var: number[];
  coefficients: number[];
  intercept: number;
  threshold: number;
}

const MODEL = modelJson as ModelArtifact;

export function modelVersion(): string {
  return MODEL.version;
}

function extractFeatures(raw: string): number[] | null {
  let u: URL;
  try {
    u = new URL(raw.includes("://") ? raw : `http://${raw}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  } catch {
    return null;
  }
  const host = (u.hostname || "").toLowerCase();
  if (!host) return null;
  const path = u.pathname + u.search;
  const labels = host.split(".");
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const depth = isIp ? 0 : Math.max(0, labels.length - 2);
  const digits = (host.match(/[0-9]/g) ?? []).length;
  const segs = u.pathname.split("/").filter(Boolean);
  const ext = segs.length > 0 && segs[segs.length - 1].includes(".")
    ? (segs[segs.length - 1].split(".").pop() ?? "").toLowerCase()
    : "";
  const execExt = new Set(["exe","msi","bat","cmd","ps1","vbs","vbe","js","jse","jar","bin","sh","dll","scr","msc","hta","cpl","gadget","apk","com","pif"]);
  const shorteners = new Set(["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","is.gd","buff.ly","adf.ly","cutt.ly","tiny.cc","rebrand.ly","shorturl.at"]);
  const watchTlds = new Set(["top","xyz","lol","cfd","live","info","online","space","life","buzz","monster","click","rest","sbs","quest","vip","gift","gdn","bid","win","date","loan","ooo","tk","ml","ga","cf","gq"]);
  return [
    raw.length, host.length, path.length,
    (raw.match(/\./g) ?? []).length, (raw.match(/-/g) ?? []).length,
    digits / Math.max(1, host.length), depth,
    isIp ? 1 : 0, raw.includes("@") ? 1 : 0, host.includes("xn--") ? 1 : 0,
    u.port && u.port !== "80" && u.port !== "443" ? 1 : 0,
    segs.length > 4 ? 1 : 0, execExt.has(ext) ? 1 : 0,
    shorteners.has(host) ? 1 : 0,
    watchTlds.has(labels[labels.length - 1] ?? "") ? 1 : 0,
    u.protocol === "https:" ? 1 : 0,
  ];
}

export interface ModelScore {
  score: number;
  aboveThreshold: boolean;
  calibrated: false;
  version: string;
  reviewState: "NEEDS_ANALYST_REVIEW";
}

export function scoreUrlModel(raw: string): (ModelScore & { rules: ReturnType<typeof scoreUrlRisk> }) | null {
  const f = extractFeatures(raw);
  if (!f || f.length !== URL_RISK_FEATURE_SCHEMA.length) return null;
  let z = MODEL.intercept;
  for (let i = 0; i < f.length; i++) {
    const sd = Math.sqrt(MODEL.scaler_var[i]);
    z += MODEL.coefficients[i] * ((f[i] - MODEL.scaler_mean[i]) / (sd === 0 ? 1 : sd));
  }
  const score = 1 / (1 + Math.exp(-z));
  return {
    score,
    aboveThreshold: score >= MODEL.threshold,
    calibrated: false as const,
    version: MODEL.version,
    reviewState: "NEEDS_ANALYST_REVIEW",
    rules: scoreUrlRisk(raw),
  };
}
