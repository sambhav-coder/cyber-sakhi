/**
 * Runtime inference for the Cyber Sakhi ML email classifier.
 *
 * Re-implements, in pure TypeScript, the multinomial softmax classifier
 * trained by `scripts/ml/train.py`. The classifier consumes the exported
 * artifact (models/ml/email_classifier.json):
 *
 *   score(c)     = intercept[c] + sum_i coef[c][i] * x_i
 *   p(c)         = softmax(score)
 *   label        = argmax_c p(c)
 *
 * where x is the L2-normalized, smooth-idf, sublinear-tf TF-IDF vector over
 * the artifact vocabulary (unigrams + adjacent-word bigrams).
 *
 * Honesty rules:
 *   * Training NEVER happens at runtime; inference only reads a pre-trained
 *     artifact.
 *   * If the artifact is absent the result reports `available: false` with a
 *     reason — we do not fall back to a fabricated answer.
 *   * Reported confidence is the literal softmax probability of the model,
 *     not a made-up figure.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { l2Normalize, tfidfVector } from "./tfidf";
import { normalizeEmailText, tokenize } from "./tokenizer";
import {
  ClassificationResult,
  ClassifierArtifact,
  MlClassLabel,
  ModelMeta,
} from "./types";

export const RUNTIME_ARTIFACT_PATH = join(
  process.cwd(),
  "models",
  "ml",
  "email_classifier.json"
);

let cachedArtifact: ClassifierArtifact | null = null;
let cachedArtifactPath: string | null = null;

export function loadArtifact(path: string): ClassifierArtifact {
  if (cachedArtifact !== null && cachedArtifactPath === path) {
    return cachedArtifact;
  }
  if (!existsSync(path)) {
    throw new Error(`ML classifier artifact not found at ${path}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as ClassifierArtifact;
  if (
    parsed.format !== "cyber-sakhi-email-classifier" ||
    parsed.version !== 1
  ) {
    throw new Error(`Unsupported ML classifier artifact at ${path}`);
  }
  cachedArtifact = parsed;
  cachedArtifactPath = path;
  return parsed;
}

export function artifactUnavailableReason(path: string): string | null {
  if (!existsSync(path)) {
    return `Model artifact missing at ${path}. Regenerate it with scripts/ml (see DATASET.md / MODELS.md).`;
  }
  try {
    loadArtifact(path);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export interface Prediction {
  probabilities: Record<string, number>;
  label: MlClassLabel;
  confidence: number;
  margin: number;
}

/**
 * Compute the softmax distribution for pre-tokenized normalized text.
 * Pure function; unit-testable without filesystem access.
 */
export function predictProbabilities(
  featureText: string,
  artifact: ClassifierArtifact
): Prediction {
  const tokens = tokenize(featureText);
  const x = l2Normalize(
    tfidfVector(tokens, artifact.vocabulary, artifact.idf)
  );

  const scores: number[] = [];
  for (const cls of artifact.classes) {
    const coef = artifact.coef[cls];
    let s = artifact.intercept[cls] ?? 0;
    for (const [idx, val] of x) {
      const w = coef[idx];
      if (w !== undefined) s += w * val;
    }
    scores.push(s);
  }

  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - maxScore));
  const total = exps.reduce((a, b) => a + b, 0);

  const probabilities: Record<string, number> = {};
  for (let i = 0; i < artifact.classes.length; i++) {
    probabilities[artifact.classes[i]] = exps[i] / total;
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topIdx = ranked[0][0];
  const secondIdx = ranked.length > 1 ? ranked[1][0] : topIdx;
  const confidence = exps[topIdx] / total;
  const margin =
    total === 0 ? 0 : Math.abs(exps[topIdx] - exps[secondIdx]) / total;

  return {
    probabilities,
    label: artifact.classes[topIdx] as MlClassLabel,
    confidence,
    margin,
  };
}

export function toModelMeta(meta: ClassifierArtifact["meta"]): ModelMeta {
  return {
    dataset: String(meta.dataset ?? ""),
    trainSize: Number(meta.train_size ?? 0),
    testSize: Number(meta.test_size ?? 0),
    accuracy: Number(meta.accuracy ?? 0),
    precisionMacro: Number(meta.precision_macro ?? 0),
    recallMacro: Number(meta.recall_macro ?? 0),
    f1Macro: Number(meta.f1_macro ?? 0),
  };
}

export interface ClassifyOptions {
  /** Path to a classifier artifact. Defaults to RUNTIME_ARTIFACT_PATH. */
  artifactPath?: string;
  /** Pre-loaded artifact (used by tests). Takes precedence over artifactPath. */
  artifact?: ClassifierArtifact;
}

/**
 * Classify an email's subject + body with the trained model.
 *
 * The feature text is `normalizeEmailText(subject + " " + body)`, which must
 * match `scripts/ml/prepare.py` (`normalize_email_text(f"{subject} {body}")`).
 */
export function classifyEmail(
  subject: string | null | undefined,
  body: string | null | undefined,
  options: ClassifyOptions = {}
): ClassificationResult {
  const artifactPath = options.artifactPath ?? RUNTIME_ARTIFACT_PATH;

  let artifact: ClassifierArtifact;
  if (options.artifact) {
    artifact = options.artifact;
  } else {
    const reason = artifactUnavailableReason(artifactPath);
    if (reason !== null) {
      return {
        available: false,
        label: null,
        confidence: null,
        margin: null,
        probabilities: null,
        modelMeta: null,
        unavailableReason: reason,
      };
    }
    artifact = loadArtifact(artifactPath);
  }

  const featureText = normalizeEmailText(`${subject ?? ""} ${body ?? ""}`);
  const { probabilities, label, confidence, margin } =
    predictProbabilities(featureText, artifact);

  return {
    available: true,
    label,
    confidence,
    margin,
    probabilities,
    modelMeta: toModelMeta(artifact.meta),
  };
}