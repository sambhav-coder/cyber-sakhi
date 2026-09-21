"""
Shared constants and helpers for the Cyber Sakhi ML training pipeline.

The Python pipeline and the TypeScript inference library (lib/ml/*) MUST
agree on:
  * text normalization (lowercase, URL/email/number token replacement)
  * tokenization (word-chars [A-Za-z0-9_] plus any code point > 127, len>=2)
  * n-gram construction (unigrams + adjacent word bigrams)
  * TF-IDF formula (sklearn-consistent smooth idf, L2 row normalization)
So both sides share this spec. Any change here MUST be mirrored in
lib/ml/tokenizer.ts, lib/ml/tfidf.ts and lib/ml/inference.ts.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "data" / "ml" / "raw"
PREPARED_DIR = PROJECT_ROOT / "data" / "ml" / "prepared"
MODEL_DIR = PROJECT_ROOT / "models" / "ml"

PREPARED_CSV = PREPARED_DIR / "emails.csv"
TEST_FIXTURE_CSV = PREPARED_DIR / "test_fixture.csv"
ARTIFACT_PATH = MODEL_DIR / "email_classifier.json"
TEST_ARTIFACT_PATH = MODEL_DIR / "email_classifier_test.json"
TRAINING_REPORT_PATH = MODEL_DIR / "training_report.json"
CONFUSION_MATRIX_PATH = MODEL_DIR / "confusion_matrix.json"
SAMPLE_PREDICTIONS_PATH = MODEL_DIR / "sample_predictions.json"
SPLIT_PATH = PREPARED_DIR / "test_split.json"

# ---------------------------------------------------------------------------
# Shared, documented feature/regularization hyper-parameters
# ---------------------------------------------------------------------------

CONFIG = {
    # feature extraction
    "ngrams": [1, 2],        # unigrams + adjacent-word bigrams
    "sublinear_tf": True,    # tf -> 1 + log(tf)
    "smooth_idf": True,      # idf -> log((1+n)/(1+df)) + 1
    "norm": "l2",            # row-normalize each document vector
    # vocabulary filtering (quality + artifact size)
    "min_df": 2,
    "max_df": 0.9,
    "max_features": 60000,
    # classifier
    "C": 1.0,
    "class_weight": "balanced",
    "solver": "lbfgs",
    "multi_class": "multinomial",
    "max_iter": 2000,
}

# ---------------------------------------------------------------------------
# CDN-style download URLs (Zenodo record 8339691, CC BY 4.0)
# ---------------------------------------------------------------------------

ZENODO_FILES = {
    # key (as stored on disk) -> (zenodo filename, md5, source label group)
    "enron.csv": ("Enron.csv", "md5:10489e0fdcc8af6fe62135c689367d40", "legit"),
    "spamassassin.csv": ("SpamAssasin.csv", "md5:d921e0b2333bfaa058bd38193e6b3fbd", "spam"),
    "ceas08.csv": ("CEAS_08.csv", "md5:1f0d59191eec892a709995d48cd8decb", "spam"),
    "ling.csv": ("Ling.csv", "md5:eac6399dc0c7ae455aebb64423dadc8b", "legit"),
    "nazario.csv": ("Nazario.csv", "md5:4022d055bb7cf8602f30f768f652e91e", "phishing"),
    "nigerian_fraud.csv": (
        "Nigerian_Fraud.csv",
        "md5:65fd47ae7cb4ae762e4be42b11905d63",
        "fraud",
    ),
}

# ---------------------------------------------------------------------------
# Text normalization (mirror of lib/ml/tokenizer.ts normalizeEmailText)
# ---------------------------------------------------------------------------

URL_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+.-]*://\S+|\bwww\.[a-zA-Z0-9.-]+\.[a-z]{2,}\S*")
EMAIL_RE = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")
NUM_RE = re.compile(r"\d[\d.,]*")

PHONE_RE = re.compile(r"(?:\+?[\d][\s.-]*)?[6-9][\d]{9}(?!\d)")


def normalize_email_text(text: str) -> str:
    """Canonical text fed to the model.

    Order matters and MUST match lib/ml/tokenizer.ts:
      1. URL -> ``__url__``
      2. email -> ``__email__``
      3. phone-run -> ``__phone__``
      4. number-run -> ``__num__``
      5. lowercase
    """
    if text is None:
        return ""
    t = str(text)
    t = URL_RE.sub(" __url__ ", t)
    t = EMAIL_RE.sub(" __email__ ", t)
    t = PHONE_RE.sub(" __phone__ ", t)
    t = NUM_RE.sub(" __num__ ", t)
    t = t.lower()
    return t


# Separator characters: whitespace and ASCII punctuation (underscore is a word
# char so placeholders like __url__ stay intact). Mirror in lib/ml/tokenizer.ts.
_SEPARATOR_RE = re.compile(r"""[\s!"#$%&'()*+,./:;<=>?@\\^`{|}~\-]+""")


