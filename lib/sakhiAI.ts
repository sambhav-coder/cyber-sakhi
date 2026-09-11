/**
 * Sakhi AI Companion — Pro-level deterministic safety engine (Step 4).
 *
 * Honest by design:
 *  - All responses are produced by explicit, auditable rules over the query,
 *    conversation history, memory, and any documents/evidence the user shares.
 *    Nothing is hallucinated; every legal/help/resource claim is either a
 *    verified government helpline, a generic "verify with official sources"
 *    note, or an explicit non-claim.
 *  - No fabricated phone numbers, no invented penalty figures, no fake AI.
 *
 * Exports (kept ABI-compatible with the previous engine):
 *  - ChatMessage, generateSakhiResponse(userQuery, language, opts?)
 *  + New: SakhiLanguage, detectLanguage, analyzeIncident, SAKHI_SUPPORTED_LANGUAGES
 */

export type SakhiLanguage = "en" | "hi" | "hinglish";

export const SAKHI_SUPPORTED_LANGUAGES: SakhiLanguage[] = ["en", "hi", "hinglish"];

export interface ChatMessage {
  id: string;
  sender: "user" | "sakhi";
  text: string;
  timestamp: string;
  category?: "emergency" | "legal" | "evidence" | "emotional" | "scam" | "general" | "education";
  quickActions?: { label: string; actionType: string; payload?: string }[];
}

export interface ChatContextFragment {
  /** Recent messages (newest last) from the current conversation. */
  history?: { sender: "user" | "sakhi"; text: string }[];
  /** Human-readable summaries of uploaded documents (names, kinds, previews). */
  attachmentSummaries?: string[];
  /** Human-readable briefs of attached evidence (code + metadata, never content). */
  evidenceBriefs?: string[];
  /** Non-sensitive long-term memory rows, as "key: value". */
  memory?: { key: string; value: string }[];
}

export type IncidentCategory =
  | "emergency"
  | "blackmail"
  | "stalking"
  | "phishing"
  | "financial"
  | "account"
  | "malware"
  | "social"
  | "impersonation"
  | "evidence"
  | "legal"
  | "emotional"
  | "document"
  | "followup"
  | "greeting"
  | "guardrail"
  | "general";

export interface IncidentAnalysis {
  category: IncidentCategory;
  tags: string[];
  headline: string;
  confidence: "high" | "medium" | "low";
  actionable: boolean;
}

const DEVANAGARI = /[\u0900-\u097F]/;
const HINGLISH_MARKERS = /\b(mujhe|maine|tumhe|aapko|kaise|kya|hai|karo|karna|karein|batao|nahi|nhi|kyu|kyun|sakta|sakti|ho sakta|samajh|problem|mera|meri|tera|teri|madad|kar raha|kar rahi|didi|bhaiya|please|sir|bhoot|scam hua|hacked hua|otp bola|paise|paisa)\b/i;

/** English / Hindi / Hinglish detection (Devanagari -> Hindi, roman Hinglish markers -> hinglish). */
export function detectLanguage(text: string): SakhiLanguage {
  const sample = text.trim();
  if (!sample) return "en";
  if (DEVANAGARI.test(sample)) return "hi";
  const matches = sample.toLowerCase().match(HINGLISH_MARKERS);
  if (matches && matches.length >= 2) return "hinglish";
  return "en";
}

/** Normalize any user-selected language into a known SakhiLanguage. */
export function normalizeLanguage(lang: unknown): SakhiLanguage {
  if (lang === "hi" || lang === "hinglish" || lang === "en") return lang;
  return "en";
}

function headlineOf(category: IncidentCategory): string {
  switch (category) {
    case "emergency": return "Immediate safety";
    case "blackmail": return "Blackmail / coercion / image abuse";
    case "stalking": return "Stalking / harassment";
    case "phishing": return "Phishing / deceptive email or SMS";
    case "financial": return "Financial fraud (UPI / OTP / KYC / bank / QR)";
    case "account": return "Account compromise / credential theft";
    case "malware": return "Malware / dangerous attachment";
    case "social": return "Social engineering technique";
    case "impersonation": return "Fake authority / impersonation (digital arrest, fraud call)";
    case "evidence": return "Evidence preservation";
    case "legal": return "Cyber law education";
    case "emotional": return "Emotional support";
    case "document": return "Document review";
    case "followup": return "Follow-up on our conversation";
    case "greeting": return "Greeting";
    case "guardrail": return "Out of Sakhi's scope";
    default: return "General cyber-safety guidance";
  }
}

/**
 * Structured incident reasoning (Step 4F). Internal fact-based classification
 * used by the reply builder — no hidden chain-of-thought is ever echoed to the
 * user; only the final, auditable guidance.
 */
