export { normalizeEmailText, tokenize, isPlaceholder } from "./tokenizer";
export { tfidfVector, l2Normalize } from "./tfidf";
export {
  classifyEmail,
  loadArtifact,
  predictProbabilities,
} from "./inference";
export { ML_CLASS_LABELS } from "./types";
export type {
  MlClassLabel,
  ClassifierArtifact,
  ClassificationResult,
  ModelMeta,
} from "./types";