def tokenize(feature_text: str) -> list[str]:
    """Tokenize normalized email text into unigrams + adjacent-word bigrams.

    Mirrors lib/ml/tokenizer.ts tokenize(). A word is a maximal run of
    characters that are not separators (whitespace / ASCII punctuation, with
    underscore allowed). Words shorter than 2 characters are dropped. When the
    previous word is a ``__placeholder__`` we do not pair it into a bigram.
    """
    words = [w for w in _SEPARATOR_RE.split(feature_text) if w]
    tokens: list[str] = []
    prev: str | None = None
    for w in words:
        if len(w) < 2:
            prev = None
            continue
        tokens.append(w)
        if prev is not None:
            if not (prev.startswith("__") or w.startswith("__")):
                tokens.append(f"{prev} {w}")
        prev = w
    return tokens


# ---------------------------------------------------------------------------
# TF-IDF (manual, sklearn-consistent) — mirror of lib/ml/tfidf.ts
# ---------------------------------------------------------------------------

def build_vocabulary(token_lists: list[list[str]], min_df: int = 2, max_df_frac: float = 0.9):
    """token_lists: list of feature token streams (unigrams+bigrams)."""
    df: dict[str, int] = {}
    n_docs = len(token_lists)
    for toks in token_lists:
        for t in set(toks):
            df[t] = df.get(t, 0) + 1

    vocab_candidates = {
        t: c for t, c in df.items() if c >= min_df and (c / n_docs) <= max_df_frac
    }
    # deterministic order (sorted by token string) for reproducible artifacts
    vocab = {t: i for i, t in enumerate(sorted(vocab_candidates))}
    return vocab, df, n_docs


def compute_idf(df: dict[str, int], n_docs: int) -> dict[str, float]:
    """Smooth idf: log((1+n)/(1+df)) + 1  (sklearn smooth_idf=True)."""
    return {t: float(__import__("math").log((1 + n_docs) / (1 + c)) + 1.0) for t, c in df.items()}


def tfidf_vector(
    token_stream: list[str], vocab: dict[str, int], idf: dict[str, float]
) -> dict[int, float]:
    """Returns {feature_index: tfidf_value} for raw counts."""
    import math

    counts: dict[str, int] = {}
    for t in token_stream:
        if t in vocab:
            counts[t] = counts.get(t, 0) + 1
    # sublinear tf: 1 + log(tf)  (sklearn sublinear_tf=True)
    vec: dict[int, float] = {}
    for t, c in counts.items():
        idx = vocab[t]
        tf = 1.0 + math.log(c)
        vec[idx] = tf * idf[t]
    return vec


def l2_normalize(vec: dict[int, float]) -> dict[int, float]:
    import math

    norm = math.sqrt(sum(v * v for v in vec.values()))
    if norm == 0:
        return {}
    return {k: v / norm for k, v in vec.items()}


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)


def ensure_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Environment variable {name} is required.")
    return val