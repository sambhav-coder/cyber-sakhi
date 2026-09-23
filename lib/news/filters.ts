import { cleanSummary } from "./text";

export interface CategoryRule {
  category: string;
  keywords: string[];
  tags: string[];
  requiresCrimeSignal?: boolean;
}

const CORE_KEYWORDS: string[] = [
  "fraud",
  "scam",
  "cyber",
  "phishing",
  "smishing",
  "upi",
  "otp",
  "hack",
  "hacking",
  "ransomware",
  "malware",
  "blackmail",
  "sextortion",
  "extortion",
  "deepfake",
  "deep fake",
  "stalking",
  "stalker",
  "aadhaar fraud",
  "identity theft",
  "sim swap",
  "sim-swap",
  "data breach",
  "data leak",
  "bitcoin",
  "crypto fraud",
  "trading app",
  "ponzi",
  "job scam",
  "morphed",
  "morphing",
  "obscene",
  "revenge porn",
  "fraudsters",
  "conman",
  "duped",
  "cybercrime",
  "cyber fraud",
  "online fraud",
  "money laundering",
  "digital arrest",
  "digital-arrest",
  "loan app",
  "debit card",
  "e-wallet",
  "credential",
  "spyware",
  "anydesk",
  "teamviewer",
  "screen sharing",
  "remote access",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isRelevant(text: string): boolean {
  const t = text.toLowerCase();
  const english = CORE_KEYWORDS.some((kw) => {
    if (kw.indexOf(" ") !== -1) return t.includes(kw);
    return new RegExp(`\\b${escapeRegExp(kw)}\\w*`, "i").test(t);
  });
  if (english) return true;
  // Hindi relevance: Devanagari has no \b word boundaries, so substring
  // matching on original-language cyber-crime vocabulary.
  return CORE_KEYWORDS_HI.some((kw) => text.includes(kw));
}

/**
 * Original-Hindi cyber-crime vocabulary (NBT/BBC Hindi wording). These are
 * matched against ORIGINAL Hindi article text — never against translations.
 */
const CORE_KEYWORDS_HI: string[] = [
  "साइबर",
  "ऑनलाइन ठगी",
  "ऑनलाइन धोखाधड़ी",
  "धोखाधड़ी",
  "ठगी",
  "धोखा",
  "फ्रॉड",
  "स्कैम",
  "फ़िशिंग",
  "फिशिंग",
  "हैक",
  "हैकिंग",
  "रैनसमवेयर",
  "मैलवेयर",
  "ब्लैकमेल",
  "जबरन वसूली",
  "डीपफेक",
  "उत्पीड़न",
  "पीछा",
  "पहचान की चोरी",
  "डेटा चोरी",
  "डेटा लीक",
  "नौकरी घोटाला",
  "निवेश घोटाला",
  "अश्लील",
  "ओटीपी",
  "यूपीआई",
  "डिजिटल अरेस्ट",
  "लोन ऐप",
  "केवाईसी",
  "आधार",
  "सिम स्वैप",
  "सायबर",
  "अपराध",
  "गिरफ्तार",
  "पुलिस",
  "मामला दर्ज",
  "जांच",
  "पीड़ित",
];

/**
 * Regulatory / policy stories about UPI and payments (e.g. merchant discount
 * rate changes, RBI circulars) mention "UPI" but are not crimes. They are
 * dropped unless the text also carries a real crime signal.
 */
const POLICY_NOISE_PHRASES: string[] = [
  "mdr",
  "merchant discount",
  "upi interchange",
  "zero-mdr",
  "upi lite",
  "upi 123pay",
  "feature phone",
  "rbi governor",
  "rbi deputy governor",
  "reserve bank",
  "digital payments growth",
  "cross-border payments",
  "national payments corporation",
  "0.4%",
  "upi fee",
  "upi tax",
  "interchange fee",
  "merchant fee",
  "payments above rs",
  "upi charge",
  "charging us",
  "cash only",
  "merchant",
  "modi",
  "rahul gandhi",
  "opposition",
  "congress",
  "politician",
];
const CRIME_SIGNAL_PHRASES: string[] = [
  "fraud",
  "scam",
  "siphoned",
  "duped",
  "cheating",
  "cheated",
  "stolen",
  "hacked",
  "fake app",
  "swindled",
  "conman",
  "fraudsters",
  "victim",
  "arrest",
  "fir",
  "police",
  "cyber cell",
  "probe",
  "crackdown",
  "drug money",
  "laundering",
];

export function isPolicyNoise(text: string): boolean {
  const t = text.toLowerCase();
  if (!POLICY_NOISE_PHRASES.some((phrase) => t.includes(phrase))) return false;
  return !hasCrimeSignal(t);
}

export const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "Digital arrest",
    keywords: [
      "digital arrest",
      "digital-arrest",
      "fake police call",
      "police impersonation",
      "cyber police",
    ],
    tags: ["digital arrest", "police impersonation"],
  },
  {
    category: "Online child safety",
    keywords: [
      "child porn",
      "csam",
      "minor girl",
      "child trafficking",
      "online grooming",
      "blue whale",
    ],
    tags: ["child safety", "csam"],
  },
  {
    category: "Sextortion & blackmail",
    keywords: [
      "sextortion",
      "morphed",
      "morphing",
      "revenge porn",
      "nude photo",
      "nude video",
      "nude images",
      "obscene video",
      "obscene photos",
      "objectionable videos",
      "cyber blackmail",
      "online blackmail",
      "digital blackmail",
      "cyber extortion",
      "online extortion",
      "webcam blackmail",
      "face swap porn",
    ],
    tags: ["sextortion", "blackmail", "morphed media"],
  },
  {
    category: "Deepfakes & AI abuse",
    keywords: [
      "deepfake",
      "deep fake",
      "ai-generated",
      "ai-generated nud",
      "voice cloning",
      "voice clone",
    ],
    tags: ["deepfake", "ai abuse"],
  },
  {
    category: "Ransomware & hacking",
    keywords: [
      "ransomware",
      "malware",
      "trojan",
      "spyware",
      "data breach",
      "data leak",
      "data theft",
      "server hacked",
      "website hacked",
      "defaced",
      "dark web",
    ],
    tags: ["ransomware", "data breach", "hacking"],
  },
  {
    category: "Account takeover",
    keywords: [
      "sim swap",
      "sim-swap",
      "account hacked",
      "account takeover",
      "instagram hacked",
      "whatsapp hacked",
      "hijacked",
      "social media hacked",
    ],
    tags: ["account takeover", "sim swap"],
  },
  {
    category: "Job scam",
    keywords: [
      "job scam",
      "job fraud",
      "work from home fraud",
      "work-from-home",
      "part-time job",
      "task fraud",
      "task scam",
      "telegram job",
    ],
    tags: ["job scam", "task fraud"],
  },
  {
    category: "Investment fraud",
    keywords: [
      "investment fraud",
      "crypto fraud",
      "bitcoin",
      "trading app",
      "trading fraud",
      "stock market scam",
      "ponzi",
      "mlm scam",
      "multilevel marketing",
      "binary options",
    ],
    tags: ["investment fraud", "crypto", "trading scam"],
  },
  {
    category: "Phishing & identity theft",
    keywords: [
      "phishing",
      "smishing",
      "skimming",
      "fake link",
      "fake website",
      "kyc fraud",
      "kyc verification",
      "identity theft",
      "aadhaar fraud",
      "impersonation",
    ],
    tags: ["phishing", "identity theft"],
  },
  {
    category: "Cyberstalking",
    keywords: [
      "stalking",
      "stalker",
      "cyber harassment",
      "online harassment",
      "instagram stalker",
      "harassing messages",
    ],
    tags: ["cyberstalking", "online harassment"],
  },
  {
    category: "Financial fraud",
    keywords: [
      "upi",
      "otp",
      "bank fraud",
      "banking fraud",
      "siphoned",
      "debit card",
      "credit card",
      "e-wallet",
      "net banking",
      "loan app",
      "cheating",
      "swindled",
      "cyber fraud",
      "online fraud",
      "fraudsters",
      "conman",
      "duped",
      "digital wallet",
      "fake app",
      "instant loan app",
    ],
    tags: ["financial fraud", "upi fraud"],
    requiresCrimeSignal: true,
  },
  {
    category: "Cybercrime",
    keywords: [
      "cybercrime",
      "cyber crime",
      "cyber fraud",
      "online fraud",
      "online scam",
      "cyber scam",
      "cyber cell",
      "cyber police",
      "digital fraud",
      "internet fraud",
      "online cheating",
      "digital scam",
      "techno fraud",
      "computer fraud",
      "email fraud",
      "online gaming fraud",
      "app fraud",
      "digital money",
      "online earning",
      "mobile wallet",
    ],
    tags: ["cybercrime", "online fraud"],
  },
];

