/* Advanced-stage smoke test: B-G engine explainability + H-J chat/escalation + report sections.
 *
 * RECOVERY NOTE: this is the recovered original Phase 2 advanced harness (50 checks,
 * previously 50/50 PASS). All 50 `check()` calls below are preserved verbatim from the
 * recovered source. A finally-style safety-net (silent, no-check) was added so that any
 * probe case / probe auth user / custody rows created by this run are guaranteed to be
 * removed even when a check throws mid-run, and probe identifiers are written to a marker
 * file so an external cleanup verification step can assert zero leftovers.
 */
const BASE = "http://localhost:3000";
const results = [];
const jar = new Map();

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
    opts.body =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  }
  const res = await fetch(BASE + path, opts).catch(async (e) => {
    console.error("FETCH ERROR on", path, "method", opts.method || "GET", "keys", Object.keys(opts), "bodyType", typeof opts.body);
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
  const csrf = await request("/api/auth/csrf");
  await request("/api/auth/callback/credentials", {
    method: "POST",
    form: { csrfToken: csrf.data?.csrfToken, identifier, password, json: "true" },
  });
}

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
}

const SAMPLE = `Received: from mail.attacker-phish.xyz (mail.attacker-phish.xyz [203.0.113.47])
        by mx.victim.com with ESMTP id abc123xyz
        ; Mon, 01 Sep 2026 10:15:00 +0530
Received: from [10.0.0.5] (localhost [127.0.0.1])
        by mail.attacker-phish.xyz with SMTP id x99
        ; Mon, 01 Sep 2026 04:44:55 +0000
Authentication-Results: mx.victim.com;
        spf=fail (sender IP is 203.0.113.47) smtp.mailfrom=attacker@attacker-phish.xyz;
        dkim=fail header.d=hdfc-alerts.com reason="signature verification failed";
        dmarc=fail action=quarantine header.from=hdfc-alerts.com
From: HDFC Bank Security Alert <security@hdfc-alerts.com>
Reply-To: collect-your-refund@totally-not-phishing.top
Return-Path: <bounce@attacker-phish.xyz>
To: victim@example.com
Subject: [URGENT] Your HDFC NetBanking is suspended — Verify KYC within 24 hours
Date: Mon, 01 Sep 2026 10:15:00 +0530
Message-ID: <xyz.1234567890@hdfc-alerts.com>
Content-Type: multipart/mixed; boundary="csk=boundary38f1d702"

--csk=boundary38f1d702
Content-Type: text/plain; charset=UTF-8

Dear Valued Customer,

Your HDFC Bank NetBanking account has been SUSPENDED due to incomplete KYC verification.

Action Required: Click here to verify your KYC immediately to restore access:
http://hdfc-kyc-update.xyz/verify?token=a1b2c3d4e5f6g7h8i9j0

You must complete verification within 24 hours or your account will be permanently deactivated.

Please enter your:
- Customer ID / Net Banking Login
- OTP sent to your registered mobile
- Credit/Debit Card CVV for identity confirmation

HDFC Bank Customer Care
Toll Free: 1800-xxx-xxxx

--csk=boundary38f1d702
Content-Type: application/octet-stream; name="invoice_pay_receipt.pdf.exe"
Content-Disposition: attachment; filename="invoice_pay_receipt.pdf.exe"
Content-Transfer-Encoding: base64

TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
--csk=boundary38f1d702--`;

let caseId = null;
let createdEvidenceId = null;
let probeUserId = null;
let probeUserEmail = null;
let cleanupCompleted = false;

const PROJECT_ENV =
  "C:\\Users\\ry526\\.gemini\\antigravity\\scratch\\cyber-sakhi\\.env.local";
const MARKER_PATH =
  process.env.PROBE_MARKER_PATH ||
  "C:\\Users\\ry526\\AppData\\Local\\Temp\\opencode\\advanced-probe-marker.json";

