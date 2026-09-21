#!/usr/bin/env python3
"""
Build the small, committed test artifact for the TypeScript unit tests.

The runtime artifact (models/ml/email_classifier.json, several MB) is
git-ignored, so CI / `npm test` cannot depend on it. This script trains a
tiny multinomial Logistic Regression on a synthetic corpus and writes:

    tests/fixtures/ml/email_classifier_test.json   small artifact
    tests/fixtures/ml/test_sample_predictions.json recorded sklearn outputs
    tests/fixtures/ml/tokenize_cases.json          tokenizer parity ground truth

The fixture uses the SAME artifact format and the SAME Python pipeline
(normalization, tokenization, TF-IDF, softmax) as the real pipeline, so a
green inference.test.ts gives high confidence the TS replica is exact.

Usage:
    python scripts/ml/make_test_model.py
"""

from __future__ import annotations

import csv
import json
import random
import sys
from pathlib import Path

import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    l2_normalize,
    normalize_email_text,
    build_vocabulary,
    compute_idf,
    save_json,
    tfidf_vector,
    tokenize,
)

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "ml"

CLASS_ORDER = ["legitimate", "suspicious", "impersonated", "phishing", "fraud-related"]

CLASS_WORDS = {
    "legitimate": [
        "meeting", "minutes", "report", "attached", "updated", "project",
        "schedule", "draft", "invoice", "receipt", "thanks", "regards",
        "team", "holiday", "plan", "notes", "agenda", "summary", "approved",
        "budget", "quarterly", "sprint", "sync", "review",
    ],
    "suspicious": [
        "viagra", "pills", "cheap", "offer", "discount", "pharmacy",
        "prescription", "knockout", "win", "cash", "loan", "bonus", "gift",
        "card", "prize", "winner", "urgent", "deal", "limited", "time",
        "free", "trial", "guaranteed", "act now",
    ],
    "impersonated": [
        "paypal", "account", "limited", "verify", "information", "login",
        "immediate", "action", "required", "reactivate", "amazon", "order",
        "confirm", "missed", "delivery", "suspended", "security", "alert",
        "customer", "support", "click", "here",
    ],
    "phishing": [
        "verify", "account", "password", "reset", "click", "link", "update",
        "billing", "suspended", "security", "login", "recover", "session",
        "credentials", "lockout", "enroll", "confirm", "sign in", "unaudited",
        "maintenance",
    ],
    "fraud-related": [
        "transfer", "western", "union", "wire", "fee", "advance", "payment",
        "inheritance", "barrister", "bank", "details", "beneficiary", "claim",
        "funds", "compensation", "lottery", "million", "congratulations",
        "account", "release", "processing", "fee",
    ],
}

INTRO = [
    "dear sir",
    "dear madam",
    "hello",
    "dear customer",
    "hi there",
    "attention",
]


def make_example(label: str, rng: random.Random) -> str:
    n = rng.randint(5, 9)
    words = rng.sample(CLASS_WORDS[label], k=n)
    intro = rng.choice(INTRO) if rng.random() < 0.5 else ""
    body = " ".join(words)
    return f"{intro} {body}".strip()


def build_matrix(token_lists, vocab, idf):
    rows, cols, vals = [], [], []
    for i, toks in enumerate(token_lists):
        vec = l2_normalize(tfidf_vector(toks, vocab, idf))
        for idx, val in vec.items():
            rows.append(i)
            cols.append(idx)
            vals.append(val)
    return sparse.csr_matrix((vals, (rows, cols)), shape=(len(token_lists), len(vocab)))


