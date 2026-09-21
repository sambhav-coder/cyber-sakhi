/**
 * Business Email Compromise (BEC) detection engine.
 *
 * BEC is a *behavioral* attack: the email looks familiar, pushes urgency and
 * secrecy, and steers the victim toward money movement, credentials or gift
 * cards — usually without malicious links. This engine scores those
 * behavioral patterns directly.
 *
 * Honesty constraints:
 *   * Cyber Sakhi has no corporate directory, so we cannot prove "this CEO
 *     really is your CEO". `analyzeBec` therefore detects *role-impersonation
 *     and finance-fraud behavior*, and every report card says so. Real-world
 *     BEC detection requires the org's directory and domain policy, which is
 *     out of scope for a candidate-emails-only tool.
 *   * Scores and confidences are transparent DERIVATIONS of matched rule
 *     weights (see BEC_RULES), never fabricated numbers.
 *
 * Rule weights come from the current threat-model common in India/APAC BEC
 * cases (finance + urgency + secrecy + role). The weights are heuristics and
 * are tuned toward precision: a single "urgent" word never triggers BEC on
 * its own — it needs finance/secrecy context.
 */

export interface BecPattern {
  id: string;
  name: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  weight: number; // 0..100 additive toward the BEC score
  evidence: string; // matched snippet(s)
}

export interface BecContext {
  /** Raw From header ("Display <a@b>") for display-name analysis. */
  displayFrom?: string;
  fromDomain?: string;
  replyToDomain?: string;
  /** Lookalike domains flagged by the spoofing analysis, e.g. ["paypal.com", ...]. */
  lookalikeDomains?: string[];
}

export interface BecAnalysis {
  detected: boolean;
  /** 0..100 — transparent derivation of matched rule weights. */
  score: number;
  /** 0..1 — derived from rule coverage, see notes. */
  confidence: number;
  patterns: BecPattern[];
  /** Narrative sentence(s) for the report. */
  summary: string;
  caveat: string;
}

const EXEC_ROLES =
  /\b(ceo|chief executive|cfp|chro|coo|cto|cfo|director|managing director|board member|founder|company president|office of the (ceo|president)|head of (finance|hr|accounts|payroll|operations)|your boss|your manager|general manager|the owner|the chairman|chairman)\b/i;

const SECRECY_URGENCY = [
  { re: /\b(urgent|asap|immediately|right away|as soon as possible|quickly|now)\b/i, w: 20 },
  { re: /\b(confidential|do not share|do not disclose|keep (this|it) (to|between) (yourself|us)|just between (us|you and me)|private and (personal|confidential)|secret)\b/i, w: 30 },
];

const FINANCE_MOVES = [
  /\b(wire|wire transfer|bank transfer|direct deposit|ach|swift|iban)\b/i,
  /\b(bank (account|details|statement|balance)|beneficiary|routing number|account number|sort code)\b/i,
  /\b(invoice|payment (of|for)|payroll|salary|reimburs|refund|outstanding balance|settlement)\b/i,
  /\b(gift card|giftcard|itunes card|steam wallet|amazon gift|google play card)\b/i,
  /\b(funds|money transfer|advance (fee|payment)|transaction (of|for))\b/i,
];

const REQUEST_LANGUAGE = [
  /\b(please (send|transfer|pay|process|forward|deposit|release))\b/i,
  /\b(confirm (the|payment|transfer|amount)|provide (me|us) (the|your)? (bank|payment|w-2|payroll|credentials|login|password))\b/i,
  /\b(change (the|our)? (payment|bank|account) details|new (bank|payment) (details|account)|updated (bank|payment) (details|account))\b/i,
  /\b(purchase (some|those)? gift cards|buy gift cards|buy (itunes|steam|amazon) cards)\b/i,
];

const OFFLINE_CLAIM = [
  /\b(out of office|off the grid|in a meeting|in meetings|on a call|on a plane|no phone|can'?t (talk|take calls|be reached)|unavailable (by|on) (phone|call)|travelling and (unreachable|can'?t reach))\b/i,
  /\b(do not call me|don'?t call me|don'?t reach me|avoid calling)\b/i,
];

const CREDENTIAL_SOLICIT = [
  /\b(otp|one[- ]?time password|password|login credentials|w-2|payroll (data|file|info)|salary details|access to|sign in details)\b/i,
];

const IMPERSONATION_BRANDS = [
  "paypal", "ebay", "amazon", "apple", "microsoft", "google", "netflix",
  "linkedin", "facebook", "deloitte", "kn1ght", "kpmg", "accenture",
  "tcs", "infosys", "wipro", "hdfc", "icici", "sbi", "state bank of india",
];

function snippet(source: string, re: RegExp, max = 140): string | null {
  const m = (re.global ? new RegExp(re.source, re.flags.replace("g", "")) : re).exec(source);
  if (!m) return null;
  const start = Math.max(0, m.index - 40);
  const raw = source.slice(start, m.index + m[0].length + 60);
  return raw.length > max ? raw.slice(0, max) + "…" : raw;
}

function hasAny(reArr: RegExp[], text: string): boolean {
  return reArr.some((re) => re.test(text));
}

