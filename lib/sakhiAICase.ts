import type { ChatMessage } from "./sakhiAI";

export interface CaseContextForAi {
  caseNumber: string;
  threatLevel: string;
  threatScore: number;
  spoofingDetected: boolean;
  senderDomain?: string;
  findings: string[];
  indicatorCount: number;
  suspiciousUrlCount: number;
  financialHarm?: boolean;
  sharedCredential?: boolean;
  interactedWithLink?: boolean;
  escalated?: boolean;
  verifiedBusiness?: boolean;
}

export interface EscalationDecision {
  recommendation:
    | "cybercrimePortal"
    | "policeFir"
    | "1930Financial"
    | "selfResolution"
    | "uncertain";
  level: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  reasons: string[];
  neverAutoReport: true;
}

/**
 * Stage J decision framework.
 *
 * Escalation is a recommendation only. Cyber Sakhi NEVER auto-reports or
 * files on behalf of the user; every escalation action is user-initiated.
 * A cybercell report is recommended only when one of the harm/credential/
 * interaction conditions is met (or the user explicitly asks for guidance).
 */
export function decideEscalation(ctx: CaseContextForAi): EscalationDecision {
  const reasons: string[] = [];
  let recommendation: EscalationDecision["recommendation"] = "selfResolution";
  let level: EscalationDecision["level"] = "NONE";

  const financialHarm = ctx.financialHarm === true;
  const sharedCredential = ctx.sharedCredential === true;
  const interacted = ctx.interactedWithLink === true;
  const highThreat =
    ctx.threatScore >= 60 || ["HIGH", "CRITICAL"].includes(String(ctx.threatLevel || "").toUpperCase());
  const spoofed = ctx.spoofingDetected === true;

  if (financialHarm) {
    reasons.push("Money was transferred or financial harm is possible — time-sensitive.");
    recommendation = "1930Financial";
    level = "HIGH";
  } else if (
    sharedCredential ||
    (interacted && highThreat) ||
    (interacted && spoofed)
  ) {
    if (sharedCredential) {
      reasons.push("Credentials/OTP may have been shared with the attacker.");
    }
    if (interacted) {
      reasons.push("The user interacted with a link/attachment from a suspect email.");
      if (spoofed) reasons.push("The sender domain was flagged as spoofed.");
      if (highThreat) reasons.push("Email scored high on the threat model.");
    }
    if (reasons.length === 0) {
      reasons.push("A reportable exposure condition was detected.");
    }
    recommendation = "cybercrimePortal";
    level = "HIGH";
  } else if (spoofed || highThreat) {
    reasons.push(spoofed ? "Sender impersonation detected." : "Threat score is elevated.");
    reasons.push("Recommended to report to the cybercrime portal for the record.");
    recommendation = "cybercrimePortal";
    level = "MEDIUM";
  } else {
    reasons.push("No direct harm, credential disclosure, or link interaction detected.");
    recommendation = "selfResolution";
    level = "LOW";
  }

  if (ctx.escalated === true) {
    reasons.push("Case has already been marked escalated — keep reporting reference at hand.");
  }

  if (ctx.verifiedBusiness === true) {
    reasons.push("Sender matches a verified business context; treat red flags with extra care before acting.");
  }

  return {
    recommendation,
    level,
    reasons,
    neverAutoReport: true,
  };
}