export function analyzeIncident(userQuery: string): IncidentAnalysis {
  const q = userQuery.toLowerCase().trim();
  const tags: string[] = [];
  let category: IncidentCategory = "general";

  if (q.length === 0) {
    return { category: "greeting", tags: [], headline: headlineOf("greeting"), confidence: "high", actionable: false };
  }

  // Out-of-scope guardrail — only when the query has no cyber/safety signals at all.
  const hasSafetySignal =
    /cyber|hack|scam|fraud|phish|spam|otp|password|upi|bank|card|upi|virus|malware|stalk|harass|blackmail|leak|extort|photo|screenshot|evidence|locker|safe|safety|threat|danger|unsafe|bully|privacy|account|login|secure|recover|report|law|legal|police|fir|cybercrime|helpline|call|message|email|link|wifi|network|app|download|sos|phone/i;
  const guardrailStrong =
    /weather|temperature|recipe|cook|food|chicken|paneer|pizza|burger|cinema|movie|song|music|celebrity|actor|sport|cricket|football|simple math|2\+2|5\+5|homework|algebra|science fair|coding question|how do i code|python|javascript|gossip|shopping|flipkart|amazon order|travel plan|booking|movie ticket|other language translation|translate this word|what is your name origin/i;

  if (guardrailStrong.test(q) && !hasSafetySignal.test(q)) {
    category = "guardrail";
    tags.push("out-of-scope");
  } else if (/unsafe|danger|emergency|following me|someone outside|scared now|threatened right now|sos|bachao|madad|hurt me|help me now|police now/i.test(q)) {
    category = "emergency";
    tags.push("immediate-danger");
  } else if (/blackmail|extort|sextort|leak|nude|nudes|mms|revenge porn|intimate photo|video leak|pay.*(money|otp)|don't pay|dont pay|threat.*(photo|video)|coer|compromis|video call|catch.*(masturbat|private)|insist.*photo/i.test(q)) {
    category = "blackmail";
    tags.push("extortion");
  } else if (/stalk|following me|harass|abuse|unwanted calls|calling again|calling again and again|repeated messages|bully|cyberbully|defam|hate comment|doxx|doxing|workplace harassment|sexual remark/i.test(q)) {
    category = "stalking";
    tags.push("harassment");
  } else if (/digital arrest|fake (police|court|cbi|ed|income tax|customs|insurance)|kangaroo court|skype call|impersonat|fake government|spoof.*number|my number.*blocked|arrest warrant/i.test(q)) {
    category = "impersonation";
    tags.push("fake-authority");
  } else if (/upi|gpay|paytm|phonepe|netbanking|kyc|card (block|deduct)|double.*deduct|pin|otp|bank|money|refund|loan|investment|crypto|bitcoin|stock|trading|share market|defi|lottery|prize|job fraud|task|earning|safe deposit|qr code|payment|mule account|scam money recovered|wallet|parcel.*(customs|fees)|paytm kyc blocked/i.test(q)) {
    category = "financial";
    tags.push("financial-fraud");
  } else if (/phish|deceptive|email.*(suspect|unknown|strange)|suspicious (email|sms|link|message)|sender|company.*email|click.*link|link.*clicked|fake.*(email|sms)|this email/i.test(q)) {
    category = "phishing";
    tags.push("phishing");
  } else if (/malware|ransomware|virus|trojan|macro|attachment|exe|\.scr|\.bat|keylog|spyware|adware|infected|torrent|download.*virus|opened.*file/i.test(q)) {
    category = "malware";
    tags.push("malware");
  } else if (/hacked|compromised|password.*change|login.*(unknown|new device)|session|2fa|two[- ]factor|credential|account.*(stolen|taken|locked)|i typed password|gave password|changed my password|lock out|factory reset|sim swap|sim swap|impersonat.*me/i.test(q)) {
    category = "account";
    tags.push("account-compromise");
  } else if (/evidence|locker|proof|screenshot|preserve|save.*(chat|proof|evidence)|chain of custody|hash|court.*ready|dossier|export.*report/i.test(q)) {
    category = "evidence";
    tags.push("evidence");
  } else if (/law|legal|section|it act|ipc|bns|cyber law|suppress|rights|what crime|is this illegal|copyright|defamation|defamation case|report.*police|file.*fir|cybercrime|cyber cell|complaint|1930|who do i report/i.test(q)) {
    category = "legal";
    tags.push("legal");
  } else if (/anxious|depressed|crying|sad|overwhelmed|trauma|stress|mental health|cannot sleep|panic|suicid|hopeless|alone|scared.*talk|ashamed|guilty/i.test(q)) {
    category = "emotional";
    tags.push("mental-health");
  } else if (/analyze this (document|file|pdf|screenshot|image)|what does this (document|file|attachment) say|review (this|my|the) (attachment|document|file)|read this file|extract.*document|about this document/i.test(q)) {
    category = "document";
    tags.push("document-review");
  } else if (/social engineering|urgency|fear|authority|reward|generic greeting|ur (urgency|authority)|pretext|bait/i.test(q)) {
    category = "social";
    tags.push("social-engineering");
  } else if (/^(hi|hey|hello|namaste|namaskar|hola|good ?(morning|evening|afternoon|night)|kya hua|kya kar rahe|kaise ho|saste|sat sri akal|kem cho)\b/i.test(q.replace(/[.!?,]+$/, ""))) {
    category = "greeting";
    tags.push("greeting");
  } else if (/^.{1,6}$|^(ok|hmm|aha|right|yes|no|aur|aage|next|what next|and then|ok phir|theek|haan)$|what did I.*say|what was I.*asking|continue|aur batao|go on/i.test(q)) {
    category = "followup";
    tags.push("continuation");
  }

  if (category === "general") {
    const hasCyberSignal =
      /(password|otp|pin|cvv|clicked|link|email|sms|whatsapp|telegram|message|called|call|download|app|upi|card|bank|account|login|photo|video|link|report|safe|scam|fraud|hack|threat|stalk)/i;
    if (hasCyberSignal.test(q)) {
      category = "phishing";
      tags.push("general-cyber");
    } else if (hasSafetySignal.test(q)) {
      category = "general";
      tags.push("safety-query");
    } else {
      category = "guardrail";
      tags.push("unclear");
    }
  }

  const actionable = !["greeting", "guardrail", "emotional", "followup", "legal"].includes(category);
  return { category, tags, headline: headlineOf(category), confidence: category === "general" ? "low" : "high", actionable };
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildMessage(text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "sakhi_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    sender: "sakhi",
    text,
    timestamp: nowLabel(),
    ...extra,
  };
}

/** Choose the localized variant (English body / Hindi body / Hinglish-flavoured body). */
function t(lang: SakhiLanguage, en: string, hi: string, hinge?: string): string {
  if (lang === "hi") return hi;
  if (lang === "hinglish" && hinge) return hinge;
  return en;
}

const LEGAL_NOTE =
  "I only give general information, not legal advice — for the exact laws and sections that apply to your situation, please verify with a qualified lawyer or official sources.";

const DISCLAIMER_LINE =
  "Stay calm — you are not alone, and there are concrete steps you can take right now.";

function legalSoftener(offenceDescription: string): string {
  return `This may amount to ${offenceDescription} under Indian cyber law. ${LEGAL_NOTE}`;
}

// ---------------------------------------------------------------------------
// Per-category reply builders (en + hi)
// ---------------------------------------------------------------------------

function emergencyReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  const text = t(
    lang,
    `🚨 **Your immediate physical safety comes first.**

If you are in active, present danger:
1. **Dial 112 (National Emergency Number) or 1091 (Women Helpline) right now.**
2. Move toward a well-lit, public place with people — a shop, metro station, security booth.
3. Stay on a call with someone you trust; tell them where you are.
4. Press the SOS option in Cyber Sakhi **only** once you are safe and ready.

Take slow breaths. You are not alone.`,
    `🚨 **आपकी सुरक्षा सबसे पहले।**

यदि आप अभी किसी तत्काल खतरे में हैं:
1. **अभी 112 (राष्ट्रीय आपातकालीन नंबर) या 1091 (महिला हेल्पलाइन) पर कॉल करें।**
2. किसी रोशनी वाली, भीड़-भाड़ वाली सुरक्षित जगह पर जाएँ — दुकान, मेट्रो स्टेशन, सुरक्षा कक्ष।
3. किसी परिचित से फ़ोन पर बात करें और बताएँ आप कहाँ हैं।
4. सुरक्षित होने के बाद ही Cyber Sakhi में SOS विकल्प दबाएँ।

धीरे-धीरे साँस लें। आप अकेली नहीं हैं।`,
    `🚨 **Pehle aapki safety.**

Agar aap abhi khatre mein hain: **turant 112 ya 1091 par call karein.** Kisi roshni wali, bheed wali jagah par jaayein. Kisi bharose wale ko bataayein aap kahan hain. Aap akeli nahi hain.`
  );
  return {
    text,
    quickActions: [
      { label: "📞 Dial 112 Emergency", actionType: "DIAL_112" },
      { label: "📞 Call 1091 Women Helpline", actionType: "DIAL_1091" },
    ],
  };
}

function blackmailReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  const text = t(
    lang,
    `🛡️ **Stay calm. Do not pay — paying never ends an extortionist's demands.**

1. **Do not send money, OTPs, or more photos/videos.** Each payment invites the next demand.
2. **Do not delete anything.** Keep chats, numbers, profile links, and emails — every one is evidence.
3. **Screenshot and preserve before it disappears.** Upload these to the Evidence Locker so each file gets a tamper-proof SHA-256 hash.
4. **Report it:**
   - File on **cybercrime.gov.in** at any time, or
   - Call **1930** (National Cyber Fraud Helpline) if money/payment is involved, or
   - Visit your local police cyber cell for an FIR.
5. **Don't confront them or negotiate** — stop replying and save everything instead.

${legalSoftener("a criminal offence (for example unauthorised access, privacy violation, publishing private material, or criminal intimidation)")}

*You did the right thing by telling someone. You are not at fault.*`,
    `🛡️ **घबराएँ नहीं। पैसे न दें — पैसा देने से blackmail कभी नहीं रुकता, माँगें बढ़ती जाती हैं।**

1. **पैसे, OTP या और फ़ोटो/वीडियो किसी को न भेजें।**
2. **कुछ भी डिलीट न करें।** चैट, नंबर, प्रोफ़ाइल लिंक, ईमेल — सब सबूत हैं।
3. **पहले स्क्रीनशॉट लें और सुरक्षित रखें।** इन्हें Evidence Locker में अपलोड करें, हर फ़ाइल पर tamper-proof SHA-256 हैश लगेगा।
4. **शिकायत करें:**
   - कभी भी **cybercrime.gov.in** पर दर्ज करें, या
   - पैसे की माँग हो तो **1930** पर कॉल करें, या
   - अपने स्थानीय साइबर सेल में FIR दर्ज करें।
5. **मोल-भाव या बहस न करें** — जवाब देना बंद करें और सब कुछ सुरक्षित करें।

${LEGAL_NOTE}

*आपने सही काम किया किसी को बताकर। यह आपकी ग़लती नहीं है।*`,
    `🛡️ **Paise bilkul mat dein — blackmail karna band nahi hota.** Kuch bhi hasht karne se pehle screenshot lo aur Evidence Locker mein daalo. **cybercrime.gov.in** ya **1930** par report karo. Yeh aapki galti nahi hai.`
  );
  return {
    text,
    quickActions: [
      { label: "🔒 Save to Evidence Locker", actionType: "NAVIGATE_LOCKER" },
      { label: "🌐 cybercrime.gov.in (1930)", actionType: "OPEN_CYBERCRIME_PORTAL" },
      { label: "📞 DIAL 1930", actionType: "DIAL_1930" },
    ],
  };
}

function stalkingReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  const text = t(
    lang,
    `👁️ **Repeated unwanted contact or monitoring is a serious matter — your discomfort is valid.**

1. **Send ONE clear refusal, then stop engaging:** *"I do not consent to this communication. Do not contact me again."* No further explanations.
2. **Document everything:** dates, timestamps, numbers, URLs, screenshots — and save them in the Evidence Locker.
3. **Lock down your privacy:** private social profiles, 2-factor authentication, and remove location permission from apps.
4. **Tell trusted contacts and your workplace/school if relevant** — isolation is what the harasser wants.
5. **Report:** file on **cybercrime.gov.in**, or visit your local police cyber cell / women's cell for an FIR. You can also call **1930** if money is involved or **112/1091** for emergencies.

${legalSoftener("a criminal offence (for example stalking, harassment, or menacing behaviour)")}

You have every right to stop contact and to protect your accounts and your space.`,
    `👁️ **बार-बार अनचाहा संपर्क या नज़र रखना गंभीर मामला है — आपकी बेचैनी सही है।**

1. **एक बार साफ़ मना करें, फिर बात न करें:** *"मैं इस संपर्क की अनुमति नहीं देती। दोबारा संपर्क न करें।"*
2. **सब कुछ लिखें:** तारीख़, समय, नंबर, लिंक, स्क्रीनशॉट — और Evidence Locker में सुरक्षित रखें।
3. **अपनी निजता सुरक्षित करें:** सोशल प्रोफ़ाइल private करें, 2-factor authentication चालू करें, ऐप्स से location permission हटाएँ।
4. **भरोसेमंद लोगों को बताएँ** — अकेलापन ही harass करने वाले को ताक़त देता है।
5. **शिकायत करें:** **cybercrime.gov.in** पर या स्थानीय साइबर सेल / महिला सेल में FIR दर्ज करें।

${LEGAL_NOTE}

आपको संपर्क रोकने का पूरा अधिकार है।`,
    `👁️ **Ek baar saaf manaa karo, phir baat mat karo.** Sab kuch screenshot karke Evidence Locker mein daalo. Profile private karo, 2FA on karo. **cybercrime.gov.in** par report karo. Aapko rokne ka pura haq hai.`
  );
  return {
    text,
    quickActions: [
      { label: "🔒 Store Proof", actionType: "NAVIGATE_LOCKER" },
      { label: "🌐 cybercrime.gov.in", actionType: "OPEN_CYBERCRIME_PORTAL" },
    ],
  };
}

function phishingReply(lang: SakhiLanguage, attachmentSummary?: string): { text: string; quickActions: ChatMessage["quickActions"] } {
  const attachLead = attachmentSummary
    ? `\n\n📎 You shared a document. I can only summarize what its own text contains — I don't invent contents: ${attachmentSummary}\n\nIf any part of it asks for an OTP, password, "KYC update", or a payment link, treat that as a strong scam signal.\n\n`
    : `\n\n`;
  const text = t(
    lang,
    `⚠️ **This looks like a phishing attempt — a fake message engineered to steal your password, OTP, or money.**${attachLead}
How to recognize it:
1. **Urgency or fear:** "Account blocked", "KYC will expire", "suspicious activity detected", "act in 24 hours".
2. **Fake identity:** the sender pretends to be your bank, a courier, the government, or a familiar company.
3. **Requests credentials:** asks for OTP, PIN, CVV, passwords, or wants you to click a link / download an app.

What to do now:
1. **Do not click any link, download anything, or share OTP/PIN/password — ever.**
2. **Verify the sender through the official channel** (the real toll-free number, the real app) — never by replying to the suspicious message.
3. **Preserve it:** screenshot the message with sender details and save it in the Evidence Locker.
4. **Report:** forward the message to **1930** or file on **cybercrime.gov.in**; delete it only after preserving copies.

Remember: no legitimate bank or government agency ever asks for your OTP, PIN, CVV, or password.`,
    `⚠️ **यह phishing लग रहा है — एक धोखेबाज़ संदेश जो आपका पासवर्ड, OTP या पैसा लेने के लिए बनाया गया है।**${attachLead}
कैसे पहचानें:
1. **जल्दबाज़ी या डर:** "Account blocked", "KYC expire होगा", "संदिग्ध गतिविधि मिली", "24 घंटे में कार्रवाई करें"।
2. **नक़ली पहचान:** भेजने वाला बैंक, कूरियर, सरकार या कंपनी बनने की कोशिश करता है।
3. **जानकारी माँगना:** OTP, PIN, CVV, पासवर्ड या लिंक/ऐप डाउनलोड करने का कहता है।

अभी करें:
1. **कोई लिंक न खोलें, कुछ डाउनलोड न करें, और OTP/PIN/पासवर्ड कभी साझा न करें।**
2. **असली चैनल से पुष्टि करें** — असली toll-free नंबर या असली ऐप से, संदिग्ध संदेश का जवाब देकर नहीं।
3. **सबूत सुरक्षित रखें:** संदेश का स्क्रीनशॉट लें और Evidence Locker में रखें।
4. **शिकायत करें:** संदेश **1930** पर forward करें या **cybercrime.gov.in** पर दर्ज करें; कॉपी सुरक्षित करने के बाद ही डिलीट करें।

याद रखें: कोई भी असली बैंक/सरकार आपका OTP, PIN, CVV या पासवर्ड कभी नहीं माँगती।`,
    `⚠️ **Yeh phishing hai.** Click mat karo, OTP/PIN/password kisi ko mat batao. **Pehle screenshot lo aur Evidence Locker mein daalo**, phir **1930** par forward karo ya **cybercrime.gov.in** par report karo.`
  );
  return {
    text,
    quickActions: [
      { label: "🔒 Save Evidence", actionType: "NAVIGATE_LOCKER" },
      { label: "📞 Call 1930", actionType: "DIAL_1930" },
      { label: "🌐 cybercrime.gov.in", actionType: "OPEN_CYBERCRIME_PORTAL" },
    ],
  };
}

function financialReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  const text = t(
    lang,
    `⚠️ **This is financial fraud (UPI / OTP / KYC / fake trading / QR) — act now, but stay calm.**

Golden rules:
1. **A real bank NEVER asks for your OTP, PIN, CVV, or for a "test payment".** Any such call/SMS is fraud.
2. **KYC is never done over a phone call or a random link.** Banks use only their official app/website.
3. **"Earning money by liking/rating/tasks" schemes** that ask you to pay first, or to receive money and "send it back" (mule accounts), are illegal fraud.
4. **Fake investment/trading "guaranteed returns"** are classic scams — real markets never guarantee returns.

Do this now (in order):
1. **Immediately call 1930 (National Cyber Fraud Helpline)** — within the first hours, funds may still be traceable.
2. **Contact your bank** / UPI app and ask to block the transaction and freeze the beneficiary account.
3. **Never send more money** to "unlock" or "refund" anything.
4. **Preserve it:** screenshots of the messages, transaction IDs, UTR numbers, sender numbers — save them in the Evidence Locker.
5. **Report:** file on **cybercrime.gov.in** with the transaction/UTR details and the locker evidence.

Keep the UTR/transaction references handwritten somewhere safe — you will need them for the complaint.`,
    `⚠️ **यह वित्तीय धोखाधड़ी है (UPI / OTP / KYC / नक़ली trading / QR) — अभी कदम उठाएँ, पर शांत रहें।**

आसान नियम:
1. **असली बैंक कभी OTP, PIN, CVV या "test payment" नहीं माँगता।** ऐसी कोई भी कॉल/SMS fraud है।
2. **KYC कभी फ़ोन कॉल या किसी random लिंक पर नहीं होती।** बैंक केवल अपने असली ऐप/वेबसाइट से करता है।
3. **"लाइक/रेटिंग/टास्क करके पैसा कमाएँ"** — जिसमें पहले पैसा जमा करें या पैसा लेकर "वापस भेजें" कहा जाए, वह अवैध धोखा है।
4. **"गारंटीड रिटर्न" का नक़ली investment/trading** — असली बाज़ार कभी गारंटी नहीं देता।

अभी करें (क्रम से):
1. **तुरंत 1930 (राष्ट्रीय साइबर फ्रॉड हेल्पलाइन) पर कॉल करें** — पहले घंटों में पैसा रोका जा सकता है।
2. **बैंक / UPI ऐप से संपर्क करें** — लेन-देन रोकने और beneficiary खाता freeze करने को कहें।
3. **"रिफंड" या "अनलॉक" के लिए और पैसा कभी न भेजें।**
4. **सबूत सुरक्षित रखें:** संदेश, transaction ID, UTR नंबर, सेंडर नंबर के स्क्रीनशॉट — Evidence Locker में।
5. **शिकायत करें:** UTR/transaction विवरण के साथ **cybercrime.gov.in** पर दर्ज करें।

UTR/लेन-देन संख्या को काग़ज़ पर अलग लिखकर सुरक्षित रखें — शिकायत में काम आएगी।`,
    `⚠️ **Yeh financial fraud hai.** **Turant 1930 par call karo**, aur bank ko transaction block karne ko bolo. UTR number aur screenshots **Evidence Locker** mein daalo, phir **cybercrime.gov.in** par report karo. "Refund/Unlock" ke naam par aur paisa mat bhejo.`
  );
  return {
    text,
    quickActions: [
      { label: "📞 Call 1930", actionType: "DIAL_1930" },
      { label: "🔒 Save Evidence", actionType: "NAVIGATE_LOCKER" },
      { label: "🌐 cybercrime.gov.in", actionType: "OPEN_CYBERCRIME_PORTAL" },
    ],
  };
}

function accountReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  const text = t(
    lang,
    `🔑 **Secure your accounts now — order matters.**

1. **Change that password everywhere it was reused** (email, social, banking). Use a strong, unique password.
2. **Enable 2-Factor Authentication (2FA)** via an authenticator app (not SMS, if shared OTPs were at risk).
3. **Log out all other sessions / "sign out of all devices"** from your account security page.
4. **Check for unknown devices and linked apps** — remove anything you don't recognise.
5. **If OTP/card/UPI details were involved, contact your bank and dial 1930.** Money-related exposure is time-sensitive.

Do **not** click any "fix your account" links you received in chat/email — go to the official app/website directly.

${LEGAL_NOTE}`,
    `🔑 **अपने खाते अभी सुरक्षित करें — क्रम मायने रखता है।**

1. **जहाँ भी यह पासवर्ड दोहराया गया है, बदलें** (ईमेल, सोशल, बैंकिंग) — मज़बूत, अलग पासवर्ड।
2. **2-Factor Authentication (2FA) चालू करें** — authenticator ऐप से (अगर OTP साझा होने का खतरा हो तो SMS से नहीं)।
3. **अन्य सभी सत्र बंद करें** — account security settings में "sign out of all devices"।
4. **अनजान devices और जुड़े ऐप्स देखें** — जो न पहचानें, हटाएँ।
5. **अगर OTP/कार्ड/UPI की जानकारी शामिल थी — बैंक से संपर्क करें और 1930 पर कॉल करें।**

चैट/ईमेल में मिले "अपना खाता ठीक करें" लिंक पर क्लिक न करें — सीधे असली ऐप/वेबसाइट पर जाएँ।

${LEGAL_NOTE}`,
    `🔑 **Account secure karo.** Password har jagah badlo, **2FA on** karo, "sign out of all devices" karo. OTP/card/UPI involved ho to **bank + 1930** par turant call karo. Kisi "fix your account" link par click mat karna.`
  );
  return {
    text,
    quickActions: [
      { label: "🔒 Secure Evidence", actionType: "NAVIGATE_LOCKER" },
      { label: "📞 Call 1930", actionType: "DIAL_1930" },
    ],
  };
}

function malwareReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  const text = t(
    lang,
    `🦠 **A malicious attachment or link can only harm you if it runs — so the priority is containment.**

1. **Disconnect that device from the internet (and from your home Wi-Fi)** if a file was opened or something downloaded itself.
2. **Do NOT open it again, and do NOT pay any "fine" or ransom.** Paying promises nothing.
3. **Run a full antivirus scan** from a safe device (use an updated, reputable scanner; Windows also has built-in Security).
4. **Watch for unusual activity:** messages sent from your accounts, new apps, changed passwords, money movements. Browser **1890/1930 ecosystem** — if money or banking is involved, call **1930**.
5. **Preserve the file and timestamps** — but don't keep spreading copies. A screenshot of the file details is safer than forwarding the actual file.
6. **Change passwords from a different device** after cleaning.

Do not double-click, enable macros, install "codec" or "viewer" apps, or allow AnyDesk/TeamViewer remote control from a stranger.

${LEGAL_NOTE}`,
    `🦠 **कोई ख़तरनाक attachment/link तभी नुकसान करता है जब वह चलता है — इसलिए सबसे पहले उसे रोकें।**

1. **यदि कोई फ़ाइल खुली या खुद डाउनलोड हुई है तो डिवाइस को इंटरनेट/घर के Wi-Fi से तुरंत हटाएँ।**
2. **उसे दोबारा न खोलें और कोई "जुर्माना" या रैनसम न दें।** पैसे देने से कुछ गारंटी नहीं।
3. **किसी सुरक्षित डिवाइस से full antivirus scan चलाएँ** (Windows में built-in Security भी है)।
4. **असामान्य गतिविधि देखें:** आपके खातों से भेजे संदेश, नए ऐप्स, बदले पासवर्ड, पैसों की गति। बैंकिंग/पैसा शामिल हो तो **1930** पर कॉल करें।
5. **फ़ाइल और समय का सबूत रखें** — असली फ़ाइल आगे न भेजें, उसके विवरण का स्क्रीनशॉट काफ़ी है।
6. **सफ़ाई के बाद दूसरे डिवाइस से पासवर्ड बदलें।**

अजनबी के कहे "codec/viewer" ऐप न लगाएँ, macros न चलाएँ, और कभी किसी को AnyDesk/TeamViewer से remote access न दें।

${LEGAL_NOTE}`,
    `🦠 **Device ko internet se alag karo, kholna band karo, aura antivirus scan chalao.** Koi "fine" ya ransom mat do. Paise/banking ho to **1930** par call karo. Kisi ajnabi ko remote access kabhi mat do.`
  );
  return {
    text,
    quickActions: [
      { label: "📞 Call 1930", actionType: "DIAL_1930" },
      { label: "🔒 Save Evidence", actionType: "NAVIGATE_LOCKER" },
    ],
  };
}

function impersonationReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  return {
    text: t(
      lang,
      `🛑 **This is a scam — "digital arrest", fake police/CBI/ED calls, and courier "customs" demands are fraud. Real authorities never do this.**

Red flags:
1. **Real police/CBI/ED never demand payment, OTP, or "verify your bank" over a video/phone call.**
2. They never threaten arrest in exchange for "token money" or ask you to stay on a Skype/WhatsApp video call.
3. A "courier parcel with drugs" is a fake script — customs never asks you to pay to clear it.

What to do:
1. **Don't pay, don't share OTP/PIN, don't install any app they tell you to.**
2. **End the call/content immediately.**
3. **Report it:** file on **cybercrime.gov.in** or call **1930**. Spend time — the caller is not going anywhere.
4. If you already sent money or details, call **1930** first, then your bank.

You are not under arrest, and nothing happens "within the hour" except to people who comply.`,
      `🛑 **यह धोखा है — "digital arrest", नक़ली पुलिस/CBI/ED कॉल और कूरियर "कस्टम्स" माँगें धोखाधड़ी हैं। असली अधिकारी ऐसा कभी नहीं करते।**

सावधानी के संकेत:
1. **असली पुलिस/CBI/ED फ़ोन/वीडियो कॉल पर पैसे, OTP या "बैंक verify" नहीं माँगते।**
2. वे "token money" के बदले गिरफ़्तारी की धमकी नहीं देते और न ही Skype/WhatsApp वीडियो कॉल पर रुकने को कहते हैं।
3. "कूरियर पार्सल में ड्रग्स" नक़ली कहानी है — कस्टम्स पार्सल साफ़ करने के लिए पैसे नहीं माँगते।

क्या करें:
1. **पैसे न दें, OTP/PIN न दें, उनका बताया ऐप इंस्टॉल न करें।**
2. **कॉल/बात तुरंत समाप्त करें।**
3. **शिकायत करें:** **cybercrime.gov.in** पर या **1930** पर कॉल करें। आप कहीं नहीं जा रहे, असली दबाव की कोई ज़रूरत नहीं।
4. पहले से पैसा/जानकारी दे दी है तो पहले **1930**, फिर बैंक।

आप गिरफ़्तार नहीं हैं — "एक घंटे में कार्रवाई" केवल उन्हीं के साथ होती है जो मान जाते हैं।`,
      `🛑 **Yeh "digital arrest" wala scam hai — real police kabhi phone par paisa/OTP nahi maangate.** Koi app install mat karo, paise mat do. Call khatam karo aur **1930 / cybercrime.gov.in** par report karo.`
    ),
    quickActions: [
      { label: "📞 Call 1930", actionType: "DIAL_1930" },
      { label: "🌐 cybercrime.gov.in", actionType: "OPEN_CYBERCRIME_PORTAL" },
    ],
  };
}

function socialEngineerReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  return {
    text: t(
      lang,
      `🧠 **This is social engineering — the manipulation of urgency, fear, authority, reward, or romance to rush you into acting.**

The six classic plays to watch for:
1. **Urgency:** "Act now or it's lost / account closed".
2. **Fear:** "Your card is blocked / you'll be arrested".
3. **Authority:** fake officials, bank managers, "senior officers".
4. **Reward:** prizes, lottery, jobs paying too much for too little.
5. **Familiarity/romance:** strangers who quickly love you or share "great opportunities".
6. **Flattery/diversion:** praise to lower your guard.

Whatever the story, the goal is the same — get your OTP/PIN/password, get you to pay, or get you to install something.

Do this:
1. **Pause.** A genuine need never depends on seconds. Take an hour.
2. **Verify through the official channel** — never by replying to or calling the number that contacted you.
3. **Never share OTP/PIN/CVV/password, never do a "test" or "reverse" payment, never install remote-access apps.**
4. **Preserve and report** — screenshot, save to the Evidence Locker, report on cybercrime.gov.in / 1930.`,
      `🧠 **यह social engineering है — जल्दबाज़ी, डर, अधिकार, इनाम या रोमांस का उपयोग करके आपसे जल्दबाज़ी में कदम उठाने की कोशिश।**

छह आम चालें:
1. **जल्दबाज़ी:** "अभी नहीं किया तो खाता बंद हो जाएगा / अवसर खो देंगे"।
2. **डर:** "आपका कार्ड ब्लॉक / आप पर गिरफ़्तारी"।
3. **अधिकार:** नक़ली अधिकारी, बैंक मैनेजर, "सीनियर ऑफ़िसर"।
4. **इनाम:** लॉटरी, पुरस्कार, बहुत अधिक कमाई वाली नौकरियाँ।
5. **परिचितता/रोमांस:** अजनबी जो बहुत जल्दी प्यार या "बेहतरीन अवसर" दिखाते हैं।
6. **तारीफ़/भटकाव:** सतर्कता कम करने के लिए प्रशंसा।

कहानी कुछ भी हो, मक़सद एक ही है — OTP/PIN/पासवर्ड, पैसे या ऐप इंस्टॉल करवाना।

यह करें:
1. **रुकें।** असली ज़रूरत कभी सेकंडों पर निर्भर नहीं होती। एक घंटा लें।
2. **असली चैनल से पुष्टि करें** — संपर्क करने वाले नंबर से जवाब देकर नहीं।
3. **OTP/PIN/CVV/पासवर्ड कभी न दें, "test" या "reverse" payment कभी न करें, remote-access ऐप कभी न लगाएँ।**
4. **सबूत सुरक्षित करें और शिकायत करें** — screenshot, Evidence Locker, फिर cybercrime.gov.in / 1930।`,
      `🧠 **Yeh social engineering hai — jaldi, dar, authority, reward ya romance se aapko decision mein rush karna.** Ruko, ek ghanta lo. OTP/PIN/password kabhi mat do. Official channel se verify karo.`
    ),
    quickActions: [
      { label: "🔒 Save Evidence", actionType: "NAVIGATE_LOCKER" },
      { label: "📞 Call 1930", actionType: "DIAL_1930" },
    ],
  };
}

function evidenceReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  return {
    text: t(
      lang,
      `🔒 **Preserve digital evidence the way a cyber cell wants it:**

1. **Screenshot with context:** include the URL bar, sender number/handle, and date/time where possible, not just the message bubble.
2. **If a platform allows it, export the chat archive** (WhatsApp/Telegram "export chat") — it keeps timestamps.
3. **Upload to the Evidence Locker:** every file there is sealed with a real **SHA-256 integrity hash** and a chain-of-custody log, so you can prove it wasn't changed.
4. **Keep a companion case:** if the message relates to an analysed email, use that case number; the forensic report lives beside the evidence.
5. **Don't keep only deleted copies** — preserve the original where you can, and note dates.

Then file on **cybercrime.gov.in** or call **1930** when you're ready — with the locker evidence and the hash references.`,
      `🔒 **डिजिटल सबूत वैसे सुरक्षित रखें जैसे साइबर सेल चाहती है:**

1. **पूरा संदर्भ लेकर स्क्रीनशॉट लें:** केवल message bubble नहीं — URL bar, sender नंबर/हैंडल और दिनांक/समय साथ में।
2. **जहाँ संभव हो chat archive export करें** (WhatsApp/Telegram "export chat") — timestamps सुरक्षित रहते हैं।
3. **Evidence Locker में अपलोड करें:** हर फ़ाइल पर असली **SHA-256 integrity hash** और chain-of-custody लॉग लगता है।
4. **केस से जोड़कर रखें:** यदि संदेश किसी विश्लेषित ईमेल से है तो वही case number उपयोग करें — फ़ोरेंसिक रिपोर्ट साथ रहेगी।
5. **केवल कॉपी नहीं, मूल सबूत संभाल कर रखें** — और तारीख़ें नोट करें।

फिर तैयार होने पर **cybercrime.gov.in** / **1930** पर — locker सबूत और हैश संदर्भ के साथ।`,
      `🔒 **Screenshot pura context lekar lo (URL, sender, time), chat export karo, aur Evidence Locker mein daalo — har file ko SHA-256 hash milega.** Phir **cybercrime.gov.in** ya **1930** par report karo.`
    ),
    quickActions: [
      { label: "🔒 Open Evidence Locker", actionType: "NAVIGATE_LOCKER" },
      { label: "🌐 cybercrime.gov.in", actionType: "OPEN_CYBERCRIME_PORTAL" },
    ],
  };
}

function legalReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  return {
    text: t(
      lang,
      `⚖️ **A plain-language overview of Indian cyber law (general information, not legal advice):**

- **Unauthorised access / hacking** and **data theft** are offences (IT Act).
- **Identity theft, cheating using a computer resource, and publishing private/intimate material without consent** are offences (IT Act, and BNS provisions).
- **Sexual harassment / stalking / criminal intimidation** are dealt with under criminal law (BNS).
- **Financial fraud** (UPI/OTP/card) is reported through **1930 / cybercrime.gov.in** — and is investigated by the cyber cell.

What matters for you right now:
1. **You have the right to report** any of these, as an individual, at no direct cost — **cybercrime.gov.in** accepts complaints 24x7.
2. **Evidence decides the case** — preserve files, chats and hashes in the Evidence Locker.
3. For the exact section, bailability, or procedure, **ask a qualified lawyer or the cyber cell** — I won't invent specifics.
4. In an emergency, **112**; for women's matters, **1091**; for cyber fraud, **1930**.`,
      `⚖️ **भारतीय साइबर कानून की आसान भाषा में जानकारी (सामान्य जानकारी, कानूनी सलाह नहीं):**

- **अनधिकृत पहुँच / हैकिंग** और **डेटा चोरी** अपराध हैं (IT Act)।
- **पहचान की चोरी, कंप्यूटर के ज़रिये धोखाधड़ी, और बिना सहमति के निजी/अंतरंग सामग्री प्रकाशित करना** अपराध हैं (IT Act व BNS प्रावधान)।
- **यौन उत्पीड़न / स्टॉकिंग / आपराधिक धमकी** आपराधिक कानून (BNS) के अंतर्गत हैं।
- **वित्तीय धोखाधड़ी** (UPI/OTP/कार्ड) **1930 / cybercrime.gov.in** के ज़रिये रिपोर्ट होती है।

आपके लिए अभी क्या मायने रखता है:
1. **आपको शिकायत का अधिकार है** — **cybercrime.gov.in** 24x7 स्वीकार करता है, इसमें सीधा शुल्क नहीं है।
2. **सबूत ही मामला तय करते हैं** — फ़ाइलें, चैट और हैश Evidence Locker में सुरक्षित रखें।
3. सटीक धारा/जमानत/प्रक्रिया के लिए **योग्य वकील या साइबर सेल से पूछें** — मैं विवरण गढ़ूँगी नहीं।
4. आपातकाल में **112**; महिला मामलों में **1091**; साइबर धोखाधड़ी में **1930**।`,
      `⚖️ **Indian cyber law mein hacking, data theft, identity theft, private photos leak aur financial fraud offence hain.** Report **cybercrime.gov.in** par. Sahi section ke liye lawyer/cyber cell se poocho. Emergency mein **112**, cyber fraud par **1930**.`
    ),
    quickActions: [
      { label: "🌐 cybercrime.gov.in", actionType: "OPEN_CYBERCRIME_PORTAL" },
      { label: "🔒 Open Evidence Locker", actionType: "NAVIGATE_LOCKER" },
    ],
  };
}

function emotionalReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  return {
    text: t(
      lang,
      `🌸 **I hear you, and what you're feeling makes sense.**

What happened online is **not your fault** — harassers deliberately use shame and isolation to control how you feel.

1. **You don't have to deal with this alone.** Tell one person you trust today — a friend, family member, or your trusted contact in Cyber Sakhi.
2. **Reach out to a confidential helpline when it feels heavy.** The Government's **Tele-MANAS** mental health support line is **14416** (toll-free, 24x7). Please also ask your doctor or a local clinic for services near you.
3. **Do one grounding thing:** drink water, write down the facts you know are true, step outside for two minutes.
4. If you or someone you know is in immediate danger or crisis, call **112** — help will come to you.

If your feelings are overwhelming right now, please talk to the Tele-MANAS team on **14416** — you deserve support, not silence.`,
      `🌸 **मैं आपकी बात सुन रही हूँ, और आपकी भावनाएँ बिल्कुल सही हैं।**

ऑनलाइन जो हुआ वह **आपकी ग़लती नहीं है** — harass करने वाले जानबूझकर शर्म और अकेलेपन का फ़ायदा उठाते हैं।

1. **इसे अकेले न झेलें।** आज एक भरोसेमंद व्यक्ति को बताएँ — दोस्त, परिवार या Cyber Sakhi का आपका trusted contact।
2. **भारी लगे तो गोपनीय हेल्पलाइन से बात करें।** सरकार का **Tele-MANAS** मानसिक स्वास्थ्य नंबर **14416** है (toll-free, 24x7)। अपने डॉक्टर से भी पास की सेवाएँ पूछें।
3. **एक काम करें:** पानी पिएँ, सच्चे तथ्य लिख लें, दो मिनट बाहर टहलें।
4. अगर तुरंत ख़तरा/संकट हो तो **112** पर कॉल करें — मदद आप तक आएगी।

अगर भावनाएँ अभी बहुत ज़्यादा हैं तो कृपया **14416** (Tele-MANAS) से बात करें — आप सहारे के हक़दार हैं।`,
      `🌸 **Aapki baat samajh rahi hoon. Jo hua woh aapki galti nahi hai.** Akela mat jhelo — kisi bharose wale ko batao. Bahut heavy lage to **Tele-MANAS 14416** par call karo (24x7, toll-free). Emergency ho to **112**.`
    ),
    quickActions: [
      { label: "📞 Tele-MANAS (14416)", actionType: "DIAL_14416" },
      { label: "📞 Dial 112", actionType: "DIAL_112" },
    ],
  };
}

