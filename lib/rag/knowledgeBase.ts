/**
 * Cyber-Sakhi RAG knowledge base — curated, verified cybersecurity reference
 * documents.
 *
 * Every record is PUBLIC, non-user-specific reference material (no case data,
 * no PII, no secrets), so retrieval can never leak one user's data to
 * another: authorization is inherent — the KB contains nothing per-user.
 * User case data travels only through the ownership-checked case/email/
 * evidence paths in `app/api/chat/route.ts`, never through this module.
 *
 * Guidance bodies use only verified public facts (helplines 112 / 1091 /
 * 1930 / 14416, cybercrime.gov.in). Bodies are concise on purpose: they are
 * grounding context, not full articles. English source text; the model
 * renders the answer in the turn language.
 */

export interface RagSource {
  label: string;
  ref: string;
}

export interface RagDocument {
  /** Stable chunk identifier, e.g. "kb-phishing-01". */
  id: string;
  /** Parent document identifier for multi-chunk sources. */
  parentId: string;
  title: string;
  topic: string;
  category:
    | "phishing"
    | "fraud"
    | "harassment"
    | "account-security"
    | "malware"
    | "evidence"
    | "reporting"
    | "hygiene";
  body: string;
  source: RagSource;
  /** Publication/version marker for the curated snapshot. */
  version: string;
  trust: "verified";
  accessScope: "public";
}

const V = "kb-2026.09";

