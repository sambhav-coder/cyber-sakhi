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
  return CORE_KEYWORDS.some((kw) => {
    if (kw.indexOf(" ") !== -1) return t.includes(kw);
    return new RegExp(`\\b${escapeRegExp(kw)}\\w*`, "i").test(t);
  });
}

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
  return CRIME_SIGNAL_PHRASES.some((phrase) => {
    if (phrase.indexOf(" ") !== -1) return t.includes(phrase);
    return new RegExp(`\\b${escapeRegExp(phrase)}\\w*`, "i").test(t);
  });
}

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
  return null;
}

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

export function extractLocation(text: string): string | null {
  const t = text.toLowerCase();
  const sorted = [...INDIAN_PLACES].sort((a, b) => b.length - a.length);
  for (const place of sorted) {
    if (t.includes(place.toLowerCase())) return place;
  }
  return null;
}

export function buildSummary(html: string, maxLength = 300): string {
  return cleanSummary(html, maxLength);
}