export function analyzeBec(
  subject: string | null | undefined,
  body: string | null | undefined,
  ctx: BecContext = {}
): BecAnalysis {
  const s = String(subject ?? "");
  const b = String(body ?? "");
  const text = `${s}\n\n${b}`.trim();

  const patterns: BecPattern[] = [];
  const seen = new Set<string>();

  const add = (p: BecPattern) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    patterns.push(p);
  };

  // 1. Role/executive impersonation — meaningful when combined with finance
  //    or secrecy language; we still record it standalone (LOW) because a
  //    message that only mentions an executive role is usually harmless.
  const roleMatch = (text.match(EXEC_ROLES) || []).slice(0, 2);
  if (roleMatch.length > 0) {
    add({
      id: "bec_role_impersonation",
      name: "Executive / role impersonation language",
      severity: "MEDIUM",
      weight: 18,
      evidence: roleMatch.join(", "),
    });
  }

  // 2. Urgency + secrecy
  let urgencyWeight = 0;
  const urgencyHits: string[] = [];
  for (const rule of SECRECY_URGENCY) {
    const m = text.match(rule.re);
    if (m) {
      urgencyWeight += rule.w;
      urgencyHits.push(m[0]);
    }
  }
  if (urgencyWeight > 0) {
    const isSecrecy = urgencyHits.some((h) => /confidential|do not (share|disclose)|keep (this|it) (to|between)|between (us|you)/i.test(h));
    add({
      id: "bec_urgency_secrecy",
      name: isSecrecy ? "Urgent + secrecy framing" : "Urgency framing",
      severity: isSecrecy ? "HIGH" : "MEDIUM",
      weight: urgencyWeight,
      evidence: urgencyHits.join(", "),
    });
  }

  // 3. Finance / money-movement language
  const financeHits = FINANCE_MOVES.map((re) => {
    const m = text.match(re);
    return m ? m[0] : null;
  }).filter(Boolean) as string[];
  if (financeHits.length > 0) {
    add({
      id: "bec_finance_language",
      name: "Financial movement language",
      severity: financeHits.length >= 2 ? "HIGH" : "MEDIUM",
      weight: 14 + Math.min(financeHits.length, 4) * 6,
      evidence: [...new Set(financeHits)].slice(0, 4).join(", "),
    });
  }

  // 4. Direct request to move money / change payment details
  if (hasAny(REQUEST_LANGUAGE, text)) {
    const reqMatch = REQUEST_LANGUAGE.map((re) => text.match(re)).find((m) => m && m[0]);
    const req = reqMatch ? reqMatch[0] : undefined;
    add({
      id: "bec_money_request",
      name: "Direct payment / details-change request",
      severity: "CRITICAL",
      weight: 38,
      evidence: snippet(text, new RegExp(String(req).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) ?? req ?? "",
    });
  }

  // 5. "Off the grid" excuse (can't talk on phone)
  if (hasAny(OFFLINE_CLAIM, text)) {
    add({
      id: "bec_offline_excuse",
      name: "Claims unreachable (offline excuse)",
      severity: "HIGH",
      weight: 22,
      evidence: (text.match(OFFLINE_CLAIM[0]) || text.match(OFFLINE_CLAIM[1]) || [""])[0],
    });
  }

  // 6. Credential / W-2 / OTP solicitation
  if (hasAny(CREDENTIAL_SOLICIT, text)) {
    const c = text.match(CREDENTIAL_SOLICIT[0]);
    add({
      id: "bec_credential_solicitation",
      name: "Credentials / W-2 / OTP required",
      severity: "CRITICAL",
      weight: 35,
      evidence: c ? c[0] : "credential-solicitation pattern",
    });
  }

  // 7. Reply-To domain differs from From domain (solicits into attacker's box)
  const fromDomain = ctx.fromDomain;
  const replyDomain = ctx.replyToDomain;
  if (fromDomain && replyDomain && fromDomain !== replyDomain) {
    add({
      id: "bec_replyto_mismatch",
      name: `Reply-To (${replyDomain}) differs from From (${fromDomain})`,
      severity: "HIGH",
      weight: 24,
      evidence: `From ${fromDomain} -> Reply-To ${replyDomain}`,
    });
  }

  // 8. Lookalike / known impersonated brand present in context
  if (ctx.lookalikeDomains && ctx.lookalikeDomains.length > 0) {
    add({
      id: "bec_lookalike_domain",
      name: "Lookalike domain(s) identified",
      severity: "HIGH",
      weight: 20,
      evidence: ctx.lookalikeDomains.slice(0, 4).join(", "),
    });
  } else if (IMPERSONATION_BRANDS.some((brand) => new RegExp(`\\b${brand}\\b`, "i").test(text))) {
    const hit = IMPERSONATION_BRANDS.filter((brand) =>
      new RegExp(`\\b${brand}\\b`, "i").test(text)
    ).slice(0, 3);
    add({
      id: "bec_brand_mention",
      name: "Brand impersonation language",
      severity: "MEDIUM",
      weight: 10,
      evidence: hit.join(", "),
    });
  }

  // Score = capped weighted sum of matched patterns (transparent derivation).
  // Confidence = coverage heuristic: how many distinct rule families fired.
  const total = Math.min(100, Math.round(patterns.reduce((acc, p) => acc + p.weight, 0)));
  const families = new Set(patterns.map((p) => p.id.split("_")[1])).size;
  const confidence = Math.min(
    1,
    Math.round((0.4 * (families / 4) + 0.6 * (total / 100)) * 100) / 100
  );

  const detected = total >= 40; // needs at least urgency/finance + a decisive pattern

  const caveat =
    "BEC analysis detects *behavioral patterns* (finance + secrecy + urgency + role " +
    "language). Cyber Sakhi has no corporate directory, so it cannot confirm whether " +
    "the sender truly is who they claim to be — that confirmation requires the " +
    "organisation's directory and domain policy.";

  const summary = detected
    ? `Behavioral profile consistent with Business Email Compromise: ${patterns
        .map((p) => p.name)
        .slice(0, 4)
        .join("; ")}.`
    : total > 0
    ? "Some BEC-style language present, but not enough decisive patterns to call it BEC."
    : "No Business Email Compromise behavioural patterns detected.";

  return { detected, score: total, confidence, patterns, summary, caveat };
}