export const SAKHI_KNOWLEDGE_BASE: RagDocument[] = [
  {
    id: "kb-phishing-01",
    parentId: "kb-phishing",
    title: "Recognising phishing emails and messages",
    topic: "phishing",
    category: "phishing",
    body: "Phishing messages create urgency (account blocked, KYC expiring, prize won) and push you to click a link, open an attachment, or share an OTP. Check the real sender address (not just the display name), hover over links to see the true domain, and look for mismatched branding, spelling errors, and threats. Never enter passwords or OTPs from a link someone sent you — open the official app or website yourself instead.",
    source: { label: "Sakhi safety guide: phishing basics", ref: "kb:phishing-01" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-phishing-02",
    parentId: "kb-phishing",
    title: "Email authentication: SPF, DKIM and DMARC",
    topic: "email authentication",
    category: "phishing",
    body: "SPF lists which mail servers may send for a domain, DKIM adds a cryptographic signature proving the message was not altered, and DMARC tells receivers what to do when those checks fail. In email headers, look for Authentication-Results lines showing spf=pass, dkim=pass and dmarc=pass. A bank or company email that fails these checks, or comes from a lookalike domain (rn instead of m, extra hyphens), is a strong spoofing signal.",
    source: { label: "Sakhi safety guide: email authentication", ref: "kb:phishing-02" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-phishing-03",
    parentId: "kb-phishing",
    title: "Spoofed senders and lookalike domains",
    topic: "spoofing",
    category: "phishing",
    body: "Attackers spoof the display name (e.g. showing your bank's name) while the actual address is unrelated, or register lookalike domains with swapped letters, added words like -secure or -verify, or a different ending (.info instead of .in). Always read the full address after the @, compare it with the official domain you know, and treat Reply-To addresses pointing elsewhere as a red flag.",
    source: { label: "Sakhi safety guide: spoofed senders", ref: "kb:phishing-03" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-fraud-01",
    parentId: "kb-fraud",
    title: "OTP and KYC fraud calls",
    topic: "otp fraud",
    category: "fraud",
    body: "No bank, payment app, or government office ever asks for your OTP, PIN, CVV, or full card number on a call or link. Common scripts: SIM/KYC expiry threats, fake customer-care numbers from search results, and screen-sharing apps the caller asks you to install. If money has moved, call the national cyber fraud helpline 1930 immediately and report at cybercrime.gov.in — speed matters for freezing the transaction.",
    source: { label: "Sakhi safety guide: OTP and KYC fraud", ref: "kb:fraud-01" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-fraud-02",
    parentId: "kb-fraud",
    title: "UPI and QR-code payment fraud",
    topic: "upi fraud",
    category: "fraud",
    body: "On UPI you never enter a PIN to RECEIVE money — any request asking for your PIN to accept a payment is fraud. Scammers send collect requests, fake QR codes, or overpayment-refund stories. Decline unexpected collect requests, verify the payee name before entering your PIN, and never approve a request just because the caller says it is a refund or verification step.",
    source: { label: "Sakhi safety guide: UPI fraud", ref: "kb:fraud-02" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-fraud-03",
    parentId: "kb-fraud",
    title: "Digital arrest and impersonation scams",
    topic: "digital arrest",
    category: "fraud",
    body: "There is no such thing as a digital arrest in Indian law — no police officer, CBI agent, or judge will detain you over a video call or demand money to close a case. These scams use fear, fake uniforms and forged documents, and forbid you from hanging up. Hang up, do not pay, and report the number on 1930 and cybercrime.gov.in.",
    source: { label: "Sakhi safety guide: digital-arrest scams", ref: "kb:fraud-03" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-harass-01",
    parentId: "kb-harass",
    title: "Online stalking and harassment: first steps",
    topic: "stalking",
    category: "harassment",
    body: "If someone stalks or harasses you online: block and report the accounts, tighten privacy settings so strangers cannot see your posts or contact details, and tell someone you trust. Save evidence before blocking where it is safe to do so (screenshots with dates, profile links, message exports). For immediate danger call 112; the women helpline is 1091.",
    source: { label: "Sakhi safety guide: stalking response", ref: "kb:harass-01" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-harass-02",
    parentId: "kb-harass",
    title: "Blackmail and image-abuse response",
    topic: "blackmail",
    category: "harassment",
    body: "If someone blackmails you with private photos or videos: do not pay — payment almost never ends it and marks you for repeat demands. Stop engaging, preserve the threats as evidence, block the accounts, and report quickly on 1930 (financial extortion) or cybercrime.gov.in, plus 1091 for support. You are not at fault, and quick reporting gives the best chance of stopping spread.",
    source: { label: "Sakhi safety guide: blackmail response", ref: "kb:harass-02" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-account-01",
    parentId: "kb-account",
    title: "Hacked account recovery checklist",
    topic: "account recovery",
    category: "account-security",
    body: "If an account is compromised: use the platform's official account-recovery flow, change the password from a clean device, sign out all other sessions, and turn on two-factor authentication (authenticator app preferred over SMS). Check recovery email and phone number for changes the attacker made, warn contacts about messages sent from your account, and scan your device for unknown apps.",
    source: { label: "Sakhi safety guide: account recovery", ref: "kb:account-01" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-account-02",
    parentId: "kb-account",
    title: "Passwords and two-factor authentication",
    topic: "passwords 2fa",
    category: "account-security",
    body: "Use a long unique password per important account (a password manager helps), never reuse your email password elsewhere, and enable two-factor authentication everywhere it is offered — authenticator apps or security keys beat SMS codes. Treat any login alert you did not trigger as a prompt to change that password immediately and review active sessions.",
    source: { label: "Sakhi safety guide: passwords and 2FA", ref: "kb:account-02" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-malware-01",
    parentId: "kb-malware",
    title: "Malicious attachments and links",
    topic: "malware",
    category: "malware",
    body: "Treat unexpected attachments with suspicion, especially archives, Office documents asking to enable macros, APK files, and screen-sharing or remote-access apps a stranger asked you to install. Do not enable macros or grant accessibility permissions on request. If you opened something suspicious, disconnect from the internet, run a reputable antivirus scan, change important passwords from another device, and watch bank and email alerts closely.",
    source: { label: "Sakhi safety guide: malicious attachments", ref: "kb:malware-01" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-evidence-01",
    parentId: "kb-evidence",
    title: "Preserving digital evidence",
    topic: "evidence preservation",
    category: "evidence",
    body: "Good evidence habits: capture full screenshots showing sender, date and URL; export original emails with headers instead of forwarding (forwarding rewrites headers); keep original files untouched and work on copies; note down the timeline of what happened while it is fresh. Do not edit, crop out context, or delete the originals — investigators need the unaltered source.",
    source: { label: "Sakhi safety guide: evidence preservation", ref: "kb:evidence-01" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-evidence-02",
    parentId: "kb-evidence",
    title: "Chain of custody basics",
    topic: "chain of custody",
    category: "evidence",
    body: "Chain of custody means being able to show who handled each piece of evidence and when, from collection to presentation. Record who collected an item, the date and time, where it is stored, and every transfer. Cyber Sakhi's evidence locker hashes items (SHA-256) so any later change is detectable — that is why items are locked before they are referenced in a case.",
    source: { label: "Sakhi safety guide: chain of custody", ref: "kb:evidence-02" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-report-01",
    parentId: "kb-report",
    title: "Reporting cybercrime in India",
    topic: "reporting",
    category: "reporting",
    body: "Report cybercrime at cybercrime.gov.in or the helpline 1930 for fraud (call fast when money moved), 112 for emergencies, and 1091 for crimes against women. Keep your evidence ready: screenshots, transaction IDs, phone numbers, links, and a short timeline. Filing the report yourself preserves your control; Sakhi can explain the steps but never files on your behalf.",
    source: { label: "Sakhi safety guide: reporting cybercrime", ref: "kb:report-01" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
  {
    id: "kb-hygiene-01",
    parentId: "kb-hygiene",
    title: "Everyday cyber hygiene",
    topic: "cyber hygiene",
    category: "hygiene",
    body: "Everyday habits that prevent most incidents: update your phone and apps promptly, install apps only from official stores, review app permissions yearly, back up photos and documents, use screen lock and device encryption, avoid free USB chargers and unknown Wi-Fi for banking, and pause before acting on any urgent money message — verify through a separate, trusted channel first.",
    source: { label: "Sakhi safety guide: everyday hygiene", ref: "kb:hygiene-01" },
    version: V,
    trust: "verified",
    accessScope: "public",
  },
];