export interface Classification {
  category: string;
  tags: string[];
}

export function hasCrimeSignal(text: string): boolean {
  const t = text.toLowerCase();
  const english = CRIME_SIGNAL_PHRASES.some((phrase) => {
    if (phrase.indexOf(" ") !== -1) return t.includes(phrase);
    return new RegExp(`\\b${escapeRegExp(phrase)}\\w*`, "i").test(t);
  });
  if (english) return true;
  return CRIME_SIGNAL_HI.some((phrase) => text.includes(phrase));
}

/** Hindi crime signals (original-language wording, substring matched). */
const CRIME_SIGNAL_HI: string[] = [
  "धोखाधड़ी",
  "ठगी",
  "गिरफ्तार",
  "पुलिस",
  "मामला दर्ज",
  "जांच",
  "पीड़ित",
  "चोरी",
  "हैक",
  "अपराधी",
  "साइबर सेल",
  "एफआईआर",
];

export function classify(text: string): Classification | null {
  const t = text.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    const matched = rule.keywords.filter((kw) => {
      if (kw.indexOf(" ") !== -1) return t.includes(kw);
      return new RegExp(`\\b${escapeRegExp(kw)}\\w*`, "i").test(t);
    });
    if (matched.length > 0) {
      if (rule.requiresCrimeSignal && !hasCrimeSignal(t)) continue;
      return {
        category: rule.category,
        tags: [
          ...rule.tags.filter((tag) => t.includes(tag)),
          ...matched.slice(0, 2),
        ].slice(0, 4),
      };
    }
  }
  // Original-Hindi classification into the same English taxonomy.
  for (const rule of CATEGORY_RULES_HI) {
    const matched = rule.keywords.filter((kw) => text.includes(kw));
    if (matched.length > 0) {
      if (rule.requiresCrimeSignal && !hasCrimeSignal(text)) continue;
      return {
        category: rule.category,
        tags: [...rule.tags, ...matched.slice(0, 2)].slice(0, 4),
      };
    }
  }
  return null;
}