function documentReply(lang: SakhiLanguage, attachmentSummaries?: string[]): { text: string; quickActions: ChatMessage["quickActions"] } {
  const lead = attachmentSummaries?.length
    ? attachmentSummaries.map((s) => `• ${s}`).join("\n")
    : "No document contents were attached to this message.";
  return {
    text: t(
      lang,
      `📄 **Here's what I can see from the document you shared (only what its own text contains — I never invent contents):**

${lead}

Now, want me to:
1. **Check it for scam signals** — tell me anything it asks for (OTP, payment, KYC, personal data) and I'll assess it.
2. **Guide evidence** — if it's a suspicious file, don't forward it; screenshot the details and save to the Evidence Locker.
3. **Summarize** — it helps to paste the key lines here in the chat.

A word of caution: if a PDF/DOC asks you to "enable macros", "run this file", or asks for passwords — treat it as high risk without opening or running it.`,
      `📄 **आपके साझा किए दस्तावेज़ में मुझे यह दिख रहा है (केवल वही जो उसके अपने text में है — मैं सामग्री नहीं गढ़ती):**

${lead}

अब क्या चाहें:
1. **Scam संकेतों की जाँच** — बताइए वह क्या माँगता है (OTP, भुगतान, KYC, निजी डेटा)।
2. **सबूत संभालना** — संदिग्ध फ़ाइल forward न करें; विवरण का screenshot लेकर Evidence Locker में रखें।
3. **सारांश** — कुछ मुख्य पंक्तियाँ यहाँ चैट में चिपकाएँ।

सावधान: अगर PDF/DOC "enable macros", "यह फ़ाइल चलाएँ" या पासवर्ड माँगे — बिना खोले उसे उच्च जोखिम मानें।`,
      `📄 **Jo aapne file bheji, usmein yeh hai:** ${lead}\n\nBatao usme kya maanga gaya hai (OTP/payment/KYC?) — main scam signals check kar dungi. File forward mat karo, screenshot se Evidence Locker mein daalo.`
    ),
    quickActions: [
      { label: "🔒 Open Evidence Locker", actionType: "NAVIGATE_LOCKER" },
      { label: "📞 Call 1930", actionType: "DIAL_1930" },
    ],
  };
}

function guardrailReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  return {
    text: t(
      lang,
      `🌐 **That's outside what I'm built to do.** I'm Cyber Sakhi — your personal guide for **digital safety**: scams, phishing, blackmail, stalking, account security, malware, evidence preservation, and Indian cyber law.

I can't help with weather forecasts, recipes, entertainment, travel booking, or general knowledge — and I won't pretend to.

What I *can* do right now:
1. Check a suspicious message, link, or email you received.
2. Walk you through safety steps if you're being threatened, stalked, or blackmailed.
3. Guide you on preserving evidence and reporting (cybercrime.gov.in / 1930 / FIR).

Paste the message, or tell me what happened online — I'm here.`,
      `🌐 **यह मेरे दायरे से बाहर है।** मैं Cyber Sakhi हूँ — डिजिटल सुरक्षा की आपकी सहचरी: scams, phishing, blackmail, stalking, खाता सुरक्षा, malware, सबूत संभालना और भारतीय साइबर कानून।

मौसम, खाना, मनोरंजन, यात्रा या सामान्य ज्ञान में मैं मदद नहीं कर सकती — और मैं दिखावा नहीं करूँगी।

मैं क्या कर सकती हूँ:
1. आपके मिले संदिग्ध संदेश/लिंक/ईमेल की जाँच।
2. धमकी/स्टॉकिंग/ब्लैकमेल की स्थिति में सुरक्षा के कदम।
3. सबूत संभालने और शिकायत (cybercrime.gov.in / 1930 / FIR) का मार्गदर्शन।

वह संदेश चिपकाएँ या बताएँ ऑनलाइन क्या हुआ — मैं हूँ साथ।`,
      `🌐 **Yeh mera kaam nahi hai.** Main Cyber Sakhi hoon — digital safety ke liye: scam, phishing, blackmail, stalking, account security, evidence aur cyber law. Koi sus message ya situation batao — main madad karungi.`
    ),
    quickActions: [
      { label: "🔒 Evidence Locker", actionType: "NAVIGATE_LOCKER" },
      { label: "🌐 cybercrime.gov.in", actionType: "OPEN_CYBERCRIME_PORTAL" },
    ],
  };
}

function greetingReply(lang: SakhiLanguage): { text: string; quickActions: ChatMessage["quickActions"] } {
  return {
    text: t(
      lang,
      `👋 **Hello — I'm Sakhi**, your cyber-safety companion.

I help you with:
• 🧠 **Checking suspicious messages/links/emails** for scam signals
• 🚨 **Emergency safety steps** when you feel threatened or unsafe
• 🔒 **Preserving evidence** (SHA-256-sealed, chain-of-custody) in the Evidence Locker
• ⚖️ **Indian cyber law & reporting** (cybercrime.gov.in, 1930, FIR) the honest way

You can also send me a **document or screenshot** to review, attach **evidence from your Evidence Locker**, or use **Voice Mode** to talk instead of typing.

What happened online — or what are you worried about?`,
      `👋 **नमस्ते — मैं Sakhi हूँ**, आपकी साइबर-सुरक्षा सहचरी।

मैं मदद करती हूँ:
• 🧠 **संदिग्ध संदेश/लिंक/ईमेल की जाँच**
• 🚨 **ख़तरा/असुरक्षित महसूस होने पर आपातकालीन कदम**
• 🔒 **सबूत संभालना** (SHA-256 हैश + chain-of-custody, Evidence Locker)
• ⚖️ **भारतीय साइबर कानून और शिकायत** (cybercrime.gov.in, 1930, FIR) — ईमानदार तरीक़े से

आप मुझे **दस्तावेज़/स्क्रीनशॉट** भेज सकते हैं, **Evidence Locker** से सबूत जोड़ सकते हैं, या टाइप करने के बजाय **Voice Mode** में बात कर सकते हैं।

ऑनलाइन क्या हुआ — या आप किस बारे में चिंतित हैं?`,
      `👋 **Hello, main Sakhi hoon** — aapki cyber-safety companion. Suspicious message/email check, emergency steps, evidence preservation (SHA-256 + custody), aur Indian cyber law + reporting (cybercrime.gov.in, 1930, FIR) mein madad karti hoon. Document/screenshot bhejo, ya batao — kya hua online?`
    ),
    quickActions: [
      { label: "🔒 Evidence Locker", actionType: "NAVIGATE_LOCKER" },
      { label: "🧠 Threat Check", actionType: "NAVIGATE_DETECTOR" },
    ],
  };
}