function escalationParagraph(
  decision: EscalationDecision,
  lang: "en" | "hi",
  ctx: CaseContextForAi
): string {
  const isHi = lang === "hi";
  const intro = isHi
    ? "**आगे बढ़ने का सुझाव (यह केवल मार्गदर्शन है — Cyber Sakhi आपकी ओर से कभी स्वतः शिकायत नहीं दर्ज करता):**"
    : "**Suggested next step (guidance only — Cyber Sakhi never files a complaint on your behalf):**";

  if (decision.recommendation === "1930Financial") {
    return (
      intro +
      "\n" +
      (isHi
        ? "1. तुरंत **1930** (साइबर सहायता हेल्पलाइन) पर कॉल करें — वित्तीय धोखाधड़ी में समय ज़रूरी है।\n2. बैंक को तुरंत सूचित करें और लेन-देन रोकने को कहें।\n3. इस केस का नंबर और फ़ोरेंसिक रिपोर्ट साथ रखें, फिर cybercrime.gov.in पर शिकायत दर्ज करें।"
        : "1. Call **1930** (National Cyber Fraud Helpline) immediately — in financial fraud, time is critical.\n2. Notify your bank at once and ask to block the transaction.\n3. Keep this Case Number and the forensic report, then file on cybercrime.gov.in.")
    );
  }

  if (decision.recommendation === "cybercrimePortal") {
    return (
      intro +
      "\n" +
(isHi
        ? "1. सबूत और फ़ोरेंसिक रिपोर्ट Evidence Locker में सुरक्षित रखें।\n2. **cybercrime.gov.in** पर शिकायत दर्ज करें — केस नंबर **" +
          ctx.caseNumber +
          "** उद्धृत करें।\n3. यदि पैसा/ओटीपी/कार्ड शामिल है, 1930 पर कॉल करें। 4. ज़रूरत पड़े तो स्थानीय साइबर सेल पुलिस स्टेशन में FIR दर्ज करें."
        : "1. Preserve the evidence and forensic report in the Evidence Locker.\n2. File a complaint on **cybercrime.gov.in** and quote this Case Number.\n3. If money/OTP/card was involved, call 1930 first. 4. For an FIR, visit your local police cyber cell.")
    );
  }

  if (decision.recommendation === "policeFir") {
    return (
      intro +
      "\n" +
      (isHi
        ? "1. अपने सबूत और रिपोर्ट संभाल कर रखें। 2. निकटतम पुलिस स्टेशन/साइबर सेल में **FIR** दर्ज करें। 3. cybercrime.gov.in पर भी शिकायत की एक प्रति रखें।"
        : "1. Keep your evidence and report ready. 2. File an **FIR** at your nearest police station / cyber cell. 3. Also keep a copy of the cybercrime.gov.in complaint.")
    );
  }

  return (
    intro +
    "\n" +
    (isHi
      ? "वर्तमान में आपातकालीन शिकायत की स्थिति नहीं दिखती। फिर भी कदम उठाएँ: सबूत सुरक्षित करें, संदिग्ध लिंक पर क्लिक न करें, और आगे कोई धोखाधड़ी हो तो 1930/cybercrime.gov.in पर रिपोर्ट करें।"
      : "No immediate-report condition is present based on what we see. Still: preserve evidence, avoid clicking anything suspicious, and report to 1930 / cybercrime.gov.in if any further fraud occurs.")
  );
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildMessage(
  text: string,
  extra: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id: "sakhi_case_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    sender: "sakhi",
    text,
    timestamp: nowLabel(),
    ...extra,
  };
}

function caseSummaryText(ctx: CaseContextForAi, lang: "en" | "hi"): string {
  const base =
    lang === "hi"
      ? `📁 **केस ${ctx.caseNumber}** — खतरा स्तर: ${ctx.threatLevel.toUpperCase()} (${
          ctx.threatScore
        }/100), स्पूफिंग: ${ctx.spoofingDetected ? "पाई गई" : "नहीं पाई गई"}।`
      : `📁 **Case ${ctx.caseNumber}** — Threat level ${ctx.threatLevel.toUpperCase()} (score ${
          ctx.threatScore
        }/100), spoofing ${ctx.spoofingDetected ? "detected" : "not detected"}.`;

  return base;
}

