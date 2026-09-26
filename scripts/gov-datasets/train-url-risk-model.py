"""Train url-risk-lr-v1: logistic regression over URL lexical features.

Corpus (weak supervision, documented limitations in training-metadata.json):
  malicious = URLhaus csv_recent payload URLs (recent, 2026-08-26..2026-09-25)
  legitimate = Tranco top-15k domains as bare http://host/ URLs (popularity proxy)

Run: python3 scripts/gov-datasets/train-url-risk-model.py
Writes docs/ml/url-risk-v1/{model.json,training-metadata.json,evaluation.json}.
Deterministic (random_state=42). No case data is used.
"""
import csv
import hashlib
import json
import os
from urllib.parse import urlparse

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

TMP = "C:/Users/ry526/AppData/Local/Temp/opencode/extintel"
OUT = "docs/ml/url-risk-v1"
MODEL_VERSION = "url-risk-lr-v1"
RULES_VERSION = "url-risk-rules-v1"

EXEC_EXT = {"exe","msi","bat","cmd","ps1","vbs","vbe","js","jse","jar","bin","sh","dll","scr","msc","hta","cpl","gadget","apk","com","pif"}
SHORTENERS = {"bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","is.gd","buff.ly","adf.ly","cutt.ly","tiny.cc","rebrand.ly","shorturl.at"}
WATCH_TLDS = {"top","xyz","lol","cfd","live","info","online","space","life","buzz","monster","click","rest","sbs","quest","vip","gift","gdn","bid","win","date","loan","ooo","tk","ml","ga","cf","gq"}

FEATURES = ["url_len","host_len","path_len","dots","hyphens","digits_ratio","subdomain_depth","is_ip","has_at","has_punycode","nonstandard_port","deep_path","exec_ext","shortener","watch_tld","is_https"]

def sha_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

def featurize(raw):
    try:
        u = urlparse(raw if "://" in raw else "http://" + raw)
        if u.scheme not in ("http", "https"):
            return None
        host = (u.hostname or "").lower()
        if not host:
            return None
    except Exception:
        return None
    path = u.path + ("?" + u.query if u.query else "")
    labels = host.split(".")
    is_ip = host.replace(".", "").isdigit() and host.count(".") == 3
    depth = 0 if is_ip else max(0, len(labels) - 2)
    digits = sum(c.isdigit() for c in host)
    segs = [s for s in u.path.split("/") if s]
    ext = segs[-1].split(".")[-1].lower() if segs and "." in segs[-1] else ""
    port = u.port
    return [
        len(raw), len(host), len(path),
        raw.count("."), raw.count("-"),
        digits / max(1, len(host)), depth,
        1.0 if is_ip else 0.0,
        1.0 if "@" in raw else 0.0,
        1.0 if "xn--" in host else 0.0,
        1.0 if (port not in (None, 80, 443)) else 0.0,
        1.0 if len(segs) > 4 else 0.0,
        1.0 if ext in EXEC_EXT else 0.0,
        1.0 if host in SHORTENERS else 0.0,
        1.0 if (labels[-1] in WATCH_TLDS if labels else False) else 0.0,
        1.0 if u.scheme == "https" else 0.0,
    ]

# --- corpus ---
mal_urls = []
with open(f"{TMP}/urlhaus-csv-recent.txt", encoding="utf-8", errors="replace") as f:
    for line in f:
        if not line.strip() or line.startswith("#"):
            continue
        cells = next(csv.reader([line]))
        if len(cells) >= 3 and cells[2].strip().lower().startswith(("http://", "https://")):
            mal_urls.append(cells[2].strip())
print("malicious candidates:", len(mal_urls))

