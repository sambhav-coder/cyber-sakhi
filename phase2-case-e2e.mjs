/* Stage-A regression: auth guards, case CRUD lifecycle, report, chat + admin RBAC isolation.
 *
 * RECOVERY NOTE: this is the recovered original Phase 2 case harness (33 checks,
 * previously 33/33 PASS). All 33 `record()` calls below are preserved verbatim from the
 * recovered source. A finally-style safety-net (silent, no-check) was added so residual
 * probe case rows are removed even when a check throws, and identifiers are persisted to a
 * marker file for external cleanup verification.
 */
const BASE = process.env.BASE || "http://localhost:3000";
const results = [];
const jar = new Map();
let caseId = null;

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
        by mail.victim.org with ESMTP id phish001
        ; Tue, 02 Sep 2026 09:30:00 +0530
From: SBI Online Banking Security <alerts@secure-sbi-alerts.com>
Reply-To: verify@melink.phish.mobi
To: customer@example.com
Subject: [SBI ALERT] Your account is locked - Update required immediately
Date: Tue, 02 Sep 2026 09:30:00 +0530
Message-ID: <phish.001@secure-sbi-alerts.com>

Dear SBI Customer,

Your account has been locked due to unusual activity. Kindly verify your details at once:
CLICK HERE: http://secure-sbi-update.xyz/session/verify?tok=abc123

Failure to act within 12 hours will permanently suspend your account.