/**
 * Hindi classification rules — same English category taxonomy, matched
 * against original Hindi text. Order matters (specific before generic).
 */
const CATEGORY_RULES_HI: CategoryRule[] = [
  {
    category: "Digital arrest",
    keywords: ["डिजिटल अरेस्ट", "फर्जी पुलिस", "पुलिस बनकर"],
    tags: ["digital arrest"],
  },
  {
    category: "Sextortion & blackmail",
    keywords: ["ब्लैकमेल", "अश्लील वीडियो", "अश्लील फोटो", "न्यूड", "जबरन वसूली"],
    tags: ["blackmail"],
  },
  {
    category: "Phishing & identity theft",
    keywords: ["फ़िशिंग", "फिशिंग", "नकली लिंक", "नकली वेबसाइट", "केवाईसी", "पहचान की चोरी", "आधार"],
    tags: ["phishing"],
  },
  {
    category: "Ransomware & hacking",
    keywords: ["रैनसमवेयर", "मैलवेयर", "डेटा चोरी", "डेटा लीक", "सर्वर हैक", "डार्क वेब"],
    tags: ["hacking"],
  },
  {
    category: "Account takeover",
    keywords: ["अकाउंट हैक", "खाता हैक", "सिम स्वैप", "व्हाट्सऐप हैक", "इंस्टाग्राम हैक"],
    tags: ["account takeover"],
  },
  {
    category: "Job scam",
    keywords: ["नौकरी घोटाला", "घर बैठे काम", "टास्क फ्रॉड", "टेलीग्राम जॉब"],
    tags: ["job scam"],
  },
  {
    category: "Investment fraud",
    keywords: ["निवेश घोटाला", "क्रिप्टो", "ट्रेडिंग ऐप", "पोंजी", "शेयर बाजार घोटाला"],
    tags: ["investment fraud"],
  },
  {
    category: "Cyberstalking",
    keywords: ["पीछा", "उत्पीड़न", "ऑनलाइन उत्पीड़न", "धमकी भरे संदेश"],
    tags: ["cyberstalking"],
  },
  {
    category: "Financial fraud",
    keywords: ["यूपीआई", "ओटीपी", "बैंक धोखाधड़ी", "लोन ऐप", "ऑनलाइन ठगी", "धोखाधड़ी", "ठगी", "डेबिट कार्ड", "क्रेडिट कार्ड"],
    tags: ["financial fraud"],
    requiresCrimeSignal: true,
  },
  {
    category: "Cybercrime",
    keywords: ["साइबर अपराध", "साइबर", "ऑनलाइन घोटाला", "साइबर सेल", "सायबर"],
    tags: ["cybercrime"],
  },
];

