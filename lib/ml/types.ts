/**
 * Shared types for the Cyber Sakhi ML email classifier.
 */

export const ML_CLASS_LABELS = [
  "legitimate",
  "suspicious",
  "impersonated",
  "phishing",
  "fraud-related",
] as const;

export type MlClassLabel = (typeof ML_CLASS_LABELS)[number];

export interface ClassifierArtifact {
  format: string;
  version: number;
  classes: string[];
  vocabulary: Record<string, number>;
  idf: Record<string, number>;
  coef: Record<string, number[]>;
  intercept: Record<string, number>;
  params: Record<string, unknown>;
  meta: {
    [key: string]: unknown;
  };
}

export interface ModelMeta {
  dataset: string;
  trainSize: number;
  testSize: number;
  accuracy: number;
  precisionMacro: number;
  recallMacro: number;
  f1Macro: number;
}

export interface ClassificationResult {
  /** Whether a trained model artifact was available at runtime. */
  available: boolean;
  /** Predicted class label, null when the model is unavailable. */
  label: MlClassLabel | null;
  /** Probability of the predicted class (max over softmax), 0..1. */
  confidence: number | null;
  /** Difference between the top-2 class probabilities, 0..1. */
  margin: number | null;
  /** Full softmax distribution over the 5 classes. */
  probabilities: Record<string, number> | null;
  /** Honest metadata about the model that produced the prediction. */
  modelMeta: ModelMeta | null;
  /** Why the model is unavailable (when `available` is false). */
  unavailableReason?: string;
}