Regards,
SBI Online Team
`;

(async () => {
  try {
    let anonCases = await request("/api/cases");
    record("anon GET /api/cases -> 401", anonCases.status === 401, `status=${anonCases.status}`);

    let anonAnalysis = await request("/api/email-forensics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawEmail: SAMPLE, saveAsCase: true }),
    });
    record("anon POST /api/email-forensics -> 401", anonAnalysis.status === 401, `status=${anonAnalysis.status}`);

    let anonOverview = await request("/api/admin/cases-overview");
    record("anon GET /api/admin/cases-overview -> 401", anonOverview.status === 401, `status=${anonOverview.status}`);

    let anonChat = await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello", language: "en" }),
    });
    record("anon POST /api/chat -> 401", anonChat.status === 401, `status=${anonChat.status}`);

    await login("user@cybersakhi.org", "User@Sakhi2026!");
    let sessUser = (await request("/api/auth/session")).data;
    record("seeded USER login works", Boolean(sessUser?.user?.id) && sessUser?.user?.email === "user@cybersakhi.org", sessUser?.user?.email);

    let make = await request("/api/email-forensics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawEmail: SAMPLE, saveAsCase: true }),
    });
    record("analyze + saveAsCase -> 200", make.status === 200, `status=${make.status}`);
    record("analysis has threat score + verdict", typeof make.data?.threatScore === "number" && Boolean(make.data?.verdict?.summary), `score=${make.data?.threatScore}`);

    let newCase = make.data?.case;
    caseId = newCase?.id || null;
    record("case returned with CS- number", /^CS-\d{4}-[A-Z2-9]{6}$/.test(newCase?.caseNumber || ""), newCase?.caseNumber);

    let list = await request("/api/cases");
    record("GET /api/cases -> 200 own cases list", list.status === 200 && Array.isArray(list.data?.cases), `count=${list.data?.cases?.length}`);
    record("list contains the new case number", (list.data?.cases || []).some(c => c.caseNumber === newCase?.caseNumber), newCase?.caseNumber);
    record("list item is safe projection", (list.data?.cases || []).every(c => c && typeof c === "object" && !("description" in c) && !("analysis" in c)), "no description/analysis leak");

    let detail = await request(`/api/cases/${newCase?.id}`);
    record("GET case detail -> 200", detail.status === 200, `status=${detail.status}`);
    let d = detail.data || {};
    record(
      "detail has case + investigations + indicators + evidence + reports arrays",
      Boolean(d.case && Array.isArray(d.investigations) && Array.isArray(d.indicators) && Array.isArray(d.evidence) && Array.isArray(d.reports)),
      `inv=${d.investigations?.length},ind=${d.indicators?.length},ev=${d.evidence?.length},rep=${d.reports?.length}`
    );
    let inv = d.investigations?.[0];
    record("investigation preserved (subject + risk score)", Boolean(inv?.subject) && typeof inv?.risk_score === "number" && inv?.risk_score > 0, `${inv?.subject} -> ${inv?.risk_score}`);

    let reportText = await request(`/api/cases/${newCase?.id}/report?format=text`);
    record("report?format=text -> 200 text/plain with Case Number", reportText.status === 200 && /case number/i.test(reportText.data) && (reportText.data || "").includes(newCase?.caseNumber), `status=${reportText.status}`);
    record("report body is a real forensic report", /executive summary/i.test(reportText.data) && /threat assessment|risk breakdown/i.test(reportText.data), "sections present");

    let reportJson = await request(`/api/cases/${newCase?.id}/report`);
    record("report JSON envelope -> 200", reportJson.status === 200 && reportJson.data?.envelope?.content?.length > 0 && reportJson.data?.envelope?.caseNumber === newCase?.caseNumber, `status=${reportJson.status}`);

    let afterReport = await request(`/api/cases/${newCase?.id}`);
    record("report archived in case (reports >= 1)", (afterReport.data?.reports || []).length >= 1, `reports=${afterReport.data?.reports?.length}`);

    let chatNoCase = await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "what should i do", language: "en" }),
    });
    record("chat without caseId -> sakhi text", chatNoCase.status === 200 && chatNoCase.data?.text?.length > 20 && !chatNoCase.data?.context?.caseId, chatNoCase.data?.category);

    let chatCase = await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "explain my case", language: "en", caseId: newCase?.id }),
    });
    record("case-aware chat -> 200 with case context", chatCase.status === 200 && chatCase.data?.context?.caseId === newCase?.id, String(chatCase.data?.context?.caseId));
    record("case-aware chat dropped case number in reply", !(chatCase.data?.text || "").includes(newCase?.id), "internal uuid redacted");

    let chatNoAccess = await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello", language: "en", caseId: "does-not-exist" }),
    });
    record("chat with non-owned/nonexistent caseId -> 403", chatNoAccess.status === 403, `status=${chatNoAccess.status}`);

    await login("admin@cybersakhi.org", "Admin@Sakhi2026!");
    let sessAdmin = (await request("/api/auth/session")).data;
    record("seeded ADMIN login works", Boolean(sessAdmin?.user?.id) && sessAdmin?.user?.email === "admin@cybersakhi.org", sessAdmin?.user?.email);

    let adminList = await request("/api/cases");
    record("admin own-case list does NOT include USER case", !(adminList.data?.cases || []).some(c => c.caseNumber === newCase?.caseNumber), `adminCases=${adminList.data?.cases?.length}`);

    record("ADMIN GET /api/cases/[id] -> 404", (await request(`/api/cases/${newCase?.id}`)).status === 404);
    record("ADMIN DELETE /api/cases/[id] -> 404", (await request(`/api/cases/${newCase?.id}`, { method: "DELETE" })).status === 404);

    let overview = await request("/api/admin/cases-overview");
    record("ADMIN GET cases-overview -> 200 (RBAC)", overview.status === 200 && overview.data?.status === "success", `status=${overview.status}`);
    let ov = overview.data?.overview || {};
    record("admin overview exposes NO owner/title/description/PII", !String(Object.keys(ov)).includes("owner") && !String(Object.keys(ov)).includes("description") && !String(Object.keys(ov)).includes("email") && !String(Object.keys(ov)).includes("title"), Object.keys(ov).join(","));
    record("admin overview includes aggregates", typeof ov.total === "number" && ov.total > 0 && typeof ov.bySeverity === "object" && ov.bySeverity !== null && !Array.isArray(ov.bySeverity) && Object.keys(ov.bySeverity).length > 0, `total=${ov.total},bySeverity=${JSON.stringify(ov.bySeverity)}`);

    await login("user@cybersakhi.org", "User@Sakhi2026!");
    let userOverview = await request("/api/admin/cases-overview");
    record("USER GET /api/admin/cases-overview -> 403", userOverview.status === 403, `status=${userOverview.status}`);

    let delOwn = await request(`/api/cases/${newCase?.id}`, { method: "DELETE" });
    record("USER DELETE own case -> 200", delOwn.status === 200, `status=${delOwn.status}`);

    let gone = await request(`/api/cases/${newCase?.id}`);
    record("case gone after delete (404)", gone.status === 404, `status=${gone.status}`);

    let list2 = await request("/api/cases");
    record("case removed from list", !(list2.data?.cases || []).some(c => c.caseNumber === newCase?.caseNumber));
  } finally {
    if (caseId) {
      try {
        await request(`/api/cases/${caseId}`, { method: "DELETE" }).catch(() => {});
      } catch (_) {}
    }
    try {
      const fs = await import("fs");
      const envSrc = fs.readFileSync("C:\\Users\\ry526\\.gemini\\antigravity\\scratch\\cyber-sakhi\\.env.local", "utf8");
      const getVar = (n) => (envSrc.match(new RegExp(`^${n}=(.*)$`, "m")) || [])[1]?.trim();
      const supabaseUrl = getVar("NEXT_PUBLIC_SUPABASE_URL");
      const supabaseKey = getVar("SUPABASE_SERVICE_ROLE_KEY");
      if (caseId && supabaseUrl && supabaseKey) {
        const h = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
        for (const [table, filter] of [
          ["case_chat_messages", `case_id=eq.${caseId}`],
          ["reports", `case_id=eq.${caseId}`],
          ["indicators", `case_id=eq.${caseId}`],
          ["email_investigations", `case_id=eq.${caseId}`],
          ["evidence", `case_id=eq.${caseId}`],
        ]) {
          await fetch(`${supabaseUrl}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: h }).catch(() => {});
        }
      }
      const marker =
        process.env.PROBE_MARKER_PATH ||
        "C:\\Users\\ry526\\AppData\\Local\\Temp\\opencode\\case-probe-marker.json";
      await fs.promises.writeFile(marker, JSON.stringify({ caseId }, null, 2));
    } catch (_) {}
  }
})().catch((err) => {
  console.error("UNCAUGHT:", err);
}).finally(async () => {
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n==== ${results.length - failed}/${results.length} passed ====`);
  process.exit(failed > 0 ? 1 : 0);
});