const INDIAN_PLACES: string[] = [
  "Andaman and Nicobar Islands",
  "Jammu and Kashmir",
  "Tamil Nadu",
  "Uttar Pradesh",
  "West Bengal",
  "Madhya Pradesh",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Himachal Pradesh",
  "Rajasthan",
  "Maharashtra",
  "Gujarat",
  "Karnataka",
  "Kerala",
  "Odisha",
  "Telangana",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Punjab",
  "Haryana",
  "Sikkim",
  "Mumbai",
  "Delhi",
  "New Delhi",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Lucknow",
  "Kanpur",
  "Nagpur",
  "Indore",
  "Bhopal",
  "Patna",
  "Vadodara",
  "Surat",
  "Coimbatore",
  "Guwahati",
  "Visakhapatnam",
  "Thiruvananthapuram",
  "Kochi",
  "Bhubaneswar",
  "Chandigarh",
  "Raipur",
  "Ranchi",
  "Dehradun",
  "Srinagar",
  "Agra",
  "Varanasi",
  "Noida",
  "Gurugram",
  "Gurgaon",
  "Ghaziabad",
  "Faridabad",
  "Meerut",
  "Mohali",
  "Ludhiana",
  "Amritsar",
  "Jodhpur",
  "Udaipur",
  "Kota",
  "Mysuru",
  "Mangaluru",
  "Vijayawada",
  "Nashik",
  "Aurangabad",
  "Solapur",
  "Jabalpur",
  "Gwalior",
  "Dhanbad",
  "Jamshedpur",
  "Siliguri",
  "Puducherry",
  "Goa",
  "Panaji",
  "Shimla",
  "Gangtok",
  "Itanagar",
  "Kohima",
  "Aizawl",
  "Imphal",
  "Agartala",
  "Shillong",
  "Panchkula",
  "Kurukshetra",
  "Tiruchirappalli",
  "Madurai",
  "Salem",
];

/** Major Indian places in Devanagari for original-Hindi articles. */
const INDIAN_PLACES_HI: string[] = [
  "मुंबई",
  "दिल्ली",
  "नई दिल्ली",
  "बेंगलुरु",
  "हैदराबाद",
  "चेन्नई",
  "कोलकाता",
  "पुणे",
  "अहमदाबाद",
  "जयपुर",
  "लखनऊ",
  "कानपुर",
  "नागपुर",
  "इंदौर",
  "भोपाल",
  "पटना",
  "सूरत",
  "कोच्चि",
  "चंडीगढ़",
  "रायपुर",
  "रांची",
  "देहरादून",
  "श्रीनगर",
  "आगरा",
  "वाराणसी",
  "नोएडा",
  "गुरुग्राम",
  "गाजियाबाद",
  "फरीदाबाद",
  "मेरठ",
  "लुधियाना",
  "अमृतसर",
  "जोधपुर",
  "उदयपुर",
  "नाशिक",
  "जबलपुर",
  "ग्वालियर",
  "गोवा",
  "शिमला",
  "महाराष्ट्र",
  "गुजरात",
  "कर्नाटक",
  "केरल",
  "पंजाब",
  "हरियाणा",
  "बिहार",
  "राजस्थान",
  "मध्य प्रदेश",
  "उत्तर प्रदेश",
  "पश्चिम बंगाल",
  "तमिलनाडु",
  "तेलंगाना",
  "ओडिशा",
  "असम",
  "भारत",
];

export function extractLocation(text: string): string | null {
  const t = text.toLowerCase();
  const sorted = [...INDIAN_PLACES].sort((a, b) => b.length - a.length);
  for (const place of sorted) {
    if (t.includes(place.toLowerCase())) return place;
  }
  const sortedHi = [...INDIAN_PLACES_HI].sort((a, b) => b.length - a.length);
  for (const place of sortedHi) {
    if (text.includes(place)) return place;
  }
  return null;
}

export function buildSummary(html: string, maxLength = 300): string {
  return cleanSummary(html, maxLength);
}