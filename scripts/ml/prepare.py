#!/usr/bin/env python3
"""
Prepare the Cyber Sakhi 5-class training corpus.

RAW SOURCE SEMANTICS (documented — see DATASET.md)
--------------------------------------------------
Every aggregated CSV from Zenodo 8339691 uses the SAME binary convention:
    label = 0  -> legitimate
    label = 1  -> spam / unsolicited (NOT confirmed phishing)

Two files contain confirmed malicious email only:

    * Nazario.csv          -> confirmed phishing email (Jose Nazario corpus)
    * Nigerian_Fraud.csv   -> confirmed 419/advance-fee fraud email

APP LABEL MAPPING (documented derivation)
-----------------------------------------
    legitimate     <-  label=0 rows (Enron, Ling, SpamAssassin, CEAS)
    suspicious     <-  label=1 rows (Enron, Ling, SpamAssassin, CEAS)
                       = confirmed spam / unsolicited that is NOT confirmed
                         phishing. This is an honest label derivation: the
                         source corpora label these as spam, not phishing.
    phishing       <-  Nazario rows that do NOT impersonate a known brand
    impersonated   <-  Nazario rows whose content impersonates a known brand
                       or authority (brand-lexicon rule). DERIVED label: the
                       source labels them "phishing"; impersonation is a
                       subtype we split out with a documented, deterministic
                       rule. NOT ground truth for "impersonated".
    fraud-related  <-  Nigerian_Fraud rows (confirmed 419/advance-fee fraud)

CLEANING
--------
    * drops the corpus-internal "DON'T DELETE THIS MESSAGE -- FOLDER INTERNAL
      DATA" row (not an email)
    * drops rows with empty subject AND empty body (post-normalization)
    * drops near-duplicate (subject, body) pairs across source files
    * caps legitimate/suspicious class size to keep training tractable
    * stratified 80/20 train/test split on the cleaned corpus

Outputs (under data/ml/prepared/): emails.csv (all), emails_train.csv,
emails_test.csv, test_split.json, test_fixture.csv, test_fixture_tokens.json.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    RAW_DIR,
    PREPARED_DIR,
    normalize_email_text,
    tokenize,
)

csv.field_size_limit(sys.maxsize)

SUBJECT_BODY_COLS = ["enron.csv", "ling.csv"]
FULL_COLS = [
    "spamassassin.csv",
    "ceas08.csv",
    "nazario.csv",
    "nigerian_fraud.csv",
]

# ---------------------------------------------------------------------------
# Brand / authority impersonation lexicon for the derived "impersonated" label.
# This mirrors the Cyber Sakhi brand lexicon (lib/advancedForensics.ts).
# ---------------------------------------------------------------------------
IMPERSONATION_PATTERNS = [
    "paypal", "ebay", "e-bay", "amazon", "netflix", "apple", "icloud",
    "microsoft", "outlook", "office 365", "linkedin", "facebook",
    "google", "gmail", "youtube", "payoneer", "western union", "moneygram",
    "cpanel", "webmoney", "alertpay", "hsbc", "barclays", "lloyds",
    "bank of america", "chase", "wells fargo", "citibank", "citi bank",
    "swiss bank", "westernbank", "standard chartered", "rbs", "natwest",
    "royal bank", "first bank", "sbi", "state bank of india", "hdfc",
    "icici", "axis bank", "kotak",
    "paypal.com", "ebay.com", "microsoft.com", "apple.com", "amazon.com",
    "irs", "internal revenue", "fbi", "cia", "homeland security",
    "bank of england", "imf", "world bank", "united nations",
]
_IMP_REGEX = re.compile(r"\b(" + "|".join(re.escape(p) for p in IMPERSONATION_PATTERNS) + r")\b", re.IGNORECASE)


def looks_like_impersonation(subject: str, body: str) -> bool:
    blob = f"{subject} {body}"
    if not _IMP_REGEX.search(blob):
        return False
    # Require an account/credential/security framing so a passing mention of
    # "amazon" in a newsletter is not labelled impersonation.
    framing = re.compile(
        r"\b(login|log in|sign in|verify|account|password|credential|otp|"
        r"update your|confirm|suspended|blocked|billing|payment|security|"
        r"unusual activity|restore|re-activate|reactivate|essential maintenance)\b",
        re.IGNORECASE,
    )
    return bool(framing.search(blob))


def iter_rows(path: Path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            yield row


def read_pair(path: Path):
    """Yield (label, subject, body) for the 2-column-style CSVs."""
    for row in iter_rows(path):
        yield row.get("label"), row.get("subject") or "", row.get("body") or ""


def read_full(path: Path):
    for row in iter_rows(path):
        yield row.get("label"), row.get("subject") or "", row.get("body") or ""


def is_folder_internal(row_subject: str, row_body: str) -> bool:
    s = row_subject.strip().upper()
    return s.startswith("DON'T DELETE THIS MESSAGE") or s == "FOLDER INTERNAL DATA"


def build_records() -> list[tuple[str, str, str]]:
    """Returns (app_label, normalized_text, source) triples."""
    records: list[tuple[str, str, str]] = []

    # --- legitimate (label=0) + suspicious (label=1) from mixed corpora ---
    mixed_sources = {
        "enron": RAW_DIR / "enron.csv",
        "ling": RAW_DIR / "ling.csv",
        "spamassassin": RAW_DIR / "spamassassin.csv",
        "ceas": RAW_DIR / "ceas08.csv",
    }
    for source, path in mixed_sources.items():
        for label, subject, body in read_full(path):
            if subject is None:
                subject = ""
            if body is None:
                body = ""
            norm = normalize_email_text(f"{subject} {body}").strip()
            if not norm:
                continue
            if is_folder_internal(subject, body):
                continue
            app_label = "legitimate" if str(label).strip() == "0" else "suspicious"
            records.append((app_label, norm, source))

    # --- phishing vs impersonated from Nazario (confirmed phishing) ---
    nazario_assignments = {
        "phishing": 0,
        "impersonated": 0,
    }
    for label, subject, body in read_full(RAW_DIR / "nazario.csv"):
        if is_folder_internal(subject, body):
            continue
        norm = normalize_email_text(f"{subject} {body}").strip()
        if not norm:
            continue
        if looks_like_impersonation(subject, body):
            app_label = "impersonated"
            nazario_assignments["impersonated"] += 1
        else:
            app_label = "phishing"
            nazario_assignments["phishing"] += 1
        records.append((app_label, norm, "nazario"))

    # --- fraud-related from Nigerian_Fraud (confirmed 419 fraud) ---
    for label, subject, body in read_full(RAW_DIR / "nigerian_fraud.csv"):
        norm = normalize_email_text(f"{subject} {body}").strip()
        if not norm:
            continue
        records.append(("fraud-related", norm, "nigerian_fraud"))

    print("Nazario assignment:", nazario_assignments)
    return records


def dedupe_and_cap(records: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """Drop near-duplicate normalized texts and cap the big benign classes."""
    seen: set[str] = set()
    kept: list[tuple[str, str, str]] = []
    caps = {"legitimate": 20000, "suspicious": 20000}
    counts: dict[str, int] = {}
    random.shuffle(records)
    for app_label, norm, source in records:
        if norm in seen:
            continue
        seen.add(norm)
        if counts.get(app_label, 0) >= caps.get(app_label, 10 ** 9):
            continue
        counts[app_label] = counts.get(app_label, 0) + 1
        kept.append((app_label, norm, source))
    print("Class sizes:", dict(counts))
    return kept


def write_csv(path: Path, rows: list[tuple[str, str, str]]) -> None:
    """Writes rows of (app_label, normalized_text, source) as text,label,source."""
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["text", "label", "source"])
        for app_label, norm, source in rows:
            writer.writerow([norm, app_label, source])


def split_stratified(records: list[tuple[str, str, str]], seed: int = 42):
    random.seed(seed)
    by_label: dict[str, list[tuple[str, str, str]]] = {}
    for r in records:
        by_label.setdefault(r[0], []).append(r)
    train: list[tuple[str, str, str]] = []
    test: list[tuple[str, str, str]] = []
    for label, group in by_label.items():
        random.shuffle(group)
        cut = int(round(len(group) * 0.8))
        train.extend(group[:cut])
        test.extend(group[cut:])
    random.shuffle(train)
    random.shuffle(test)
    return train, test


def build_test_fixture(records: list[tuple[str, str, str]]) -> None:
    """Deterministic fixture of tokenized rows to unit-test the TS replica."""
    random.seed(7)
    fixture: list[dict] = []
    for label in ["legitimate", "suspicious", "phishing", "impersonated", "fraud-related"]:
        pool = [r for r in records if r[0] == label]
        random.shuffle(pool)
        for app_label, norm, source in pool[:40]:
            tokens = tokenize(norm)
            fixture.append({"label": app_label, "text": norm, "tokens": tokens})
    # a few hand-picked raw/invariant cases
    for raw in [
        "",
        "   ",
        "click here https://bit.ly/abc to verify your account now",
        "dear customer your account has been suspended __url__",
        "Учётная запись приостановлена",  # non-ascii letters
        "meeting at 3pm tomorrow, thanks",
    ]:
        norm = normalize_email_text(raw)
        fixture.append({"label": "case", "text": norm, "tokens": tokenize(norm)})
    with open(PREPARED_DIR / "test_fixture_tokens.json", "w", encoding="utf-8") as fh:
        json.dump(fixture, fh, ensure_ascii=False, indent=1)

    rows = [
        (fix["label"], fix["text"], "fixture") for fix in fixture
    ]
    write_csv(PREPARED_DIR / "test_fixture.csv", rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    PREPARED_DIR.mkdir(parents=True, exist_ok=True)
    records = build_records()
    records = dedupe_and_cap(records)

    train, test = split_stratified(records, seed=args.seed)
    write_csv(PREPARED_DIR / "emails.csv", records)
    write_csv(PREPARED_DIR / "emails_train.csv", train)
    write_csv(PREPARED_DIR / "emails_test.csv", test)

    counts = {}  # type: ignore
    for r in records:
        counts[r[0]] = counts.get(r[0], 0) + 1
    with open(PREPARED_DIR / "test_split.json", "w", encoding="utf-8") as fh:
        json.dump(
            {
                "total": len(records),
                "train": len(train),
                "test": len(test),
                "class_counts": counts,
                "seed": args.seed,
            },
            fh,
            indent=1,
        )

    build_test_fixture(records)

    print(f"Wrote {len(records)} records -> {PREPARED_DIR}")
    print(f"Train={len(train)} Test={len(test)}")
    print("Label counts:", counts)


if __name__ == "__main__":
    main()