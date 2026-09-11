/* Phase 2 Step 3 HARDENING harness: real blockchain anchoring states + real
 * password/key-protected evidence lock.
 *
 * BLOCKCHAIN ANCHOR (honest-state coverage):
 *   - status endpoint, dry-run (no tx), real attempt when unconfigured
 *     (documented 'unavailable', NO fabricated tx hash), batch dry-run,
 *     tampered-digest -> digest_mismatch on-chain verification path.
 * LOCK (crypto coverage):
 *   - real PBKDF2-derived KEK, AES-256-GCM DEK wrap + verifier wrap
 *   - locked GET/list masking (no plaintext/keys/ciphertext leak)
 *   - soft-unlock PATCH rejection (409) while material exists
 *   - wrong verifier -> 403; correct verifier -> 200 + full unmasked reveal
 *   - server datum stays locked (refresh re-locks); relock blocked while locked
 *   - chain LOCKED/UNLOCKED/DECRYPTED events
 *   - admin cross-user isolation
 *   - legacy soft-lock path preserved (no material -> PATCH still works)
 *   - DB assertion: only wrapped/derived material stored; no plaintext credential
 *     or DEK in the row
 *
 * Uses seeded accounts only. Cleanup via service-role REST + marker file.
 */
const BASE = process.env.BASE || "http://localhost:3000";
const results = [];
const jar = new Map();
const PROJECT_ENV =
  "C:\\Users\\ry526\\.gemini\\antigravity\\scratch\\cyber-sakhi\\.env.local";
const MARKER_PATH =
  process.env.PROBE_MARKER_PATH ||
  "C:\\Users\\ry526\\AppData\\Local\\Temp\\opencode\\hardening-probe-marker.json";

const state = {
  userEvId: null,
  userEvCode: null,
  userEv2Id: null, // legacy soft-lock evidence
  userCaseId: null,
  tamperAnchorId: null,
  batchAnchorId: null,
  attemptAnchorId: null,
  cleanupCompleted: false,
};

function cookiesHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, options = {}) {
  const h = { ...(options.headers || {}) };
  const cookieStr = cookiesHeader();
  if (cookieStr) h["Cookie"] = cookieStr;
  const opts = { ...options, headers: h, redirect: "manual" };
  if (options.form) {
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = new URLSearchParams(options.form).toString();
  } else if (options.body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(BASE + path, opts).catch(async (e) => {
    console.error("FETCH ERROR on", path, "method", opts.method || "GET", "bodyType", typeof opts.body);
    throw e;
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { data = await res.json(); } catch { data = null; }
  } else if (ct.includes("text/plain")) {
    data = await res.text();
  }
  return { status: res.status, data };
}

async function login(identifier, password) {
  jar.clear();
  const csrf = await request("/api/auth/csrf");
  await request("/api/auth/callback/credentials", {
    method: "POST",
    form: { csrfToken: csrf.data?.csrfToken, identifier, password, json: "true" },
  });
}

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
}

/* ------------------------ client-side crypto (Node WebCrypto) ------------------------ */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64ToBytes(base64) {
  const binary = Buffer.from(base64, "base64").toString("binary");
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}
function randomB64(n) {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(n)));
}
async function sha256HexStr(s) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function deriveKek(credential, saltB64, iterations) {
  const material = await crypto.subtle.importKey("raw", enc.encode(credential), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBytes(saltB64), iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function aesWrap(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { ciphertext: bytesToB64(new Uint8Array(ct)), iv: bytesToB64(iv) };
}
async function gcmEncryptRaw(dek, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, plaintext);
  return { ciphertext: bytesToB64(new Uint8Array(ct)), iv: bytesToB64(iv) };
}

async function postEvidence(payload) {
  return request("/api/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

const SAMPLE = `Received: from attacker.example (attacker.example [198.51.100.44])
        by mail.victim.org with ESMTP id sc2026
        ; Tue, 02 Sep 2026 11:30:00 +0530
From: Cyber Emergency <alerts@cyber-help.com>
To: customer@example.com
Subject: Hardening probe case
Date: Tue, 02 Sep 2026 11:30:00 +0530

This is a hardening harness probe email.
`;

async function createCase() {
  const make = await request("/api/email-forensics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawEmail: SAMPLE, saveAsCase: true }),
  });
  return { id: make.data?.case?.id || null, caseNumber: make.data?.case?.caseNumber || null, status: make.status };
}

async function supabaseREST() {
  const fs = await import("fs");
  const envSrc = fs.readFileSync(PROJECT_ENV, "utf8");
  const getVar = (n) => (envSrc.match(new RegExp(`^${n}=(.*)$`, "m")) || [])[1]?.trim();
  const url = getVar("NEXT_PUBLIC_SUPABASE_URL");
  const key = getVar("SUPABASE_SERVICE_ROLE_KEY");
  return { url, h: { apikey: key, Authorization: `Bearer ${key}` } };
}

async function restCount(table, filter) {
  try {
    const { url, h } = await supabaseREST();
    const res = await fetch(`${url}/rest/v1/${table}?select=id&${filter}`, { headers: h });
    const rows = await res.json().catch(() => null);
    return { ok: res.ok, count: Array.isArray(rows) ? rows.length : -1, body: JSON.stringify(rows).slice(0, 160) };
  } catch (e) {
    return { ok: false, count: -1, body: String(e) };
  }
}

async function restSelect(table, filter) {
  try {
    const { url, h } = await supabaseREST();
    const res = await fetch(`${url}/rest/v1/${table}?select=*&${filter}`, { headers: h });
    const rows = await res.json().catch(() => null);
    return { ok: res.ok, rows };
  } catch (e) {
    return { ok: false, rows: null };
  }
}

async function restInsert(table, payload) {
  try {
    const { url, h } = await supabaseREST();
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    const rows = await res.json().catch(() => null);
    return { status: res.status, rows };
  } catch (e) {
    return { status: -1, rows: null };
  }
}

async function residualDatabaseCleanup() {
  try {
    const { url, h } = await supabaseREST();
    if (!url || !h.apikey) return;
    const evIds = [state.userEvId, state.userEv2Id].filter(Boolean);
    if (evIds.length) {
      const inFilter = "in.(" + evIds.join(",") + ")";
      await fetch(`${url}/rest/v1/chain_of_custody?evidence_id=${inFilter}`, { method: "DELETE", headers: h }).catch(() => {});
      await fetch(`${url}/rest/v1/blockchain_anchors?evidence_id=${inFilter}`, { method: "DELETE", headers: h }).catch(() => {});
      await fetch(`${url}/rest/v1/evidence?id=${inFilter}`, { method: "DELETE", headers: h }).catch(() => {});
    }
    const anchorIds = [state.tamperAnchorId, state.batchAnchorId, state.attemptAnchorId].filter(Boolean);
    if (anchorIds.length) {
      await fetch(`${url}/rest/v1/blockchain_anchors?id=in.(${anchorIds.join(",")})`, { method: "DELETE", headers: h }).catch(() => {});
    }
    if (state.userCaseId) {
      for (const [table, filter] of [
        ["case_chat_messages", `case_id=eq.${state.userCaseId}`],
        ["reports", `case_id=eq.${state.userCaseId}`],
        ["indicators", `case_id=eq.${state.userCaseId}`],
        ["email_investigations", `case_id=eq.${state.userCaseId}`],
        ["evidence", `case_id=eq.${state.userCaseId}`],
      ]) {
        await fetch(`${url}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: h }).catch(() => {});
      }
      await fetch(`${url}/rest/v1/cases?id=eq.${state.userCaseId}`, { method: "DELETE", headers: h }).catch(() => {});
    }
  } catch (_) {}
}

/* ========================================================================== */
(async () => {
  const fakeId = crypto.randomUUID();

  try {
    /* ------------------------- A. Blockchain anchor states ------------------------- */
    let anonStatus = await request("/api/blockchain/status");
    record("anon GET /api/blockchain/status -> 401", anonStatus.status === 401, `status=${anonStatus.status}`);

    await login("user@cybersakhi.org", "User@Sakhi2026!");
    let bcStatus = await request("/api/blockchain/status");
    record("blockchain status -> 200 provider=evm configured boolean", bcStatus.status === 200 && bcStatus.data?.provider === "evm" && typeof bcStatus.data?.configured === "boolean", `configured=${bcStatus.data?.configured} enabled=${bcStatus.data?.enabled}`);

    let lst0 = await request("/api/evidence");
    record("evidence list carries NO fabricated anchor fields", !/simulated|bafy|mock|nonce|0x[0-9a-f]{64}/i.test(JSON.stringify(lst0.data || {})), "clean");

    // upload two encrypted artifacts
    let ev1 = await postEvidence({ title: "hardening encrypted file", filename: "harden.txt", fileType: "text/plain", fileSize: 640, sha256Hash: "1".repeat(64), category: "HARASSMENT", encryptedContent: randomB64(48), encryptionIv: randomB64(12), encryptedSize: 64, notes: "hardening harness" });
    record("hardening evidence upload -> 201", ev1.status === 201, `status=${ev1.status}`);
    state.userEvId = ev1.data?.evidence?.id || null;
    state.userEvCode = ev1.data?.evidence?.evidence_code || "";

    let dryRun = await request(`/api/evidence/${state.userEvId}/anchor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: true }) });
    record("anchor dryRun -> not_created + digest only (NO tx)", dryRun.status === 200 && dryRun.data?.anchor?.submitted === false && dryRun.data?.anchor?.status === "not_created" && !dryRun.data?.anchor?.txHash && /^[0-9a-f]{64}$/.test(dryRun.data?.anchor?.digest || ""), `status=${dryRun.data?.anchor?.status}`);

    let noAnchor = await request(`/api/evidence/${state.userEvId}/anchor`);
    record("anchor GET before attempt -> not_created, anchor=null", noAnchor.status === 200 && noAnchor.data?.status === "not_created" && noAnchor.data?.anchor === null, noAnchor.data?.status);

    let attempt = await request(`/api/evidence/${state.userEvId}/anchor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    record("anchor attempt (unconfigured) -> submitted=false NO tx", attempt.status === 200 && attempt.data?.anchor?.submitted === false && !attempt.data?.anchor?.txHash, `status=${attempt.data?.anchor?.status}`);
    record("anchor attempt reason honest (no tx created)", /no transaction/i.test(attempt.data?.anchor?.reason || "") || /not (enabled|configured)/i.test(attempt.data?.anchor?.reason || ""), String(attempt.data?.anchor?.reason || "").slice(0, 80));
    state.attemptAnchorId = attempt.data?.anchor?.anchorId || null;

    let attemptGet = await request(`/api/evidence/${state.userEvId}/anchor`);
    record("anchor GET after attempt -> record exists, txHash null", Boolean(attemptGet.data?.anchor?.id) && attemptGet.data?.anchor?.txHash === null && attemptGet.data?.anchor?.status === "unavailable", `status=${attemptGet.data?.anchor?.status}`);

    // tampered digest -> on-chain verify path reports digest_mismatch (honest, no fake confirm)
    let tamper = await restInsert("blockchain_anchors", {
      evidence_id: state.userEvId,
      anchor_type: "evidence",
      anchor_version: 1,
      provider: "evm",
      anchored_digest: "0".repeat(64),
      anchor_payload: "TAMPERED",
      tx_hash: "0x" + "ab".repeat(32),
      status: "pending",
      created_at: new Date().toISOString(),
    });
    record("tampered anchor row insertable via service role", tamper.status >= 200 && tamper.status < 300 && Array.isArray(tamper.rows) && tamper.rows?.[0]?.id, `status=${tamper.status}`);
    state.tamperAnchorId = tamper.rows?.[0]?.id || null;

    let tver = await request(`/api/evidence/${state.userEvId}/anchor?verify=true`);
    record("verify tampered -> digest_mismatch detected", tver.status === 200 && tver.data?.verification?.status === "digest_mismatch", JSON.stringify(tver.data?.verification?.status));

    // batch dryRun + real-unconfigured
    let batchDry = await request("/api/anchor/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceIds: [state.userEvId], dryRun: true }) });
    record("batch dryRun -> not_created + merkle root, no tx", batchDry.status === 200 && batchDry.data?.anchor?.submitted === false && batchDry.data?.anchor?.status === "not_created" && /^[0-9a-f]{64}$/.test(batchDry.data?.anchor?.merkleRoot || "") && !batchDry.data?.anchor?.txHash, `merkle=${batchDry.data?.anchor?.merkleRoot?.slice(0, 12)}`);

    let batchReal = await request("/api/anchor/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceIds: [state.userEvId] }) });
    record("batch attempt (unconfigured) -> submitted=false no tx", batchReal.status === 200 && batchReal.data?.anchor?.submitted === false && !batchReal.data?.anchor?.txHash, `status=${batchReal.data?.anchor?.status}`);
    state.batchAnchorId = batchReal.data?.anchor?.anchorId || null;

    /* ------------------------- B. Crypto lock flows ------------------------- */
    let ucase = await createCase();
    record("case created for lock harness", ucase.status === 200 && Boolean(ucase.id), ucase.caseNumber);
    state.userCaseId = ucase.id;

    let link = await request(`/api/evidence/${state.userEvId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: state.userCaseId }) });
    record("evidence linked to user case before lock", link.status === 200, `status=${link.status}`);

    // build a real lock envelope (mirrors client lib/lockCrypto)
    const CRED = "Harden@Secret2026!";
    const PLAIN = enc.encode("HARDENING-LOCK-TARGET-CONTENT-1234567890");
    const salt = randomB64(16);
    const iterations = 310000;
    const kek = await deriveKek(CRED, salt, iterations);

    const dekBytes = crypto.getRandomValues(new Uint8Array(32));
    const dek = await crypto.subtle.importKey("raw", dekBytes, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    const reenc = await gcmEncryptRaw(dek, PLAIN);

    const wrappedKey = await aesWrap(kek, dekBytes);
    const verifier = randomB64(32);
    const verifierSha = await sha256HexStr(verifier);
    const wrappedVerifier = await aesWrap(kek, enc.encode(verifier));

    let missLock = await request(`/api/evidence/${state.userEvId}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "password" }) });
    record("POST /lock missing material -> 400", missLock.status === 400, `status=${missLock.status}`);
    let badVer = await request(`/api/evidence/${state.userEvId}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "password", lockVersion: 1, kdf: "PBKDF2-SHA256", kdfSalt: salt, kdfIterations: 310000, kdfParams: {}, wrappedKey: wrappedKey.ciphertext, wrappedKeyIv: wrappedKey.iv, verifierWrapped: wrappedVerifier.ciphertext, verifierIv: wrappedVerifier.iv, verifierSha: "zzz" }) });
    record("POST /lock invalid verifierSha -> 400", badVer.status === 400, `status=${badVer.status}`);
    let lowIt = await request(`/api/evidence/${state.userEvId}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "password", lockVersion: 1, kdf: "PBKDF2-SHA256", kdfSalt: salt, kdfIterations: 9999, kdfParams: {}, wrappedKey: wrappedKey.ciphertext, wrappedKeyIv: wrappedKey.iv, verifierWrapped: wrappedVerifier.ciphertext, verifierIv: wrappedVerifier.iv, verifierSha: "a".repeat(64) }) });
    record("POST /lock low KDF iterations -> 400", lowIt.status === 400, `status=${lowIt.status}`);

    let lockRes = await request(`/api/evidence/${state.userEvId}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "password", lockVersion: 1, kdf: "PBKDF2-SHA256", kdfSalt: salt, kdfIterations: iterations, kdfParams: { hash: "SHA-256", keyLength: 256, algorithm: "PBKDF2", iterations }, wrappedKey: wrappedKey.ciphertext, wrappedKeyIv: wrappedKey.iv, verifierWrapped: wrappedVerifier.ciphertext, verifierIv: wrappedVerifier.iv, verifierSha, reencryptedContent: reenc.ciphertext, reencryptedIv: reenc.iv, reencryptedSize: reenc.ciphertext.length }) });
    record("POST /lock valid material -> 200 locked", lockRes.status === 200 && lockRes.data?.evidence?.locked === true, `status=${lockRes.status}`);

    let lockedById = await request(`/api/evidence?id=${encodeURIComponent(state.userEvId)}`);
    const lev = lockedById.data?.evidence;
    record("GET locked by-id -> masked: NO title/filename/hash/ciphertext", (() => { const e = lev || {}; return e.locked === true && !("title" in e) && !("filename" in e) && !("sha256Hash" in e) && !("encryptedContent" in e); })(), JSON.stringify({ hasTitle: "title" in (lev||{}), hasCiphertext: "encryptedContent" in (lev||{}) }));
    record("GET locked by-id -> evidence code visible", /^EV-\d{4}-[A-Z2-9]{8}$/.test((lev || {}).evidenceCode || ""), lev?.evidenceCode);
    record("GET locked by-id -> lock envelope present (salt/key/verifier wrappers)", Boolean(lev?.lockEnvelope?.kdfSalt && lev?.lockEnvelope?.wrappedKey && lev?.lockEnvelope?.verifierWrapped && lev?.lockEnvelope?.kdfIterations === 310000), `keys=${Boolean(lev?.lockEnvelope?.wrappedKey)}`);

    let lockedList = await request("/api/evidence");
    const lockItem = (lockedList.data?.evidence || []).find((e) => e?.id === state.userEvId);
    record("GET list -> locked item masked (title empty, hash empty), code visible", Boolean(lockItem) && lockItem.locked === true && lockItem.hasLockMaterial === true && lockItem.title === "" && lockItem.sha256Hash === "" && /^EV-/.test(lockItem.evidenceCode || ""), `title="${lockItem?.title}"`);

    let softUnlock = await request(`/api/evidence/${state.userEvId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: false }) });
    record("PATCH soft-unlock blocked -> 409 while material exists", softUnlock.status === 409, `status=${softUnlock.status}`);
    let reassociate = await request(`/api/evidence/${state.userEvId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: null }) });
    record("reassociate while crypto-locked -> 409", reassociate.status === 409, `status=${reassociate.status}`);
    let delLocked = await request(`/api/evidence/${state.userEvId}`, { method: "DELETE" });
    record("DELETE while crypto-locked -> 409", delLocked.status === 409, `status=${delLocked.status}`);

    let wrongUnlock = await request(`/api/evidence/${state.userEvId}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifier: randomB64(32) }) });
    record("POST /unlock wrong credential -> 403", wrongUnlock.status === 403 && /incorrect|wrong/i.test(wrongUnlock.data?.error || ""), `status=${wrongUnlock.status}`);

    let goodUnlock = await request(`/api/evidence/${state.userEvId}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifier }) });
    const uev = goodUnlock.data?.evidence;
    record("POST /unlock correct verifier -> 200 granted + full reveal", goodUnlock.status === 200 && goodUnlock.data?.granted === true && Boolean(uev?.encryptedContent) && uev?.sha256Hash?.length === 64 && Boolean(uev?.title), `status=${goodUnlock.status}`);
    record("unlock returns ciphertext + IV for DEK decryption", Boolean(uev?.encryptedContent) && Boolean(uev?.encryptionIv), "payload present");
    record("unlock success keeps server datum LOCKED=true", uev?.locked === true, `locked=${uev?.locked}`);

    let afterUnlock = await request(`/api/evidence?id=${encodeURIComponent(state.userEvId)}`);
    const _auKeys = Object.keys(afterUnlock.data?.evidence || {});
    const _auNoTitle = !("title" in (afterUnlock.data?.evidence || {}));
    record("GET by-id after unlock -> STILL locked + masked (refresh re-locks)", afterUnlock.status === 200 && afterUnlock.data?.evidence?.locked === true && _auNoTitle, `locked=${afterUnlock.data?.evidence?.locked} keys=${_auKeys.join(",")}`);

    let relockAttempt = await request(`/api/evidence/${state.userEvId}/lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "password", lockVersion: 1, kdf: "PBKDF2-SHA256", kdfSalt: salt, kdfIterations: iterations, kdfParams: {}, wrappedKey: wrappedKey.ciphertext, wrappedKeyIv: wrappedKey.iv, verifierWrapped: wrappedVerifier.ciphertext, verifierIv: wrappedVerifier.iv, verifierSha, reencryptedContent: reenc.ciphertext, reencryptedIv: reenc.iv, reencryptedSize: reenc.ciphertext.length }) });
    record("relock while already locked -> 409 (requires unlock first)", relockAttempt.status === 409, `status=${relockAttempt.status}`);

    let chain = await request(`/api/chain-of-custody?evidenceId=${state.userEvId}&verify=true`);
    const actions = (chain.data?.events || []).map((e) => e?.action);
    record("chain contains LOCKED + UNLOCKED + DECRYPTED events", actions.includes("LOCKED") && actions.includes("UNLOCKED") && actions.includes("DECRYPTED"), actions.slice(-5).join(","));
    record("chain verification still valid after lock events", chain.data?.verification?.isValid === true, `${chain.data?.verification?.verifiedEventCount}/${chain.data?.verification?.totalEventCount}`);

    // no plaintext leak in DB
    let rowSel = await restSelect("evidence", `id=eq.${state.userEvId}`);
    const row = rowSel.rows?.[0] || {};
    const rowJson = JSON.stringify(row);
    record("DB row stores wrapped key material (not null)", Boolean(row.wrapped_key && row.verifier_wrapped && row.kdf_salt), `wrapped=${Boolean(row.wrapped_key)}`);
    record("DB row contains NO plaintext credential", !rowJson.includes(CRED), "clean");
    record("DB row contains NO plaintext verifier", !rowJson.includes(verifier), "clean");
    record("DB row contains NO raw DEK bytes", !rowJson.includes(bytesToB64(dekBytes)) && rowJson != null, "clean");
    record("DB verifier_sha is 64-hex digest (derived only)", /^[0-9a-f]{64}$/.test(row.verifier_sha || ""), row.verifier_sha?.slice(0, 8) + "…");

    // admin isolation
    await login("admin@cybersakhi.org", "Admin@Sakhi2026!");
    let adminGet = await request(`/api/evidence?id=${encodeURIComponent(state.userEvId)}`);
    record("admin GET crypto-locked user evidence -> 404", adminGet.status === 404, `status=${adminGet.status}`);
    let adminUnlock = await request(`/api/evidence/${state.userEvId}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifier }) });
    record("admin POST /unlock on user evidence -> 404", adminUnlock.status === 404, `status=${adminUnlock.status}`);

    await login("user@cybersakhi.org", "User@Sakhi2026!");

    // legacy soft-lock path preserved
    let ev2 = await postEvidence({ title: "legacy soft lock item", filename: "legacy.txt", fileType: "text/plain", fileSize: 10, sha256Hash: "2".repeat(64), category: "OTHER" });
    state.userEv2Id = ev2.data?.evidence?.id || null;
    let softLock = await request(`/api/evidence/${state.userEv2Id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: true }) });
    record("legacy PATCH lock (no material) -> 200", softLock.status === 200 && softLock.data?.evidence?.locked === true, `status=${softLock.status}`);
    let softList = await request("/api/evidence");
    const softItem = (softList.data?.evidence || []).find((e) => e?.id === state.userEv2Id);
    record("legacy soft-locked item has NO lock envelope / masked fields", Boolean(softItem) && softItem.locked === true && !softItem.hasLockMaterial && softItem.title !== "", `locked=${softItem?.locked} material=${softItem?.hasLockMaterial}`);
    let softUnlock2 = await request(`/api/evidence/${state.userEv2Id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: false }) });
    record("legacy PATCH soft-unlock (no material) -> 200", softUnlock2.status === 200 && softUnlock2.data?.evidence?.locked === false, `status=${softUnlock2.status}`);

    let hardUnlockSoft = await request(`/api/evidence/${state.userEv2Id}/unlock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifier }) });
    record("POST /unlock on soft-locked (no material) -> 400", hardUnlockSoft.status === 400, `status=${hardUnlockSoft.status}`);

    // cleanup via API where possible
    let delCase = await request(`/api/cases/${state.userCaseId}`, { method: "DELETE" });
    record("user case deleted -> 200", delCase.status === 200, `status=${delCase.status}`);
    let delSoft = await request(`/api/evidence/${state.userEv2Id}`, { method: "DELETE" });
    record("soft evidence deleted via API -> 200", delSoft.status === 200, `status=${delSoft.status}`);

    // ---- Zero-leftover verification (service role) ----
    const evIds = [state.userEvId, state.userEv2Id].filter(Boolean);
    const anchorIds = [state.tamperAnchorId, state.batchAnchorId, state.attemptAnchorId].filter(Boolean);
    let evRows = await restCount("evidence", "id=in.(" + evIds.join(",") + ")");
    record("DB: zero leftover evidence rows", evRows.ok && evRows.count === 0, `count=${evRows.count}`);
    let chainRows = await restCount("chain_of_custody", "evidence_id=in.(" + evIds.join(",") + ")");
    record("DB: zero leftover custody rows", chainRows.ok && chainRows.count === 0, `count=${chainRows.count}`);
    let anchorRows = await restCount("blockchain_anchors", "evidence_id=in.(" + evIds.join(",") + ")");
    record("DB: zero leftover anchor rows", anchorRows.ok && anchorRows.count === 0, `count=${anchorRows.count}`);
    let caseRows = await restCount("cases", "id=eq." + state.userCaseId);
    record("DB: zero leftover case rows", caseRows.ok && caseRows.count === 0, `count=${caseRows.count}`);

    state.cleanupCompleted = true;
  } catch (err) {
    console.error("UNCAUGHT:", err);
    results.push({ name: "run", pass: false, detail: String(err) });
  } finally {
    await residualDatabaseCleanup();
    try {
      const fs = await import("fs");
      await fs.promises.writeFile(MARKER_PATH, JSON.stringify({ ...state }, null, 2));
    } catch (_) {}
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n==== ${results.length - failed}/${results.length} passed ====`);
  process.exit(failed > 0 ? 1 : 0);
})();