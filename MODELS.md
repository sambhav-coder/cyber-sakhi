# Cyber Sakhi ML Models

This document describes every model artifact that Cyber Sakhi ships or
regenerates, where it lives, how it is produced, and how the TypeScript
runtime consumes it. It exists so no component silently "works" on made-up
numbers: if a model is missing, the app says so instead of guessing.

## Artifacts

| Path | Purpose | Git? |
| --- | --- | --- |
| `models/ml/email_classifier.json` | Production 5-class email classifier (runtime) | **committed** (small, ~6 MB) |
| `models/ml/training_report.json` | Metric report incl. class imbalance + confusion matrix | regenerated; not committed |
| `models/ml/confusion_matrix.json` | Confusion matrix | regenerated; not committed |
| `models/ml/sample_predictions.json` | Recorded sklearn outputs used for sanity checks | regenerated; not committed |
| `tests/fixtures/ml/email_classifier_test.json` | Tiny synthetic model for CI unit tests | committed |
| `tests/fixtures/ml/test_sample_predictions.json` | Recorded sklearn outputs for the tiny model | committed |
| `tests/fixtures/ml/tokenize_cases.json` | Tokenizer parity ground truth | committed |

Everything under `models/piper` and `models/vosk` is the unrelated local
voice/TTS stack (not ML classification) and stays git-ignored.

## Runtime classifier (`models/ml/email_classifier.json`)

- **Format**: `cyber-sakhi-email-classifier`, `version: 1`.
- **Model**: multinomial Logistic Regression (`lbfgs`,
  `class_weight="balanced"`) trained on the corpus described in
  [DATASET.md](DATASET.md).
- **Features**: TF-IDF over a 60,000-token vocabulary (unigrams +
  adjacent-word bigrams), smooth-idf, sublinear-tf, L2 row normalization.
  The tokenizer/normalizer is specified once (Python) and mirrored exactly in
  TypeScript (`lib/ml/tokenizer.ts`); parity is enforced by unit tests.
- **Inference**: pure TypeScript (`lib/ml/inference.ts`) — reads the JSON
  artifact, builds the TF-IDF vector, computes
  `softmax(intercept + coef·x)`. Reproduces scikit-learn to <1e-6.

The classifier is loaded lazily once per process and cached. Training never
runs at application startup. If the artifact file is missing at runtime,
`classifyEmail()` returns `available: false` with an explicit reason; the
forensic pipeline treats that as "model unavailable" — never as a fabricated
answer.

## Regenerating the production model

```powershell
& .\.ml-venv\Scripts\python scripts\ml\prepare.py   # clean + label-map + split
& .\.ml-venv\Scripts\python scripts\ml\train.py     # train -> models/ml/email_classifier.json
```

Requirements: Python 3.14, `scikit-learn==1.9.1`, `numpy`, `scipy`
(pre-installed in `.ml-venv`, which is git-ignored).

## Test fixture (`tests/fixtures/ml/*`)

Built by `scripts/ml/make_test_model.py` from a small synthetic corpus using
the **same pipeline and file format** as production. It is the target of
`tests/ml/inference.test.ts` (softmax parity ≤1e-6, label parity, artifact
validation) so CI can verify the TS replica without downloading the dataset
or shipping the big model.

## CI / verification

- `npm test` — Vitest: tokenizer parity + inference parity (15 tests).
- `npx tsc --noEmit` — type-checks `lib/ml/*`.
- `npm run build` — Next.js production build (imports `lib/ml`).