def main() -> None:
    rng = random.Random(1234)
    records: list[tuple[str, str]] = []  # (label, normalized text)
    per_label = 72
    for label in CLASS_ORDER:
        for _ in range(per_label):
            text = normalize_email_text(make_example(label, rng))
            records.append((label, text))
    random.Random(999).shuffle(records)

    texts = [t for _, t in records]
    labels = [l for l, _ in records]
    streams = [tokenize(t) for t in texts]
    vocab, df, n_docs = build_vocabulary(streams, min_df=1, max_df_frac=1.0)
    idf = compute_idf({t: df[t] for t in vocab}, n_docs)
    X = build_matrix(streams, vocab, idf)
    y = np.array([CLASS_ORDER.index(l) for l in labels])

    clf = LogisticRegression(
        C=1.0,
        class_weight="balanced",
        solver="lbfgs",
        max_iter=2000,
        random_state=42,
    )
    clf.fit(X, y)
    proba = clf.predict_proba(X)
    pred = clf.predict(X)

    from sklearn.metrics import f1_score, precision_score, recall_score, accuracy_score

    art = {
        "format": "cyber-sakhi-email-classifier",
        "version": 1,
        "classes": CLASS_ORDER,
        "vocabulary": vocab,
        "idf": {t: round(v, 7) for t, v in idf.items()},
        "coef": {
            cls: [round(float(v), 7) for v in clf.coef_[i]]
            for i, cls in enumerate(CLASS_ORDER)
        },
        "intercept": {
            cls: round(float(b), 7) for cls, b in zip(CLASS_ORDER, clf.intercept_)
        },
        "params": {
            "min_df": 1,
            "max_df": 1.0,
            "max_features": None,
            "ngrams": [1, 2],
            "sublinear_tf": True,
            "smooth_idf": True,
            "norm": "l2",
            "class_weight": "balanced",
            "solver": "lbfgs",
            "C": 1.0,
        },
        "meta": {
            "dataset": "synthetic-fixture (tests only, NOT production)",
            "train_size": len(records),
            "test_size": 0,
        },
    }
    art["meta"].update({
        "accuracy": round(float(accuracy_score(y, pred)), 6),
        "precision_macro": round(float(precision_score(y, pred, average="macro", zero_division=0)), 6),
        "recall_macro": round(float(recall_score(y, pred, average="macro", zero_division=0)), 6),
        "f1_macro": round(float(f1_score(y, pred, average="macro", zero_division=0)), 6),
    })

    # 12 spotted sample docs for prediction parity
    rng2 = random.Random(7)
    sample_indexes = []
    by_label: dict[str, list[tuple[str, str]]] = {}
    for i, (l, t) in enumerate(records):
        by_label.setdefault(l, []).append((i, t))
    for l in CLASS_ORDER:
        sample_indexes.extend(i for i, _ in rng2.sample(by_label[l], k=6))
    sample_indexes.sort()

    samples = []
    for i in sample_indexes:
        samples.append({
            "text": texts[i],
            "true_label": labels[i],
            "predicted_label": CLASS_ORDER[int(pred[i])],
            "probabilities": {cls: round(float(proba[i][ci]), 9) for ci, cls in enumerate(CLASS_ORDER)},
        })

    tokenize_cases = [
        "click here https://bit.ly/abc to verify your account now",
        "dear customer your account has been suspended __url__",
        "contact support@cyber-sakhi.gov.in or call 9876543210 today",
        "Your order #482917 will arrive by 2026-09-17, total 1,234.56 INR",
        "meeting at 3pm tomorrow, thanks",
        "  multiple   spaces and\tabs  ",
        "UPPER Case Text AND numbers 42",
        "Учётная запись приостановлена",
        "reply to: billing@paypal.com or +1 (415) 555-0132",
        "waiting for your FUNDS to be RELEASED to secure delivery of $2M",
        "__url__ __email__ __phone__ __num__ tokens",
        "",
    ]
    token_cases = [
        {"input": raw, "normalized": normalize_email_text(raw), "tokens": tokenize(normalize_email_text(raw))}
        for raw in tokenize_cases
    ]

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    save_json(FIXTURES_DIR / "email_classifier_test.json", art)
    save_json(FIXTURES_DIR / "test_sample_predictions.json", {"samples": samples})
    save_json(FIXTURES_DIR / "tokenize_cases.json", {"cases": token_cases})

    print(f"Wrote fixtures -> {FIXTURES_DIR}")
    print(f"Vocabulary: {len(vocab)} tokens ; samples: {len(samples)} ; tokenizer cases: {len(token_cases)}")
    print("Meta:", {k: art["meta"][k] for k in ("accuracy", "f1_macro") if k in art["meta"]})


if __name__ == "__main__":
    main()