function severityLabel(ctx: CaseContextForAi, lang: "en" | "hi"): string {
  const level = String(ctx.threatLevel || "").toUpperCase();
  if (lang === "hi") {
    if (level === "CRITICAL" || level === "HIGH") return "बहुत खतरनाक है — गंभीरता उच्च";
    if (level === "MEDIUM") return "मध्यम जोखिम है";
    if (level === "LOW") return "कम जोखिम है";
    return "स्थिति स्पष्ट नहीं है";
  }
  if (level === "CRITICAL" || level === "HIGH") return "serious — high severity";
  if (level === "MEDIUM") return "moderate risk";
  if (level === "LOW") return "low risk";
  return "unclear";
}

/**
 * Stage I: the 5-question explanation a scared user actually needs —
 * what happened / why it matters / how dangerous / what to do / what not to do.
 */
function explainCaseSimple(ctx: CaseContextForAi, lang: "en" | "hi"): string {
  const isHi = lang === "hi";

  const happened = isHi
    ? ctx.spoofingDetected
      ? `ईमेल ${ctx.senderDomain ? `"${ctx.senderDomain}"` : "किसी संदिग्ध पते"} से आया है और यह दिखाता है कि यह किसी भरोसेमंद कंपनी से आया है — ऐसा नहीं है।`
      : `ईमेल का विश्लेषण करने पर ${ctx.indicatorCount} संकेतक और ${ctx.suspiciousUrlCount} संदिग्ध लिंक मिले।`
    : ctx.spoofingDetected
    ? `This email claims to be from ${ctx.senderDomain ? "the domain \"" + ctx.senderDomain + "\"" : "a trusted sender"} but the identity shows signs of being forged.`
    : `The email was scanned and found ${ctx.indicatorCount} indicator(s) and ${ctx.suspiciousUrlCount} suspicious link(s).`;

  const whyMatters = isHi
    ? `इससे फ़र्क पड़ता है क्योंकि ऐसे ईमेलs आपसे पासवर्ड, OTP या पैसे लेने के लिए डिज़ाइन किए जाते हैं। अगर आपने कुछ दर्ज किया या एक क्लिक किया भी, तो आगे नुकसान हो सकता है।`
    : `It matters because such emails are engineered to get your password, OTP, or money. Even if you already clicked or typed something, damage control is still possible.`;

  const danger = isHi
    ? `मेरा मूल्यांकन: यह **${severityLabel(ctx, "hi")}** (स्कोर ${ctx.threatScore}/100)। आतंकित होने की ज़रूरत नहीं — अभी कदम उठाएँ, तनाव की नहीं।`
    : `My assessment: this is **${severityLabel(ctx, "en")}** (score ${ctx.threatScore}/100). No need to panic — act calmly, don't stress.`;

  const doThis = isHi
    ? `1) इस ईमेल का जवाब न दें और न ही उसके किसी भी लिंक/अटैचमेंट पर क्लिक करें। 2) सबूत को Evidence Locker में सुरक्षित करें और फ़ोरेंसिक रिपोर्ट डाउनलोड करें (केस ${ctx.caseNumber})। 3) यदि पैसा/ओटीपी/कार्ड शामिल था तो बैंक और 1930 से संपर्क करें।`
    : `1) Don't reply to this email and don't click any of its links/attachments. 2) Preserve it in the Evidence Locker and download the forensic report (case ${ctx.caseNumber}). 3) Contact your bank and dial 1930 if money, OTP, or card details were involved.`;

  const notDo = isHi
    ? `OTP/पासवर्ड किसी को न दें, इस लिंक को न खोलें, और इसे डिलीट न करें — यह आपका सबूत है।`
    : `Never share OTPs or passwords, don't open that link, and don't delete this email — it's your evidence.`;

  const lines = isHi
    ? [
        "🧭 **समझने की कोशिश करते हैं — 5 बातें:**",
        "**1) क्या हुआ?** " + happened,
        "**2) महत्व क्यों है?** " + whyMatters,
        "**3) कितना खतरनाक?** " + danger,
        "**4) क्या करना है?** " + doThis,
        "**5) क्या नहीं करना है?** " + notDo,
        "",
        "टेक्निकल डिटेल चाहिए तो कहें: \"technical details\"।",
      ]
    : [
        "🧭 **Let's understand it together — 5 things:**",
        "**1) What happened?** " + happened,
        "**2) Why does it matter?** " + whyMatters,
        "**3) How dangerous is it?** " + danger,
        "**4) What should I do?** " + doThis,
        "**5) What should I NOT do?** " + notDo,
        "",
        'Say "technical details" if you want the forensic version.',
      ];

  return lines.join("\n");
}