function followupReply(lang: SakhiLanguage, history?: { sender: "user" | "sakhi"; text: string }[]): { text: string; quickActions: ChatMessage["quickActions"] } {
  const lastSakhi = history ? [...history].reverse().find((m) => m.sender === "sakhi") : undefined;
  const continuation = lastSakhi
    ? t(
        lang,
        `We were just talking about the steps for your situation. Where would you like to continue from?

1. **What to do next** (safety / recovery steps)
2. **Preserving evidence** in the Evidence Locker
3. **Reporting** (cybercrime.gov.in, 1930, or FIR)
4. **Legal information** about the relevant offence

Or just tell me the next worry in your own words — I'm here.
"Please re-read our last message if you need it."`,
        `हम अभी आपकी स्थिति के कदमों पर बात कर रहे थे। कहाँ से जारी रखें?

1. **अगले कदम** (सुरक्षा / सुधार)
2. **सबूत संभालना** (Evidence Locker)
3. **शिकायत** (cybercrime.gov.in, 1930, या FIR)
4. **कानूनी जानकारी**

या अपने शब्दों में अगली चिंता बताएँ — मैं हूँ।`,
        `Hum abhi aapke steps par baat kar rahe the. **Aage kya karna hai, evidence preserve karna, ya report karna (1930 / cybercrime.gov.in)?** Batao, main hoon.`
      )
    : t(
        lang,
        `I just need a little more context to help well. Could you tell me what happened — e.g. "I got a suspicious message", "someone is threatening me", "my account was hacked", or "I lost money to a scam"?`,
        `अच्छी मदद के लिए थोड़ा संदर्भ चाहिए। बताइए क्या हुआ — जैसे "संदिग्ध संदेश मिला", "कोई धमकी दे रहा है", "मेरा खाता हैक हुआ", या "scam में पैसा चला गया"।`,
        `Thoda context do — "sus message mila", "koi dhamki de raha hai", "account hacked", ya "scam mein paisa gaya"?`
      );
  return {
    text: continuation,
    quickActions: [
      { label: "🔒 Evidence Locker", actionType: "NAVIGATE_LOCKER" },
    ],
  };
}

function generalReply(lang: SakhiLanguage, history?: { sender: "user" | "sakhi"; text: string }[]): { text: string; quickActions: ChatMessage["quickActions"] } {
  void history;
  return {
    text: t(
      lang,
      `🧭 **Let me help you navigate that.** Cyber Sakhi is your guide for digital safety and recovery — the more specific you are, the better I can help.

Try describing:
1. **What you received** — a suspicious email/SMS/link, an unexpected call, or a message?
2. **What you did** — did you click, share an OTP, or pay anything?
3. **What happened** — money lost, account taken over, someone threatening, or something leaked?

For example: *"I got an SMS saying my KYC will expire and to click a link to update — I'm scared."* Then I can walk you through exactly what to do next. If money or card details were involved, call **1930** now.`,
      `🧭 **मैं आपकी स्थिति समझने की कोशिश करती हूँ।** आप जितना स्पष्ट बताएँगी, मदद उतनी अच्छी होगी।

बताने की कोशिश करें:
1. **क्या मिला** — संदिग्ध ईमेल/SMS/लिंक, अनपेक्षित कॉल, या संदेश?
2. **आपने क्या किया** — क्या क्लिक किया, OTP दिया, या पैसा दिया?
3. **क्या हुआ** — पैसा गया, खाता हैक, कोई धमकी, या कुछ लीक?

उदाहरण: *"KYC expire होने का SMS आया और लिंक पर क्लिक करने को कहा — मैं डरी हुई हूँ।"* फिर मैं सटीक अगले कदम बताऊँगी। पैसा/कार्ड शामिल हो तो अभी **1930** पर कॉल करें।`,
      `🧭 **Thoda aur batao — kya mila (suspicious SMS/email/call), kya kiya aapne (click ya OTP diya?), kya hua?** Paise/card involved ho to abhi **1930** par call karo.`
    ),
    quickActions: [
      { label: "📞 Call 1930", actionType: "DIAL_1930" },
      { label: "🔒 Evidence Locker", actionType: "NAVIGATE_LOCKER" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate a Sakhi reply. Kept ABI-compatible with the previous engine
 * (userQuery, language) and extended with optional conversation context
 * (history, document/evidence briefs, non-sensitive memory).
 */
export function generateSakhiResponse(
  userQuery: string,
  language: SakhiLanguage = "en",
  context?: ChatContextFragment
): ChatMessage {
  const lang = normalizeLanguage(language);
  const query = userQuery.trim();
  const analysis = analyzeIncident(query);
  const history = context?.history || [];
  const attachmentSummaries = context?.attachmentSummaries || [];
  const evidenceBriefs = context?.evidenceBriefs || [];
  const memory = context?.memory || [];

  // Document review wins when files were attached, even for short queries.
  let builder;
  if (analysis.category === "document" || (attachmentSummaries.length > 0 && analysis.category === "general")) {
    builder = documentReply(lang, attachmentSummaries);
  } else {
    switch (analysis.category) {
      case "emergency": builder = emergencyReply(lang); break;
      case "blackmail": builder = blackmailReply(lang); break;
      case "stalking": builder = stalkingReply(lang); break;
      case "phishing": builder = phishingReply(lang); break;
      case "financial": builder = financialReply(lang); break;
      case "account": builder = accountReply(lang); break;
      case "malware": builder = malwareReply(lang); break;
      case "impersonation": builder = impersonationReply(lang); break;
      case "social": builder = socialEngineerReply(lang); break;
      case "evidence": builder = evidenceReply(lang); break;
      case "legal": builder = legalReply(lang); break;
      case "emotional": builder = emotionalReply(lang); break;
      case "followup": builder = followupReply(lang, history); break;
      case "greeting": builder = greetingReply(lang); break;
      case "guardrail": builder = guardrailReply(lang); break;
      default: builder = generalReply(lang, history);
    }
  }

  // Prepend honest context lead lines (evidence attachments + memory).
  const leads: string[] = [];
  if (evidenceBriefs.length > 0) {
    leads.push(
      t(
        lang,
        `🔖 Evidence you attached (metadata only — locked content is never read):\n` + evidenceBriefs.map((b) => `• ${b}`).join("\n"),
        `🔖 आपके जुड़े सबूत (केवल metadata — locked सामग्री कभी नहीं पढ़ी जाती):\n` + evidenceBriefs.map((b) => `• ${b}`).join("\n"),
        `🔖 Aapke attached evidence:\n` + evidenceBriefs.map((b) => `• ${b}`).join("\n")
      )
    );
  }
  const preferLang = memory.find((m) => m.key === "sakhi.language" && (m.value === "hi" || m.value === "hinglish"));
  if (preferLang && lang === "en") {
    leads.push(
      t(
        lang,
        `🌐 I remember you prefer talking in ${preferLang.value === "hi" ? "Hindi" : "Hinglish"} — use the language button to switch, or just keep chatting; I'll match.`,
        `🌐 मुझे याद है आप ${preferLang.value === "hi" ? "हिंदी" : "Hinglish"} में बात करती हैं — language बटन से बदलें, या चैट करते रहें।`,
        `🌐 Mujhe yaad hai aap Hindi/Hinglish mein baat karti ho — switch karne ke liye batao.`
      )
    );
  }

  const text = leads.length > 0 ? leads.join("\n\n") + "\n\n" + builder.text : builder.text;
  return buildMessage(text, {
    category: builderCategory(analysis.category),
    quickActions: builder.quickActions,
  });
}

function builderCategory(category: IncidentCategory): ChatMessage["category"] {
  switch (category) {
    case "emergency": return "emergency";
    case "blackmail":
    case "stalking":
    case "phishing":
    case "financial":
    case "account":
    case "malware":
    case "social":
    case "impersonation": return "scam";
    case "evidence": return "evidence";
    case "legal": return "legal";
    case "emotional": return "emotional";
    case "document": return "education";
    default: return "general";
  }
}