leg_hosts = []
with open(f"{TMP}/tranco/top-1m.csv", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split(",")
        if len(parts) == 2 and parts[0].isdigit() and int(parts[0]) <= 15000:
            leg_hosts.append(parts[1].strip().lower())
print("legitimate candidates:", len(leg_hosts))

mal_hosts = set()
for m in mal_urls:
    try:
        mal_hosts.add(urlparse(m).hostname.lower())
    except Exception:
        pass
leg_urls = [f"http://{h}/" for h in leg_hosts if h not in mal_hosts]
print("legitimate after host-overlap removal:", len(leg_urls))

X, y = [], []
for m in mal_urls:
    f = featurize(m)
    if f:
        X.append(f)
        y.append(1)
for l in leg_urls:
    f = featurize(l)
    if f:
        X.append(f)
        y.append(0)
print("feature rows:", len(X), "positives:", sum(y))

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
scaler = StandardScaler().fit(X_train)
clf = LogisticRegression(max_iter=2000, random_state=42).fit(scaler.transform(X_train), y_train)
pred = clf.predict(scaler.transform(X_test))
proba = clf.predict_proba(scaler.transform(X_test))[:, 1]

cm = confusion_matrix(y_test, pred).tolist()
metrics = {
    "accuracy": round(float((pred == __import__("numpy").array(y_test)).mean()), 4),
    "precision_malicious": round(float(precision_score(y_test, pred)), 4),
    "recall_malicious": round(float(recall_score(y_test, pred)), 4),
    "f1_malicious": round(float(f1_score(y_test, pred)), 4),
    "confusion_matrix": {"tn": cm[0][0], "fp": cm[0][1], "fn": cm[1][0], "tp": cm[1][1]},
    "test_size": len(y_test),
    "note": "Scores are uncalibrated model outputs, not probabilities. No calibration performed.",
}

# rule baseline on the same split (HIGH->malicious, MEDIUM->malicious strict mapping reported alongside)
import sys
sys.path.insert(0, "scripts/gov-datasets")
test_urls = None  # baseline computed in TS tests; python reports LR only to avoid dual implementations

os.makedirs(OUT, exist_ok=True)
mean = scaler.mean_.tolist()
var = scaler.var_.tolist()
model = {
    "version": MODEL_VERSION,
    "trained_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "feature_order": FEATURES,
    "scaler_mean": mean,
    "scaler_var": var,
    "coefficients": clf.coef_[0].tolist(),
    "intercept": float(clf.intercept_[0]),
    "threshold": 0.5,
    "rules_version": RULES_VERSION,
}
json.dump(model, open(f"{OUT}/model.json", "w"), indent=2)
json.dump(metrics, open(f"{OUT}/evaluation.json", "w"), indent=2)
metadata = {
    "version": MODEL_VERSION,
    "trained_at": model["trained_at"],
    "random_state": 42,
    "corpus": {
        "malicious_source": "abuse.ch URLhaus csv_recent (payload URLs)",
        "malicious_rows": sum(y),
        "legitimate_source": "Tranco top-15k domains as bare http://host/ (popularity proxy)",
        "legitimate_rows": len(y) - sum(y),
        "urlhaus_sha256": sha_file(f"{TMP}/urlhaus-csv-recent.txt"),
        "tranco_zip_note": "top-1m.csv.zip snapshot 2026-09-25",
        "host_overlap_removed": len(leg_hosts) - len(leg_urls),
    },
    "split": "stratified 80/20, random_state=42",
    "algorithm": "sklearn LogisticRegression(max_iter=2000) on StandardScaler lexical features",
    "limitations": [
        "Weak supervision: popularity is a proxy for legitimacy, not proof; URLhaus rows are payload droppers with heavy paths while legitimate rows are bare domains, so the model partly separates URL shape, not just maliciousness.",
        "UCI phishing research corpus was NOT used for training (no URL strings); it remains the offline research benchmark.",
        "No timestamps on legitimate rows: no time-split evaluation possible; scores are uncalibrated.",
        "Never trained on Cyber-Sakhi case data (governance restriction).",
        "Status: experimental. Not production-validated. All outputs are suggestions requiring analyst review.",
    ],
}
json.dump(metadata, open(f"{OUT}/training-metadata.json", "w"), indent=2)
print("metrics:", json.dumps(metrics))
print("OK artifacts in", OUT)
