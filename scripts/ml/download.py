#!/usr/bin/env python3
"""
Download the Cyber Sakhi ML datasets from the Zenodo deposit 8339691.

Source: https://zenodo.org/records/8339691
        "Phishing Email Curated Datasets" (Champa / Rabbi / Zibran), CC BY 4.0.
        Original paper: A. I. Champa, M. F. Rabbi, M. F. Zibran,
        "Why phishing emails escape detection: A closer look at the failure
        points", 12th International Symposium on Digital Forensics and
        Security (ISDFS), IEEE, 2024.

Each file is verified against the MD5 checksum recorded by the deposit.
The deposit aggregates well-documented research corpora:

  * Enron email corpus (legitimate corporate mail)
  * SpamAssassin public mail corpus (ham + spam)
  * CEAS 2008 corpus (CEAS Live Spam Challenge, ham + spam)
  * Ling spam + non-spam collection (Jon Androutsopoulos)
  * Nazario phishing corpus (confirmed phishing, Jose Nazario)
  * Nigerian fraud / 419-scheme email corpus (confirmed fraud)

Usage:
    python scripts/ml/download.py            # download all
    python scripts/ml/download.py --only nazario.csv   # single file
    python scripts/ml/download.py --skip-existing
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import RAW_DIR, ZENODO_FILES  # noqa: E402

ZENODO_RECORD = "https://zenodo.org/records/8339691/files"


def _md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return "md5:" + h.hexdigest()


def download_one(key: str, skip_existing: bool) -> Path:
    filename, expected_md5, _group = ZENODO_FILES[key]
    dst = RAW_DIR / key
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    if dst.exists():
        actual = _md5(dst)
        if actual == expected_md5:
            print(f"[ok]    {key} already present and verified")
            return dst
        if skip_existing:
            print(f"[warn]  {key} exists but checksum differs; skipping (use --force)")
            return dst

    url = f"{ZENODO_RECORD}/{filename}?download=1"
    print(f"[get]   {filename} -> {dst.name}")
    tmp = dst.with_suffix(dst.suffix + ".part")
    try:
        with urllib.request.urlopen(url, timeout=600) as resp, open(tmp, "wb") as out:
            total = 0
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                total += len(chunk)
        actual = _md5(tmp)
        if actual != expected_md5:
            tmp.unlink(missing_ok=True)
            raise RuntimeError(
                f"{key}: checksum mismatch (expected {expected_md5}, got {actual})"
            )
        tmp.replace(dst)
        print(f"[ok]    {key} downloaded and verified ({total/1e6:.1f} MB)")
    except Exception as exc:  # noqa: BLE001
        tmp.unlink(missing_ok=True)
        print(f"[fail]  {key}: {exc}")
        raise
    return dst


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="download only this key, e.g. nazario.csv")
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()

    keys = [args.only] if args.only else list(ZENODO_FILES)
    failed = 0
    for key in keys:
        try:
            download_one(key, args.skip_existing)
        except Exception:  # noqa: BLE001
            failed += 1
    if failed:
        print(f"\n{failed} file(s) failed. Re-run after fixing network issues.")
        sys.exit(1)
    print("\nAll datasets downloaded into:", RAW_DIR)


if __name__ == "__main__":
    main()