async function residualDatabaseCleanup() {
  try {
    const fs = await import("fs");
    const envSrc = fs.readFileSync(PROJECT_ENV, "utf8");
    const getVar = (n) => (envSrc.match(new RegExp(`^${n}=(.*)$`, "m")) || [])[1]?.trim();
    const supabaseUrl = getVar("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseKey = getVar("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) return;
    const h = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
    if (caseId) {
      for (const [table, filter] of [
        ["case_chat_messages", `case_id=eq.${caseId}`],
        ["reports", `case_id=eq.${caseId}`],
        ["indicators", `case_id=eq.${caseId}`],
        ["email_investigations", `case_id=eq.${caseId}`],
        ["evidence", `case_id=eq.${caseId}`],
      ]) {
        await fetch(`${supabaseUrl}/rest/v1/${table}?${filter}`, {
          method: "DELETE",
          headers: h,
        }).catch(() => {});
      }
    }
    if (createdEvidenceId) {
      await fetch(
        `${supabaseUrl}/rest/v1/chain_of_custody?evidence_id=eq.${createdEvidenceId}`,
        { method: "DELETE", headers: h }
      ).catch(() => {});
    }
    if (probeUserId) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${probeUserId}`, {
        method: "DELETE",
        headers: h,
      }).catch(() => {});
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${probeUserId}`, {
        method: "DELETE",
        headers: h,
      }).catch(() => {});
    }
  } catch (_) {
    // cleanup must never break the harness
  }
}

