#!/usr/bin/env python3
"""
Train and export the Cyber Sakhi 5-class email classifier.

Pipeline: prepared CSV -> vocabulary -> TF-IDF (manual, sklearn-consistent)
-> multinomial Logistic Regression -> evaluation -> JSON artifact.

The exported artifact (models/ml/email_classifier.json) is consumed at
runtime by the TypeScript inference library (lib/ml/*) which re-implements
tokenization, TF-IDF and the softmax classifier in pure Node.

Usage:
    python scripts/ml/train.py
"""

from __future__ import annotations

import csv
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    ARTIFACT_PATH,
    CONFUSION_MATRIX_PATH,
    CONFIG,
    MODEL_DIR,
    PREPARED_DIR,
    SAMPLE_PREDICTIONS_PATH,
    TRAINING_REPORT_PATH,
    build_vocabulary,
    compute_idf,
    l2_normalize,
    save_json,
    tfidf_vector,
    tokenize,
)

CLASS_ORDER = ["legitimate", "suspicious", "impersonated", "phishing", "fraud-related"]

csv.field_size_limit(sys.maxsize)

MIN_DF = CONFIG["min_df"]
MAX_DF_FRAC = CONFIG["max_df"]
MAX_FEATURES = CONFIG["max_features"]


def read_records(path: Path) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    with open(path, encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            rows.append((r["text"], r["label"]))
    return rows


def token_streams(texts: list[str]):
    return [tokenize(t) for t in texts]


def labels_to_indices(labels: list[str]) -> np.ndarray:
    return np.array([CLASS_ORDER.index(lb) for lb in labels], dtype=np.int64)


def build_matrix(
    streams: list[list[str]],
    vocab: dict[str, int],
    idf: dict[str, float],
) -> sparse.csr_matrix:
    rows: list[int] = []
    cols: list[int] = []
    vals: list[float] = []
    for i, toks in enumerate(streams):
        vec = l2_normalize(tfidf_vector(toks, vocab, idf))
        for idx, val in vec.items():
            rows.append(i)
            cols.append(idx)
            vals.append(val)
    return sparse.csr_matrix(
        (vals, (rows, cols)), shape=(len(streams), len(vocab)), dtype=np.float64
    )


def main() -> None:
    print("[1/6] Reading prepared splits ...")
    train_rows = read_records(PREPARED_DIR / "emails_train.csv")
    test_rows = read_records(PREPARED_DIR / "emails_test.csv")
    train_texts = [t for t, _ in train_rows]
    train_labels = [l for _, l in train_rows]
    test_texts = [t for t, _ in test_rows]
    test_labels = [l for _, l in test_rows]

    print("[2/6] Building vocabulary / IDF on TRAIN only ...")
    t0 = time.time()
    train_streams = token_streams(train_texts)
    vocab, df, n_docs = build_vocabulary(train_streams, min_df=MIN_DF, max_df_frac=MAX_DF_FRAC)
    # cap to top-MAX_FEATURES by document frequency (deterministic tie-break by
    # token string) so the artifact stays a reasonable size
    if len(vocab) > MAX_FEATURES:
        ranked = sorted(vocab.keys(), key=lambda t: (-df[t], t))[:MAX_FEATURES]
        vocab = {t: i for i, t in enumerate(sorted(ranked))}
    idf = compute_idf({t: df[t] for t in vocab}, n_docs)
    print(f"    vocabulary={len(vocab)} in {time.time() - t0:.1f}s")

    print("[3/6] TF-IDF matrix (train, test) ...")
    t0 = time.time()
    X_tr = build_matrix(train_streams, vocab, idf)
    X_te = build_matrix(token_streams(test_texts), vocab, idf)
    y_tr = labels_to_indices(train_labels)
    y_te = labels_to_indices(test_labels)
    print(f"    {X_tr.shape} {X_te.shape} in {time.time() - t0:.1f}s")

    print("[4/6] Training multinomial Logistic Regression ...")
    clf = LogisticRegression(
        C=CONFIG["C"],
        class_weight="balanced",
        solver="lbfgs",
        max_iter=CONFIG["max_iter"],
        random_state=42,
    )
    t0 = time.time()
    clf.fit(X_tr, y_tr)
    print(f"    trained in {time.time() - t0:.1f}s (iterations={clf.n_iter_})")

    print("[5/6] Evaluation on held-out test split ...")
    y_pred = clf.predict(X_te)
    proba = clf.predict_proba(X_te)
    accuracy = accuracy_score(y_te, y_pred)
    precision_macro = precision_score(y_te, y_pred, average="macro", zero_division=0)
    recall_macro = recall_score(y_te, y_pred, average="macro", zero_division=0)
    f1_macro = f1_score(y_te, y_pred, average="macro", zero_division=0)
    precision_weighted = precision_score(y_te, y_pred, average="weighted", zero_division=0)
    recall_weighted = recall_score(y_te, y_pred, average="weighted", zero_division=0)
    f1_weighted = f1_score(y_te, y_pred, average="weighted", zero_division=0)
    cm = confusion_matrix(y_te, y_pred)

    print(f"    accuracy={accuracy:.4f}")
    print(f"    precision(macro)={precision_macro:.4f} recall(macro)={recall_macro:.4f} f1(macro)={f1_macro:.4f}")
    print(f"    precision(weighted)={precision_weighted:.4f} recall(weighted)={recall_weighted:.4f} f1(weighted)={f1_weighted:.4f}")
    print("    confusion matrix (rows=true, cols=pred):")
    print("    labels:", CLASS_ORDER)
    print(cm)

    print("[6/6] Exporting artifact + reports ...")
    coef_dict: dict[str, list[float]] = {}
    intercept_dict: dict[str, float] = {}
    for ci, cls in enumerate(CLASS_ORDER):
        coef_dict[cls] = [round(float(v), 7) for v in clf.coef_[ci]]
        intercept_dict[cls] = round(float(clf.intercept_[ci]), 7)

    # class imbalance metadata for honest reporting
    class_counts = {cls: train_labels.count(cls) for cls in CLASS_ORDER}

    artifact = {
        "format": "cyber-sakhi-email-classifier",
        "version": 1,
        "classes": CLASS_ORDER,
        "vocabulary": vocab,
        "idf": {t: round(v, 7) for t, v in idf.items()},
        "coef": coef_dict,
        "intercept": intercept_dict,
        "params": {
            "min_df": MIN_DF,
            "max_df": MAX_DF_FRAC,
            "max_features": MAX_FEATURES,
            "ngrams": CONFIG["ngrams"],
            "sublinear_tf": True,
            "smooth_idf": True,
            "norm": "l2",
            "class_weight": "balanced",
            "solver": "lbfgs",
            "multi_class": "multinomial",
            "C": CONFIG["C"],
        },
        "meta": {
            "dataset_size": len(train_rows) + len(test_rows),
            "train_size": len(train_rows),
            "test_size": len(test_rows),
            "train_class_counts": class_counts,
            "accuracy": round(float(accuracy), 6),
            "precision_macro": round(float(precision_macro), 6),
            "recall_macro": round(float(recall_macro), 6),
            "f1_macro": round(float(f1_macro), 6),
            "precision_weighted": round(float(precision_weighted), 6),
            "recall_weighted": round(float(recall_weighted), 6),
            "f1_weighted": round(float(f1_weighted), 6),
            "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }
    save_json(ARTIFACT_PATH, artifact)
    save_json(
        TRAINING_REPORT_PATH,
        {
            "dataset": "zenodo-8339691 (CC BY 4.0)",
            "train_size": len(train_rows),
            "test_size": len(test_rows),
            "class_counts": class_counts,
            "accuracy": round(float(accuracy), 6),
            "precision_macro": round(float(precision_macro), 6),
            "recall_macro": round(float(recall_macro), 6),
            "f1_macro": round(float(f1_macro), 6),
            "precision_weighted": round(float(precision_weighted), 6),
            "recall_weighted": round(float(recall_weighted), 6),
            "f1_weighted": round(float(f1_weighted), 6),
            "confusion_matrix": {
                "labels": CLASS_ORDER,
                "matrix": cm.astype(int).tolist(),
            },
            "note": (
                "Imbalanced classes. Macro metrics weight the minority "
                "classes equally; balanced class-weight was used during "
                "training. F1-macro is the headline metric for this model."
            ),
        },
    )
    save_json(
        CONFUSION_MATRIX_PATH,
        {"labels": CLASS_ORDER, "matrix": cm.astype(int).tolist()},
    )

    # --- sample predictions for TS parity tests -----------------------------
    samples: dict[str, list] = {"predictions": [], "n_tokens_max": 60}
    rng = np.random.RandomState(3)
    idxs = rng.choice(len(test_texts), size=min(24, len(test_texts)), replace=False)
    for i in sorted(int(v) for v in idxs):
        samples["predictions"].append(
            {
                "text": test_texts[i],
                "true_label": test_labels[i],
                "predicted_label": CLASS_ORDER[int(y_pred[i])],
                "probabilities": {
                    cls: round(float(proba[i][ci]), 9)
                    for ci, cls in enumerate(CLASS_ORDER)
                },
            }
        )
    save_json(SAMPLE_PREDICTIONS_PATH, samples)

    # --- record CONFIG for provenance --------------------------------------
    save_json(MODEL_DIR / "config.json", CONFIG)

    print("\nArtifact written:", ARTIFACT_PATH)
    print("Report written:", TRAINING_REPORT_PATH)
    print("Sample predictions written:", SAMPLE_PREDICTIONS_PATH)


if __name__ == "__main__":
    main()