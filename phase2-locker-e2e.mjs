/* Phase 2 Step 3 harness: Evidence Locker (privacy vault) behavior.
 *
 * Covers auth guards, empty vault + honest integrity/blockchain status,
 * evidence upload (plain + encrypted paths), EV- codes, lock/unlock with
 * chain-of-custody LOCKED/UNLOCKED events, case association + reassociation,
 * locked-state 409 guards, ownership isolation (incl. admin), honest delete
 * (custody chain removed with evidence), EXPORTED action, and zero-leftover
 * database verification via service role.
 *
 * Uses seeded accounts only (no probe auth users). Created rows are deleted by
 * the API during the run; a finally safety-net removes any residuals via REST
 * and a marker file is written for external cleanup verification.
 */
const BASE = process.env.BASE || "http://localhost:3000";
const results = [];
const jar = new Map();
const PROJECT_ENV =
  "C:\\Users\\ry526\\.gemini\\antigravity\\scratch\\cyber-sakhi\\.env.local";
const MARKER_PATH =
  process.env.PROBE_MARKER_PATH ||
  "C:\\Users\\ry526\\AppData\\Local\\Temp\\opencode\\locker-probe-marker.json";

const state = {
  userCaseId: null,
  userCaseNumber: null,
  adminCaseId: null,
  adminEvidenceId: null,
  evPlainId: null,
  evEncId: null,
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

const SAMPLE = `Received: from smtp.attacker-bank.xyz (smtp.attacker-bank.xyz [198.51.100.88])
        by mail.victim.org with ESMTP id phish002
        ; Tue, 02 Sep 2026 11:30:00 +0530
From: SBI Online Banking Security <alerts@secure-sbi-alerts.com>
Reply-To: verify@melink.phish.mobi
To: customer@example.com
Subject: [SBI ALERT] Your account is locked - Update required immediately
Date: Tue, 02 Sep 2026 11:30:00 +0530
Message-ID: <phish.002@secure-sbi-alerts.com>

Dear SBI Customer,

Your account has been locked due to unusual activity. Verify now:
CLICK HERE: http://secure-sbi-update.xyz/session/verify?tok=abc123
`;

function postEvidence(payload) {
  return request("/api/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

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
  return {
    url,
    h: { apikey: key, Authorization: `Bearer ${key}` },
  };
}

async function restCount(table, filter) {
  try {
    const { url, h } = await supabaseREST();
    const res = await fetch(`${url}/rest/v1/${table}?select=id&${filter}`, { headers: h });
    const rows = await res.json().catch(() => null);
    return { ok: res.ok, count: Array.isArray(rows) ? rows.length : -1, body: JSON.stringify(rows).slice(0, 120) };
  } catch (e) {
    return { ok: false, count: -1, body: String(e) };
  }
}

async function residualDatabaseCleanup() {
  try {
    const { url, h } = await supabaseREST();
    if (!url || !h.apikey) return;
    const ids = [state.evPlainId, state.evEncId, state.adminEvidenceId].filter(Boolean);
    if (ids.length) {
      const inFilter = "in.(" + ids.join(",") + ")";
      await fetch(`${url}/rest/v1/chain_of_custody?evidence_id=${inFilter}`, { method: "DELETE", headers: h }).catch(() => {});
      await fetch(`${url}/rest/v1/evidence?id=${inFilter}`, { method: "DELETE", headers: h }).catch(() => {});
    }
    for (const caseId of [state.userCaseId, state.adminCaseId]) {
      if (!caseId) continue;
      for (const [table, filter] of [
        ["case_chat_messages", `case_id=eq.${caseId}`],
        ["reports", `case_id=eq.${caseId}`],
        ["indicators", `case_id=eq.${caseId}`],
        ["email_investigations", `case_id=eq.${caseId}`],
        ["evidence", `case_id=eq.${caseId}`],
      ]) {
        await fetch(`${url}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: h }).catch(() => {});
      }
      await fetch(`${url}/rest/v1/cases?id=eq.${caseId}`, { method: "DELETE", headers: h }).catch(() => {});
    }
  } catch (_) {
    // cleanup must never break the harness
  }
}

(async () => {
  try {
    const fakeId = crypto.randomUUID();

    // ---- Auth guards ----
    let anonList = await request("/api/evidence");
    record("anon GET /api/evidence -> 401", anonList.status === 401, `status=${anonList.status}`);
    let anonById = await request(`/api/evidence?id=${fakeId}`);
    record("anon GET evidence by id -> 401", anonById.status === 401, `status=${anonById.status}`);
    let anonPost = await postEvidence({ title: "x", filename: "x.txt", fileType: "text/plain", fileSize: 1, sha256Hash: "a".repeat(64), category: "OTHER" });
    record("anon POST /api/evidence -> 401", anonPost.status === 401, `status=${anonPost.status}`);
    let anonPatch = await request(`/api/evidence/${fakeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: true }) });
    record("anon PATCH /api/evidence/:id -> 401", anonPatch.status === 401, `status=${anonPatch.status}`);
    let anonDelete = await request(`/api/evidence/${fakeId}`, { method: "DELETE" });
    record("anon DELETE /api/evidence/:id -> 401", anonDelete.status === 401, `status=${anonDelete.status}`);
    let anonChain = await request(`/api/chain-of-custody?evidenceId=${fakeId}`);
    record("anon GET chain-of-custody -> 401", anonChain.status === 401, `status=${anonChain.status}`);

    // ---- Empty vault + honest status ----
    await login("user@cybersakhi.org", "User@Sakhi2026!");
    let sess = (await request("/api/auth/session")).data;
    record("seeded USER login works", Boolean(sess?.user?.id) && sess?.user?.email === "user@cybersakhi.org", sess?.user?.email);

    let list0 = await request("/api/evidence");
    record("GET evidence list -> 200 with array", list0.status === 200 && Array.isArray(list0.data?.evidence), `status=${list0.status}`);
    record("vault starts empty (no seeded fake evidence)", (list0.data?.evidence || []).length === 0, `count=${(list0.data?.evidence || []).length}`);
    record("integrity provider honest + active", list0.data?.system?.integrityProvider?.status === "active" && list0.data?.system?.integrityProvider?.key === "local-sha256-chain", `${list0.data?.system?.integrityProvider?.key} (${list0.data?.system?.integrityProvider?.status})`);
    record("blockchain anchor honest unavailable", list0.data?.system?.blockchainAnchor?.status === "unavailable", list0.data?.system?.blockchainAnchor?.key);
    record("no fake anchor fields in system payload", !/simulated|bafy|0x[0-9a-f]{64}/i.test(JSON.stringify(list0.data?.system || {})), list0.data?.system?.blockchainAnchor?.status);

    // ---- Validation guards ----
    let v1 = await postEvidence({ title: "no hash", filename: "x.txt", fileType: "text/plain", fileSize: 1, category: "OTHER" });
    record("missing sha256Hash -> 400", v1.status === 400, `status=${v1.status}`);
    let v2 = await postEvidence({ title: "big", filename: "big.bin", fileType: "application/octet-stream", fileSize: 26 * 1024 * 1024, sha256Hash: "a".repeat(64), category: "OTHER" });
    record("25 MB cap enforced -> 400", v2.status === 400 && /25 MB/i.test(v2.data?.error || ""), `status=${v2.status} ${v2.data?.error || ""}`.slice(0, 80));
    let v3 = await postEvidence({ title: "neg", filename: "x.txt", fileType: "text/plain", fileSize: -4, sha256Hash: "a".repeat(64), category: "OTHER" });
    record("negative fileSize -> 400", v3.status === 400, `status=${v3.status}`);
    let v4 = await postEvidence({ title: "big ciphertext", filename: "c.txt", fileType: "text/plain", fileSize: 10, sha256Hash: "a".repeat(64), category: "OTHER", encryptedContent: "x".repeat(36_000_001), encryptionIv: "abc", encryptedSize: 44 });
    record("encrypted payload cap enforced -> 400", v4.status === 400 && /too large/i.test(v4.data?.error || ""), `status=${v4.status}`);
    let v5 = await postEvidence({ title: "bad case link", filename: "x.txt", fileType: "text/plain", fileSize: 1, sha256Hash: "a".repeat(64), category: "OTHER", caseId: "not-a-uuid" });
    record("invalid linked case uuid -> 400", v5.status === 400, `status=${v5.status}`);

    // ---- Plain evidence upload ----
    let plain = await postEvidence({ title: "phishing email screenshot", filename: "phish.png", fileType: "image/png", fileSize: 40412, sha256Hash: "c".repeat(64), category: "SCAM", notes: "raw capture" });
    record("plain evidence upload -> 201", plain.status === 201, `status=${plain.status}`);
    state.evPlainId = plain.data?.evidence?.id || null;
    record("POST returns raw row id", Boolean(state.evPlainId), state.evPlainId);
    record("evidence code EV- format", /^EV-\d{4}-[A-Z2-9]{8}$/.test(plain.data?.evidence?.evidence_code || ""), plain.data?.evidence?.evidence_code);
    record("POST response has NO fabricated anchors", !/simulated|bafy|mock(iPfs|Tx|_ipfs|cid)|0x[0-9a-f]{64}/i.test(JSON.stringify(plain.data?.evidence || {})), "clean");
    record("plain evidence metadata starts unlocked + unencrypted", plain.data?.evidence?.metadata?.locked === false && plain.data?.evidence?.metadata?.encrypted === false, plain.data?.evidence?.metadata?.encrypted === false ? "unencrypted" : "encrypted");
    let plainById = await request(`/api/evidence?id=${encodeURIComponent(state.evPlainId)}`);
    record("GET plain by id -> 200 locked=false", plainById.status === 200 && plainById.data?.evidence?.locked === false, `locked=${plainById.data?.evidence?.locked}`);
    record("GET plain by id caseNumber null when unlinked", plainById.data?.evidence?.caseNumber === null, String(plainById.data?.evidence?.caseNumber));
    record("GET plain by id exposes honest ciphertext fields (null)", plainById.data?.evidence?.encryptedContent === null && plainById.data?.evidence?.encryptionIv === null, "no ciphertext");
    let chainPlain = await request(`/api/chain-of-custody?evidenceId=${state.evPlainId}&verify=true`);
    record("chain verify valid after upload", chainPlain.data?.verification?.isValid === true, `${chainPlain.data?.verification?.verifiedEventCount}/${chainPlain.data?.verification?.totalEventCount}`);
    record("chain contains UPLOADED", (chainPlain.data?.events || []).some((e) => e?.action === "UPLOADED"), "present");

    // ---- Encrypted evidence upload ----
    let enc = await postEvidence({ title: "encrypted chat log", filename: "chat.log", fileType: "application/octet-stream", fileSize: 8192, sha256Hash: "d".repeat(64), category: "HARASSMENT", encryptedContent: "SaltedCipherTextPayload==", encryptionIv: "iv_base64==", encryptedSize: 44, notes: "client-side AES-256-GCM" });
    record("encrypted evidence upload -> 201", enc.status === 201, `status=${enc.status}`);
    state.evEncId = enc.data?.evidence?.id || null;
    let encById = await request(`/api/evidence?id=${encodeURIComponent(state.evEncId)}`);
    record("encrypted evidence flagged encrypted=true", encById.data?.evidence?.encrypted === true, `encrypted=${encById.data?.evidence?.encrypted}`);
    record("owner can retrieve own ciphertext + iv honestly", encById.data?.evidence?.encryptedContent === "SaltedCipherTextPayload==" && encById.data?.evidence?.encryptionIv === "iv_base64==", "ciphertext present");
    let chainEnc = await request(`/api/chain-of-custody?evidenceId=${state.evEncId}&verify=true`);
    record("encrypted chain contains ENCRYPTED event", (chainEnc.data?.events || []).some((e) => e?.action === "ENCRYPTED"), "present");
    record("encrypted chain verify still valid", chainEnc.data?.verification?.isValid === true, `${chainEnc.data?.verification?.verifiedEventCount}/${chainEnc.data?.verification?.totalEventCount}`);

    // ---- Case association ----
    let ucase = await createCase();
    record("user case created for association", ucase.status === 200 && Boolean(ucase.id) && /^CS-\d{4}-[A-Z2-9]{6}$/.test(ucase.caseNumber || ""), ucase.caseNumber);
    state.userCaseId = ucase.id;
    state.userCaseNumber = ucase.caseNumber;

    let link = await request(`/api/evidence/${state.evPlainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: state.userCaseId }) });
    record("PATCH link evidence to own case -> 200", link.status === 200 && link.data?.evidence?.caseId === state.userCaseId, `caseId=${link.data?.evidence?.caseId}`);
    record("PATCH response includes caseNumber", link.data?.evidence?.caseNumber === state.userCaseNumber, link.data?.evidence?.caseNumber);
    let chainLink = await request(`/api/chain-of-custody?evidenceId=${state.evPlainId}`);
    record("chain contains CASE_LINKED event", (chainLink.data?.events || []).some((e) => e?.action === "CASE_LINKED"), "present");

    let listLinked = await request("/api/evidence");
    const linkedItem = (listLinked.data?.evidence || []).find((e) => e?.id === state.evPlainId);
    record("list item carries caseNumber + evidenceCode + custody count", Boolean(linkedItem?.caseNumber === state.userCaseNumber && linkedItem?.evidenceCode && typeof linkedItem?.custodyCount === "number" && linkedItem?.custodyCount >= 1), `code=${linkedItem?.evidenceCode} count=${linkedItem?.custodyCount}`);
    record("list item has NO fabricated anchors", !/simulated|bafy|mock/i.test(JSON.stringify(linkedItem || {})), "clean");

    // ---- Lock lifecycle + guards ----
    let lock = await request(`/api/evidence/${state.evPlainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: true }) });
    record("PATCH lock -> 200 locked=true", lock.status === 200 && lock.data?.evidence?.locked === true && Boolean(lock.data?.evidence?.lockedAt), `locked=${lock.data?.evidence?.locked}`);
    let lockedById = await request(`/api/evidence?id=${encodeURIComponent(state.evPlainId)}`);
    record("GET locked evidence reports locked=true", lockedById.data?.evidence?.locked === true, `locked=${lockedById.data?.evidence?.locked}`);
    let chainLock = await request(`/api/chain-of-custody?evidenceId=${state.evPlainId}`);
    record("chain contains LOCKED event", (chainLock.data?.events || []).some((e) => e?.action === "LOCKED"), "present");

    let delWhileLocked = await request(`/api/evidence/${state.evPlainId}`, { method: "DELETE" });
    record("DELETE while locked -> 409", delWhileLocked.status === 409 && /locked/i.test(delWhileLocked.data?.error || ""), `status=${delWhileLocked.status}`);
    let relinkWhileLocked = await request(`/api/evidence/${state.evPlainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: null }) });
    record("reassociate while locked -> 409", relinkWhileLocked.status === 409, `status=${relinkWhileLocked.status}`);
    let lockGi = await request(`/api/evidence/${fakeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: true }) });
    record("PATCH non-existent evidence -> 404", lockGi.status === 404, `status=${lockGi.status}`);

    let unlock = await request(`/api/evidence/${state.evPlainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: false }) });
    record("PATCH unlock -> 200 locked=false", unlock.status === 200 && unlock.data?.evidence?.locked === false, `locked=${unlock.data?.evidence?.locked}`);
    let chainUnlock = await request(`/api/chain-of-custody?evidenceId=${state.evPlainId}`);
    record("chain contains UNLOCKED event", (chainUnlock.data?.events || []).some((e) => e?.action === "UNLOCKED"), "present");

    // ---- Unlink + export + invalid action ----
    let unlink = await request(`/api/evidence/${state.evPlainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: null }) });
    record("PATCH unlink -> 200 caseId=null", unlink.status === 200 && unlink.data?.evidence?.caseId === null, `caseId=${unlink.data?.evidence?.caseId}`);
    let exported = await request("/api/chain-of-custody", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceId: state.evPlainId, action: "EXPORTED", notes: "dossier export" }) });
    record("chain EXPORTED action allowed -> 201", exported.status === 201, `status=${exported.status}`);
    let badAction = await request("/api/chain-of-custody", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceId: state.evPlainId, action: "DESTROY" }) });
    record("chain invalid action -> 400", badAction.status === 400, `status=${badAction.status}`);
    let noopPatch = await request(`/api/evidence/${state.evPlainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    record("PATCH with nothing to update -> 400", noopPatch.status === 400, `status=${noopPatch.status}`);

    // ---- Cross-user / admin isolation ----
    await login("admin@cybersakhi.org", "Admin@Sakhi2026!");
    let acase = await createCase();
    record("admin case created", acase.status === 200 && Boolean(acase.id), acase.caseNumber);
    state.adminCaseId = acase.id;
    let adminEv = await postEvidence({ title: "admin vault item", filename: "admin.txt", fileType: "text/plain", fileSize: 3, sha256Hash: "e".repeat(64), category: "OTHER", caseId: state.adminCaseId });
    record("admin evidence linked to own admin case -> 201", adminEv.status === 201 && adminEv.data?.evidence?.case_id === state.adminCaseId, `status=${adminEv.status}`);
    state.adminEvidenceId = adminEv.data?.evidence?.id || null;
    let adminList = await request("/api/evidence");
    record("admin vault list is isolated (no user evidence)", Array.isArray(adminList.data?.evidence) && !adminList.data.evidence.some((e) => e?.id === state.evPlainId || e?.id === state.evEncId) && adminList.data.evidence.some((e) => e?.id === state.adminEvidenceId), `count=${(adminList.data?.evidence || []).length}`);
    let adminGetUser = await request(`/api/evidence?id=${encodeURIComponent(state.evPlainId)}`);
    record("admin GET user evidence -> 404", adminGetUser.status === 404, `status=${adminGetUser.status}`);
    let adminPatchUser = await request(`/api/evidence/${state.evPlainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: true }) });
    record("admin PATCH user evidence -> 404", adminPatchUser.status === 404, `status=${adminPatchUser.status}`);
    let adminDelUser = await request(`/api/evidence/${state.evPlainId}`, { method: "DELETE" });
    record("admin DELETE user evidence -> 404", adminDelUser.status === 404, `status=${adminDelUser.status}`);
    let adminChainUser = await request(`/api/chain-of-custody?evidenceId=${state.evPlainId}`);
    record("admin chain read on user evidence -> 403", adminChainUser.status === 403, `status=${adminChainUser.status}`);
    let adminLockOwn = await request(`/api/evidence/${state.adminEvidenceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: true }) });
    record("admin locks own evidence -> 200", adminLockOwn.status === 200 && adminLockOwn.data?.evidence?.locked === true, `status=${adminLockOwn.status}`);
    let adminUnlockOwn = await request(`/api/evidence/${state.adminEvidenceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: false }) });
    record("admin unlocks own evidence -> 200", adminUnlockOwn.status === 200 && adminUnlockOwn.data?.evidence?.locked === false, `status=${adminUnlockOwn.status}`);

    await login("user@cybersakhi.org", "User@Sakhi2026!");
    let userCrossCase = await request(`/api/evidence/${state.evPlainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: state.adminCaseId }) });
    record("user cannot link evidence to admin case -> 403", userCrossCase.status === 403, `status=${userCrossCase.status}`);
    let userCrossChain = await request("/api/chain-of-custody", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidenceId: state.adminEvidenceId, action: "EXPORTED" }) });
    record("user cannot write custody on admin evidence -> 403", userCrossChain.status === 403, `status=${userCrossChain.status}`);
    let badCaseShape = await request(`/api/evidence/${state.evPlainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: 5 }) });
    record("PATCH non-string caseId -> 400", badCaseShape.status === 400, `status=${badCaseShape.status}`);

    // ---- Delete lifecycle (honest) ----
    await login("user@cybersakhi.org", "User@Sakhi2026!");
    let delEnc = await request(`/api/evidence/${state.evEncId}`, { method: "DELETE" });
    record("user deletes own encrypted evidence -> 200", delEnc.status === 200, `status=${delEnc.status}`);
    record("delete message honestly states custody removed", /chain of custody was removed/i.test(delEnc.data?.message || ""), delEnc.data?.message?.slice(0, 80));
    let encGone = await request(`/api/evidence?id=${encodeURIComponent(state.evEncId)}`);
    record("deleted encrypted evidence GET -> 404", encGone.status === 404, `status=${encGone.status}`);
    let encChainGone = await request(`/api/chain-of-custody?evidenceId=${state.evEncId}`);
    record("deleted evidence chain read -> 403 (no orphan rows)", encChainGone.status === 403, `status=${encChainGone.status}`);

    let delPlain = await request(`/api/evidence/${state.evPlainId}`, { method: "DELETE" });
    record("user deletes own plain evidence -> 200", delPlain.status === 200, `status=${delPlain.status}`);
    let plainGone = await request(`/api/evidence?id=${encodeURIComponent(state.evPlainId)}`);
    record("deleted plain evidence GET -> 404", plainGone.status === 404, `status=${plainGone.status}`);

    // ---- Own case + admin case cleanup via API ----
    let delUserCase = await request(`/api/cases/${state.userCaseId}`, { method: "DELETE" });
    record("user case deleted -> 200", delUserCase.status === 200, `status=${delUserCase.status}`);
    await login("admin@cybersakhi.org", "Admin@Sakhi2026!");
    let delAdminEv = await request(`/api/evidence/${state.adminEvidenceId}`, { method: "DELETE" });
    record("admin deletes own evidence -> 200", delAdminEv.status === 200, `status=${delAdminEv.status}`);
    let delAdminCase = await request(`/api/cases/${state.adminCaseId}`, { method: "DELETE" });
    record("admin case deleted -> 200", delAdminCase.status === 200, `status=${delAdminCase.status}`);

    await login("user@cybersakhi.org", "User@Sakhi2026!");
    let finalList = await request("/api/evidence");
    record("vault empty again after deletes", (finalList.data?.evidence || []).filter((e) => e?.id === state.evPlainId || e?.id === state.evEncId).length === 0, `count=${(finalList.data?.evidence || []).length}`);

    // ---- Zero-leftover verification via service role ----
    const ids = [state.evPlainId, state.evEncId, state.adminEvidenceId].filter(Boolean);
    const caseIds = [state.userCaseId, state.adminCaseId].filter(Boolean);
    let evRows = await restCount("evidence", "id=in.(" + ids.join(",") + ")");
    record("DB: zero leftover evidence rows", evRows.ok && evRows.count === 0, `count=${evRows.count}`);
    let chainRows = await restCount("chain_of_custody", "evidence_id=in.(" + ids.join(",") + ")");
    record("DB: zero leftover custody rows", chainRows.ok && chainRows.count === 0, `count=${chainRows.count}`);
    let caseRows = await restCount("cases", "id=in.(" + caseIds.join(",") + ")");
    record("DB: zero leftover case rows", caseRows.ok && caseRows.count === 0, `count=${caseRows.count}`);

    state.cleanupCompleted = true;
  } catch (err) {
    console.error("UNCAUGHT:", err);
    results.push({ name: "run", pass: false, detail: String(err) });
  } finally {
    await residualDatabaseCleanup();
    try {
      const fs = await import("fs");
      await fs.promises.writeFile(
        MARKER_PATH,
        JSON.stringify({ ...state }, null, 2)
      );
    } catch (_) {}
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n==== ${results.length - failed}/${results.length} passed ====`);
  process.exit(failed > 0 ? 1 : 0);
})();