try {
  const loginOk = await login("user@cybersakhi.org", "User@Sakhi2026!");
  check("login user", true, "Case flow login");

  const sessionRes = await request("/api/auth/session");
  const session = sessionRes.data;
  check("session has user id", Boolean(session?.user?.id), session?.user?.email || "");

  const analyze = await request("/api/email-forensics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawEmail: SAMPLE, saveAsCase: true }),
  });

  check("analyze returns verdict", Boolean(analyze.data?.verdict?.summary), analyze.data?.threatLevel);
  check("analyze threatLevel CRITICAL", analyze.data?.threatLevel === "CRITICAL", `score=${analyze.data?.threatScore}`);

  const bd = analyze.data?.scoreBreakdown;
  check("scoreBreakdown groups > 0", Boolean(bd?.groups?.length), JSON.stringify((bd?.groups || []).map(g => `${g.group}=${g.points}`)));

  const sf = analyze.data?.structuredFindings || [];
  check("structuredFindings present", sf.length > 0, `${sf.length} findings (cat=${sf[0]?.category},sev=${sf[0]?.severity},conf=${sf[0]?.confidence})`);

  const smtpAnom = analyze.data?.smtpAnomalies || [];
  check("smtpAnomalies > 0", smtpAnom.length > 0, smtpAnom.map(a => `${a.severity}:${a.type}`).join(","));

  const attach = analyze.data?.attachments || [];
  check("attachments flagged", attach.length > 0 && attach.some(a => a.suspicious), attach.map(a => `${a.filename} suspicious=${a.suspicious}`).join(","));

  const ents = analyze.data?.entities || [];
  check("entities extracted", ents.some(e => e.type === "account") && ents.some(e => e.type === "organization"), ents.slice(0, 5).map(e => `${e.type}=${e.value}`).join(","));

  // ---- Stage C: explainable NLP + URL risk ----
  const nlp = analyze.data?.nlp;
  check("nlp categories detected", Boolean(nlp?.categoriesDetected?.length), (nlp?.categoriesDetected || []).join(","));
  check("nlp detects credential + financial signals", Boolean(nlp?.categoriesDetected?.includes("credential_harvesting") && nlp?.categoriesDetected?.includes("financial_fraud")), (nlp?.categoriesDetected || []).join(","));
  check("nlp per-trigger evidence present", Boolean((nlp?.detail || []).length > 0 && (nlp?.detail || []).every(d => typeof d.evidence === "string" && d.evidence.length > 0)), `${nlp?.triggerCount} triggers`);
  check("nlp model is explainable deterministic provider", Boolean(nlp?.model && nlp?.model.includes("deterministic")), nlp?.model);

  const urlRisk = analyze.data?.urlRisk || [];
  check("urlRisk present", urlRisk.length > 0, urlRisk.map(u => `${u.severity}:${u.flags.length}`).join(","));
  check("urlRisk flags hdfc lure high", Boolean(urlRisk.find(u => u.url.includes("hdfc-kyc-update.xyz") && u.severity === "HIGH" && u.flags.length > 0)), urlRisk.map(u => u.url).join(","));

  const run2 = await request("/api/email-forensics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawEmail: SAMPLE, saveAsCase: false }),
  });
  check("nlp deterministic across runs", run2.data?.nlp?.rawScore === nlp?.rawScore && run2.data?.nlp?.triggerCount === nlp?.triggerCount, `${nlp?.rawScore}/${nlp?.triggerCount} vs ${run2.data?.nlp?.rawScore}/${run2.data?.nlp?.triggerCount}`);
  check("urlRisk deterministic across runs", JSON.stringify(run2.data?.urlRisk) === JSON.stringify(urlRisk));

  caseId = analyze.data?.case?.id;
  check("case created from analysis", Boolean(caseId), caseId);

  // ---- Report sections ----
  const report = await request(`/api/cases/${caseId}/report?format=text`);
  const body = typeof report.data === "string" ? report.data : report.data?.envelope?.content || "";
  check("report has executive summary", /executive summary/i.test(body));
  check("report has risk breakdown", /risk breakdown|score contributions/i.test(body));
  check("report has spoofing analysis", /sender spoofing analysis/i.test(body));
  check("report has smtp anomalies", /relay anomalies/i.test(body));
  check("report has evidence-backed findings", /evidence-backed findings/i.test(body));
  check("report has domain intelligence", /domain intelligence/i.test(body));
  check("report has attachments", /attachment analysis/i.test(body));
  check("report has linked evidence", /linked evidence/i.test(body));

  // ---- Chat: escalation + progressive ----
  const esc = await request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "I clicked the link and entered my OTP. Should I report this to the cybercell?", language: "en", caseId }),
  });
  check("chat escalation guidance", esc.data?.text?.includes("never files") || esc.data?.text?.includes("your decision"), esc.data?.category);

  const simple = await request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "explain in simple words", language: "en", caseId }),
  });
  check("chat simple explanation", simple.data?.category === "education" || /plain words/i.test(simple.data?.text || ""), simple.data?.category);

  const hist = await request(`/api/chat?caseId=${caseId}`);
  check("chat GET returns history", Array.isArray(hist.data?.messages) && hist.data.messages.length >= 4, `length=${hist.data?.messages?.length}`);

  // ---- Case detail carries advanced fields ----
  const detail = await request(`/api/cases/${caseId}`);
  const da = detail.data?.investigations?.[0]?.analysis;
  check("case analysis has verdict", Boolean(da?.verdict?.summary), da?.threatLevel);
  check("case analysis has scoreBreakdown", Boolean(da?.scoreBreakdown?.groups?.length));

  // ---- Stage C2: chat by case number + ownership isolation ----
  const cn = analyze.data?.case?.caseNumber;
  const byNum = await request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: `My case number is ${cn}. Explain this email, please.`, language: "en" }),
  });
  check("chat resolves own case number", byNum.data?.context?.caseId === caseId, String(byNum.data?.context?.caseId));
  check("chat 5-part simple explanation", /\*\*4\) What should I do\?\*\*/.test(byNum.data?.text || ""), byNum.data?.category);

  await login("admin@cybersakhi.org", "Admin@Sakhi2026!");
  const crossChat = await request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: `please explain case ${cn}`, language: "en" }),
  });
  check("chat does NOT leak another user's case", crossChat.data?.context?.caseId === null && /not find that case/i.test(crossChat.data?.context?.note || ""), String(crossChat.data?.context?.caseId));

  const crossEv = await request("/api/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "admin cross-user attempt",
      filename: "x.txt",
      fileType: "text/plain",
      fileSize: 1,
      sha256Hash: "b".repeat(64),
      category: "OTHER",
      caseId,
    }),
  });
  check("admin cannot link evidence to another user's case", crossEv.status === 403, String(crossEv.status));

  await login("user@cybersakhi.org", "User@Sakhi2026!");

  // ---- Evidence linked to case (server-side) + report linkage ----
  const ev = await request("/api/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "E2E linked evidence",
      filename: "invoice_pay_receipt.pdf.exe",
      fileType: "application/octet-stream",
      fileSize: 1234,
      sha256Hash: "a".repeat(64),
      category: "THREAT",
      notes: "linked via caseId during harness",
      caseId,
    }),
  });
  check("evidence linked to own case", ev.status === 201 && ev.data?.evidence?.case_id === caseId, `status=${ev.status}`);
  createdEvidenceId = ev.data?.evidence?.id || null;

  // ---- Stage D2: evidence integrity provider seam (honest, wired) ----
  const integ = ev.data?.integrity;
  check("evidence integrity provider active", integ?.provider?.status === "active" && /local crypto chain/i.test(integ?.provider?.label || ""), `${integ?.provider?.key} (${integ?.provider?.status})`);
  const chainVerify = await request(`/api/chain-of-custody?evidenceId=${ev.data?.evidence?.id}&verify=true`);
  check("chain-of-custody exposes integrity provider", Boolean(chainVerify.data?.integrityProvider?.status === "active" && /local crypto chain/i.test(chainVerify.data?.integrityProvider?.label || "")), chainVerify.data?.integrityProvider?.key);
  check("chain verification valid", chainVerify.data?.verification?.isValid === true, `${chainVerify.data?.verification?.verifiedEventCount}/${chainVerify.data?.verification?.totalEventCount}`);

  // ---- Stage K: Sakhi reasoning provider seam ----
  check("chat exposes deterministic reasoning provider", esc.data?.provider?.key === "heuristic-crosswalk", esc.data?.provider?.key || "(none)");

  const report2 = await request(`/api/cases/${caseId}/report?format=text`);
  const body2 = typeof report2.data === "string" ? report2.data : report2.data?.envelope?.content || "";
  check("report lists linked evidence item", /linked evidence/i.test(body2) && /EV-\d{4}-/.test(body2));

  // ---- Stage K: signup while already logged in must be blocked ----
  const sessBefore = (await request("/api/auth/session")).data?.user?.email;
  const dupSignup = await request("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Guard Probe",
      email: "guard-probe-" + Date.now() + "@example.com",
      age: 25,
      city: "Delhi",
    }),
  });
  check("authenticated signup blocked 409", dupSignup.status === 409, `status=${dupSignup.status} ${dupSignup.data?.error || ""}`);
  check("authenticated signup message clear", /already logged in/i.test(dupSignup.data?.error || ""), dupSignup.data?.error);
  const sessAfter = (await request("/api/auth/session")).data?.user?.email;
  check("session unchanged after blocked signup", sessAfter === sessBefore, `${sessBefore} -> ${sessAfter}`);

  // ---- Cleanup ----
  const del = await request(`/api/cases/${caseId}`, { method: "DELETE" });
  check("case deleted", del.status === 200, String(del.status));

  const evGone = await request(`/api/evidence?id=${ev.data?.evidence?.id}`);
  check("evidence cascaded with case delete", evGone.status === 404, String(evGone.status));

  const noAccess = await request(`/api/cases/${caseId}`);
  check("deleted case 404", noAccess.status === 404, String(noAccess.status));

  // ---- Stage K: unauthenticated signup must still work (regression) ----
  const csrf2 = await request("/api/auth/csrf");
  await request("/api/auth/signout", {
    method: "POST",
    form: { csrfToken: csrf2.data?.csrfToken, json: "true" },
  });
  const signedOutSession = (await request("/api/auth/session")).data;
  check("signout clears session", !signedOutSession?.user, JSON.stringify(signedOutSession));

  const unsignedProbeEmail = "guard-probe-" + Date.now() + "@example.com";
  const unsignedSignup = await request("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Guard Probe New",
      email: unsignedProbeEmail,
      age: 25,
      city: "Delhi",
    }),
  });
  check("unauthenticated signup still succeeds", unsignedSignup.status === 201 && Boolean(unsignedSignup.data?.user?.id), `status=${unsignedSignup.status}`);
  probeUserId = unsignedSignup.data?.user?.id || null;
  probeUserEmail = unsignedProbeEmail;

  // Clean up the probe auth user (admin API) + any profiles row, keeping DB clean.
  try {
    const fs = await import("fs");
    const envSrc = fs.readFileSync(PROJECT_ENV, "utf8");
    const getVar = (n) => (envSrc.match(new RegExp(`^${n}=(.*)$`, "m")) || [])[1]?.trim();
    const supabaseUrl = getVar("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseKey = getVar("SUPABASE_SERVICE_ROLE_KEY");
    const probeId = probeUserId;
    if (probeId && supabaseUrl && supabaseKey) {
      const adminDel = await fetch(`${supabaseUrl}/auth/v1/admin/users/${probeId}`, {
        method: "DELETE",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      });
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${probeId}`, {
        method: "DELETE",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      }).catch(() => {});
      check("probe user cleaned up", adminDel.status === 200 || adminDel.status === 404, `adminDel=${adminDel.status}`);
    }
  } catch (e) {
    console.error("probe cleanup skipped:", String(e));
  }
  cleanupCompleted = true;
} catch (err) {
  console.error("UNCAUGHT:", err);
  results.push({ name: "run", pass: false, detail: String(err) });
} finally {
  // Safety net (silent, no-check): last-resort removal of any residual case.
  try {
    if (!cleanupCompleted && caseId) {
      await request(`/api/cases/${caseId}`, { method: "DELETE" }).catch(() => {});
    }
  } catch (_) {}
  await residualDatabaseCleanup();
  try {
    const fs = await import("fs");
    await fs.promises.writeFile(
      MARKER_PATH,
      JSON.stringify(
        {
          caseId,
          evidenceId: createdEvidenceId,
          probeUserId,
          probeUserEmail,
          cleanupCompleted,
        },
        null,
        2
      )
    );
  } catch (_) {}
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n==== ${results.length - failed}/${results.length} passed ====`);
process.exit(failed > 0 ? 1 : 0);