/**
 * Stage K (learned): never invent facts. When there is no case context at
 * all, Sakhi falls back to the generic guidance module and does not claim
 * to have analyzed anything.
 */
export function generateCaseAwareResponse(
  userQuery: string,
  language: "en" | "hi",
  ctx: CaseContextForAi
): ChatMessage {
  const query = userQuery.toLowerCase().trim();

  if (/unsafe|danger|emergency|following me|scared|threatened|sos|bachao|madad/i.test(query)) {
    return buildMessage(
      language === "hi"
        ? `🚨 **पहले अपनी सुरक्षा।** यदि कोई तत्काल खतरा है, तुरंत **112** या **1091** पर कॉल करें, या **VoiceShield SOS** ट्रिगर करें।\n\nइसके बाद अपने इस केस (${ctx.caseNumber}) को सुरक्षित रखें — सबूत न मिटाएँ।`
        : `🚨 **Your physical safety comes first.** If you are in immediate danger, dial **112** or **1091** now, or trigger **VoiceShield SOS**.\n\nAfterwards, preserve this case (${ctx.caseNumber}) — do not delete any evidence.`,
      {
        category: "emergency",
        quickActions: [
          { label: "📞 Dial 112 Emergency", actionType: "DIAL_112" },
          { label: "🔒 Evidence Locker", actionType: "NAVIGATE_LOCKER" },
        ],
      }
    );
  }

  // Stage C2: the 5-question explanation most worried users actually need
  // (what happened / why it matters / how dangerous / what to do / what not).
  if (
    /explain this (email|case)|explain.*\b(email|case)\b|samjha ?o|samjha ?do|batao|bata do|kya matlab|what does this mean|what is this email|understand this/i.test(
      query
    )
  ) {
    return buildMessage(explainCaseSimple(ctx, language), {
      category: "education",
      quickActions: [
        { label: "🧠 Technical details", actionType: "OPEN_REPORT" },
        { label: "🔒 Evidence Locker", actionType: "NAVIGATE_LOCKER" },
      ],
    });
  }

  // Stage I: gradual explainability — the same evidence distilled to the
  // depth the user is comfortable with.
  if (/simpler|simple words|easy|plain|understand|explain like|samjha[o]?|simple language/i.test(query)) {
    const simple =
      language === "hi"
        ? `🟢 **आसान भाषा में:** यह ईमेल ${ctx.threatLevel.toLowerCase()} जोखिम के साथ आया है (स्कोर ${ctx.threatScore}/100)। ${ctx.spoofingDetected ? "यह दिखाने की कोशिश करता है कि यह किसी बड़ी कंपनी से है, पर वास्तव में जाली है। इसके लिंक पर क्लिक न करें।" : "ज्यादातर लाल झंडे नहीं मिले, फिर भी अजनबी लिंक पर क्लिक करने से बचें।"} पासवर्ड, OTP या पैसे की जानकारी किसी को न भेजें।`
        : `🟢 **In plain words:** This email is at **${ctx.threatLevel}** risk (score ${ctx.threatScore}/100). ${ctx.spoofingDetected ? "It is pretending to be a real company but is actually fake — do not click its links." : "No major red flags were found, but still avoid clicking links from strangers."} Never share passwords, OTPs, or money details.`;
    return buildMessage(
      `${simple}\n\n` +
        (language === "hi"
          ? "टेक्निकल डिटेल के लिए \"डिटेल समझाओ\" कहें।"
          : 'Say "explain details" for the technical version.'),
      { category: "education" }
    );
  }

  if (/technical|details|deep|how exactly|kaise pata|why exactly/i.test(query)) {
    const findings =
      ctx.findings.length > 0
        ? ctx.findings
            .slice(0, 6)
            .map((f) => `• ${f}`)
            .join("\n")
        : "• No explicit forensic findings were recorded.";
    return buildMessage(
      `${caseSummaryText(ctx, language)}\n\n**Technical rationale:**\n${findings}\n\n` +
        (language === "hi"
          ? `विश्लेषण ${ctx.indicatorCount} संकेतक, ${ctx.suspiciousUrlCount} संदिग्ध URL पर आधारित है।`
          : `Analysis is grounded in ${ctx.indicatorCount} indicator(s) and ${ctx.suspiciousUrlCount} suspicious URL(s).`),
      {
        category: "scam",
        quickActions: [
          { label: "🧠 Full Report", actionType: "OPEN_REPORT" },
        ],
      }
    );
  }

  if (/what.*(find|found)|summary|analysis|result|verdict|explain/i.test(query)) {
    const findings =
      ctx.findings.length > 0
        ? ctx.findings
            .slice(0, 5)
            .map((f) => `• ${f}`)
            .join("\n")
        : "• No explicit forensic findings were recorded.";

    return buildMessage(
      `${caseSummaryText(ctx, language)}\n\n${
        language === "hi"
          ? "**मुख्य निष्कर्ष:**"
          : "**Key findings from the forensic scan:**"
      }\n${findings}\n\n${
        language === "hi"
          ? `स्रोत डोमेन ${
              ctx.senderDomain ? `**${ctx.senderDomain}**` : "उपलब्ध नहीं"
            }, ${ctx.indicatorCount} संकेतक, ${ctx.suspiciousUrlCount} संदिग्ध URL।`
          : `Sender domain ${
              ctx.senderDomain ? `**${ctx.senderDomain}**` : "unavailable"
            }, ${ctx.indicatorCount} indicators, ${ctx.suspiciousUrlCount} suspicious URL(s).`
      }`,
      {
        category: "scam",
        quickActions: [
          { label: "🔒 Save Evidence", actionType: "NAVIGATE_LOCKER" },
        ],
      }
    );
  }

  // Stage J: escalation decision surfaced through the chat.
  if (/should i report|report this|escalate|cybercell|cyber cell|inform police|file complaint/i.test(query)) {
    const decision = decideEscalation(ctx);
    return buildMessage(
      `${caseSummaryText(ctx, language)}\n\n${escalationParagraph(decision, language, ctx)}\n\n` +
        (language === "hi"
          ? `निर्णय स्तर: **${decision.level}**। ध्यान दें: यह सुझाव है, शिकायत दर्ज करना आपका अधिकार और निर्णय है।`
          : `Decision level: **${decision.level}**. Note: this is guidance — filing a complaint is always your decision.`),
      {
        category: "legal",
        quickActions: [
          { label: "🌐 cybercrime.gov.in", actionType: "OPEN_CYBERCRIME_PORTAL" },
          { label: "📞 Call 1930", actionType: "DIAL_1930" },
          { label: "🔒 Evidence Locker", actionType: "NAVIGATE_LOCKER" },
        ],
      }
    );
  }

  if (/report|complain|1930|cybercrime|fir|cyber cell|portal/i.test(query)) {
    return buildMessage(
      language === "hi"
        ? `🌐 **${ctx.caseNumber} की औपचारिक शिकायत के लिए निर्देश:**\n\n1. सबूत संरक्षित रखें — Evidence Locker में SHA-256 हैश के साथ सुरक्षित करें (फ़ोरेंसिक रिपोर्ट डाउनलोड करें)।\n2. **cybercrime.gov.in** पर शिकायत दर्ज करें, केस नंबर ${ctx.caseNumber} और रिपोर्ट साथ रखें।\n3. वित्तीय धोखाधड़ी हो तो तुरंत **1930** पर कॉल करें।\n4. पुलिस से मदद लें — यह जानकारी केवल मार्गदर्शन है, कानूनी सलाह नहीं।`
        : `🌐 **How to report case ${ctx.caseNumber}:**\n\n1. Preserve and secure the evidence in the Evidence Locker with its SHA-256 integrity hash, and download the forensic report.\n2. File a complaint on **cybercrime.gov.in** and keep this Case Number (${ctx.caseNumber}) with the report.\n3. If money was involved, immediately call **1930** (Citizen Financial Cyber Fraud Reporting).\n4. Contact the local police cyber cell for filing an FIR. This is guidance, not legal advice.`,
      {
        category: "legal",
        quickActions: [
          { label: "🌐 cybercrime.gov.in (1930)", actionType: "OPEN_CYBERCRIME_PORTAL" },
          { label: "🔒 Evidence Locker", actionType: "NAVIGATE_LOCKER" },
        ],
      }
    );
  }

  if (/delete|skip|ignore|remove this email|not important/i.test(query)) {
    return buildMessage(
      language === "hi"
        ? `⚠️ **इस ईमेल या सबूत को अभी मत हटाएँ।** यदि बाद में शिकायत करने की ज़रूरत पड़े तो यही डिजिटल सबूत काम आएगा। पहले इसे Evidence Locker में सुरक्षित करें, फिर एक अलग फ़ोल्डर में रखें।`
        : `⚠️ **Don't delete this email or its evidence yet.** If you later decide to report it, this digital record is your proof. Preserve it in the Evidence Locker first, then archive the original instead of deleting it.`,
      {
        category: "evidence",
        quickActions: [
          { label: "🔒 Save to Evidence Locker", actionType: "NAVIGATE_LOCKER" },
        ],
      }
    );
  }

  if (/evidence|locker|proof|screenshot|preserve/i.test(query)) {
    return buildMessage(
      language === "hi"
        ? `🔒 **सबूत सुरक्षित करने का सही तरीका:** Evidence Locker में फ़ाइल अपलोड करें — हर फ़ाइल को **SHA-256 हैश** और chain-of-custody (लेन-देन) लॉग से सील किया जाता है। केस ${ctx.caseNumber} की फ़ोरेंसिक रिपोर्ट भी साथ सुरक्षित करें।`
        : `🔒 **Preserve your evidence properly:** Upload the email and forensic report to the Evidence Locker — every file is sealed with a **SHA-256 integrity hash** and a chain-of-custody log. Securing the case ${ctx.caseNumber} report here keeps it court-ready.`,
      {
        category: "evidence",
        quickActions: [
          { label: "🔒 Open Evidence Locker", actionType: "NAVIGATE_LOCKER" },
        ],
      }
    );
  }

  if (/password|account|hacked|compromised|secure my/i.test(query)) {
    return buildMessage(
      language === "hi"
        ? `🔑 **अपने खाते सुरक्षित करें:** 1) इस पासवर्ड को हर जगह जहाँ दोहराया गया है बदलें, 2) 2-चरणीय सत्यापन (2FA) चालू करें, 3) किसी भी लिंक पर क्लिक न करें या OTP साझा न करें, 4) बैंक से संपर्क करें यदि कार्ड/UPI की जानकारी ली गई थी।`
        : `🔑 **Secure your accounts now:** 1) Change this password anywhere it was reused, 2) enable two-factor authentication (2FA), 3) do not click any links or share OTPs, 4) contact your bank if card/UPI details were involved.`,
      {
        category: "scam",
        quickActions: [],
      }
    );
  }

  // Stage K (guided walkthrough, demo-only): we do NOT fake automated filing.
  if (/guide me|walk me|step by step|help me report|process|guided/i.test(query)) {
    return buildMessage(
      language === "hi"
        ? `🧭 **रिपोर्टिंग में मदद का 3-चरणीय रास्ता (यह शैक्षिक मार्गदर्शन है):**\n\n**चरण 1 — सबूत सील करें:** Experience Locker में ईमेल व रिपोर्ट अपलोड करें; हर फ़ाइल को SHA-256 हैश मिलेगा।\n**चरण 2 — शिकायत तैयार करें:** इस केस ${ctx.caseNumber} के साथ: (a) स्क्रीनशॉट, (b) रिपोर्ट, (c) रिसीवर द्वारा बताई गई हानि।\n**चरण 3 — सबमिट करें:** cybercrime.gov.in पर आप खुद सबमिट करेंगे (मैं आपकी ओर से फ़ॉर्म नहीं दर्ज कर सकती)। वैकल्पिक: निकटतम साइबर सेल में FIR।`
        : `🧭 **Guided reporting walkthrough (educational, 3 steps):**\n\n**Step 1 — Seal evidence:** Upload the email and report to the Evidence Locker; each gets a SHA-256 integrity hash.\n**Step 2 — Build the complaint:** Using case ${ctx.caseNumber}, gather (a) screenshots, (b) this report, (c) any loss described by the victim.\n**Step 3 — Submit yourself:** You submit on cybercrime.gov.in yourself — I can't file the form on your behalf. Optionally, FILE an FIR at your local cyber cell.`,
      {
        category: "education",
        quickActions: [
          { label: "🔒 Task 1: Open Evidence Locker", actionType: "NAVIGATE_LOCKER" },
          { label: "🌐 Task 3: cybercrime.gov.in", actionType: "OPEN_CYBERCRIME_PORTAL" },
        ],
      }
    );
  }

  const severityRiskNote = (() => {
    const level = ctx.threatLevel.toUpperCase();
    if (level === "CRITICAL" || level === "HIGH") {
      return language === "hi"
        ? "यह केस **उच्च जोखिम** में है — किसी भी लिंक पर क्लिक न करें और जल्द से जल्द शिकायत दर्ज करें।"
        : "This case is **high risk** — do not click any links and consider reporting it promptly.";
    }
    return language === "hi"
      ? "जोखिम अपेक्षाकृत कम है, फिर भी सावधानी बनाए रखें और संदिग्ध लिंक पर क्लिक न करें।"
      : "Risk is comparatively lower, but stay cautious and avoid clicking suspicious links.";
  })();

  return buildMessage(
    `${caseSummaryText(ctx, language)}\n\n${severityRiskNote}\n\n${
      language === "hi"
        ? "आगे क्या करना है (अगले कदम):\n1. Evidence Locker में सबूत व रिपोर्ट सुरक्षित करें।\n2. संदिग्ध लिंक/टेक्स्ट को Threat Detector से जाँचें।\n3. ज़रूरत पड़े तो cybercrime.gov.in / 1930 पर रिपोर्ट करें।\n\nमैं इस केस के बारे में और मदद कर सकती हूँ — पूछें।"
        : "Here's what to do next:\n1. Secure the evidence and forensic report in the Evidence Locker.\n2. Run suspicious links or text through the Threat Detector.\n3. Report on cybercrime.gov.in or dial 1930 when you are ready.\n\nAsk me anything else about this case — I can walk you through the next steps."
    }`,
    {
      category: "general",
      quickActions: [
        { label: "🔒 Save Evidence", actionType: "NAVIGATE_LOCKER" },
        { label: "🌐 Report on 1930", actionType: "OPEN_CYBERCRIME_PORTAL" },
      ],
    }
  );
}