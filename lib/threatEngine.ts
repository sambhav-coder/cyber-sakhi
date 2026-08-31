import { ThreatAnalysisResult, ThreatSeverity, LegalSection } from "./types";

interface RulePattern {
  category: string;
  weight: number;
  regex: RegExp;
  triggerName: string;
}

const RULES: RulePattern[] = [
  // Blackmail & Extortion
  {
    category: "Extortion & Blackmail",
    weight: 45,
    regex: /(leak|expose|share|post)\s+(your|ur|the)?\s*(photos?|pics?|pictures?|videos?|nudes?|private|chat|mms)/i,
    triggerName: "Threat to leak private media",
  },
  {
    category: "Extortion & Blackmail",
    weight: 40,
    regex: /(blackmail|pay\s+me|send\s+money|ransom|deposit|transfer\s+cash|or\s+else\s+i\s+will)/i,
    triggerName: "Financial/action extortion threat",
  },
  {
    category: "Extortion & Blackmail",
    weight: 35,
    regex: /(send\s+(me\s+)?(your|ur)?\s*otp|share\s+(your\s+)?otp|tell\s+me\s+the\s+code)/i,
    triggerName: "Credential/OTP coercion",
  },
  {
    category: "Extortion & Blackmail",
    weight: 40,
    regex: /(ruin\s+your\s+life|tell\s+your\s+parents|tell\s+your\s+family|destroy\s+your\s+reputation)/i,
    triggerName: "Reputational blackmail",
  },
  // Stalking & Physical Threats
  {
    category: "Cyberstalking & Intimidation",
    weight: 45,
    regex: /(i\s+know\s+where\s+you\s+live|know\s+your\s+address|watching\s+you|following\s+you|outside\s+your\s+(house|college|office|gym|building))/i,
    triggerName: "Physical tracking/location intimidation",
  },
  {
    category: "Cyberstalking & Intimidation",
    weight: 40,
    regex: /(meet\s+me\s+alone|come\s+alone|or\s+i\s+will\s+come\s+to\s+your|find\s+you)/i,
    triggerName: "Forced solitary meeting coercion",
  },
  {
    category: "Cyberstalking & Intimidation",
    weight: 50,
    regex: /(kill\s+you|murder|acid|beat\s+you|hurt\s+you|slap|break\s+your\s+face|die)/i,
    triggerName: "Direct violence/bodily harm threat",
  },
  // Sexual Harassment
  {
    category: "Sexual Harassment",
    weight: 40,
    regex: /(send\s+(me\s+)?(nudes?|sexy\s+pics?|body\s+pics?|naked\s+photos?))/i,
    triggerName: "Unsolicited sexual media demand",
  },
  {
    category: "Sexual Harassment",
    weight: 35,
    regex: /(sleep\s+with\s+me|have\s+sex|be\s+my\s+mistress|do\s+dirty\s+things|breast|boobs|ass)/i,
    triggerName: "Sexually explicit solicitation",
  },
  // Doxxing & Privacy Violation
  {
    category: "Doxxing & Privacy Breach",
    weight: 30,
    regex: /(doxx|publish\s+your\s+number|share\s+your\s+contact|leak\s+your\s+address|post\s+your\s+details)/i,
    triggerName: "Doxxing / Unauthorized personal info disclosure",
  },
  // Financial Scams / Phishing
  {
    category: "Financial Fraud / Scam",
    weight: 25,
    regex: /(won\s+a\s+lottery|claim\s+cash\s+prize|winner|click\s+here\s+to\s+claim|kyc\s+suspended|electricity\s+bill\s+due)/i,
    triggerName: "Phishing/fraud urgency cue",
  },
  // Hate Speech / Abuse
  {
    category: "Abusive / Hate Speech",
    weight: 25,
    regex: /(slut|bitch|whore|worthless|trash|disgusting|ugly\s+pig|kill\s+yourself)/i,
    triggerName: "Severe derogatory / abusive slurs",
  },
];

const SAFE_PATTERNS = [
  /^(hi|hello|hey|good\s+morning|good\s+evening|how\s+are\s+you|what's\s+up|thank\s+you|see\s+you\s+tomorrow|happy\s+birthday)/i,
  /meeting\s+at|lunch\s+tomorrow|class\s+notes|project\s+submission|homework|coffee/i,
];

export function analyzeMessage(text: string): ThreatAnalysisResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const detectedTriggers: string[] = [];
  const detectedCategories = new Set<string>();
  let totalScore = 0;

  const riskFactors = {
    blackmail: 0,
    stalking: 0,
    sexualHarassment: 0,
    financialScam: 0,
    hateSpeech: 0,
    intimidation: 0,
  };

  // Check matching rules
  for (const rule of RULES) {
    if (rule.regex.test(lower)) {
      detectedTriggers.push(rule.triggerName);
      detectedCategories.add(rule.category);
      totalScore += rule.weight;

      if (rule.category.includes("Blackmail") || rule.category.includes("Extortion")) {
        riskFactors.blackmail = Math.min(100, riskFactors.blackmail + rule.weight * 2);
      }
      if (rule.category.includes("Stalking")) {
        riskFactors.stalking = Math.min(100, riskFactors.stalking + rule.weight * 2);
      }
      if (rule.category.includes("Intimidation")) {
        riskFactors.intimidation = Math.min(100, riskFactors.intimidation + rule.weight * 2);
      }
      if (rule.category.includes("Sexual")) {
        riskFactors.sexualHarassment = Math.min(100, riskFactors.sexualHarassment + rule.weight * 2);
      }
      if (rule.category.includes("Fraud") || rule.category.includes("Scam")) {
        riskFactors.financialScam = Math.min(100, riskFactors.financialScam + rule.weight * 2);
      }
      if (rule.category.includes("Abusive") || rule.category.includes("Hate")) {
        riskFactors.hateSpeech = Math.min(100, riskFactors.hateSpeech + rule.weight * 2);
      }
    }
  }

  // Safe checks
  const isSafeMatch = SAFE_PATTERNS.some((p) => p.test(lower)) && detectedTriggers.length === 0;

  let threatLevel: ThreatSeverity = "SAFE";
  const normalizedScore = Math.min(100, Math.max(0, totalScore));

  if (isSafeMatch || normalizedScore === 0) {
    threatLevel = "SAFE";
  } else if (normalizedScore < 30) {
    threatLevel = "LOW";
  } else if (normalizedScore < 60) {
    threatLevel = "MEDIUM";
  } else if (normalizedScore < 85) {
    threatLevel = "HIGH";
  } else {
    threatLevel = "CRITICAL";
  }

  // Determine Applicable Legal Sections in India
  const legalSections: LegalSection[] = [];

  if (riskFactors.blackmail > 0 || /otp|photos?|leak|money/i.test(lower)) {
    legalSections.push({
      code: "IT Act 2000 - Section 66E",
      title: "Violation of Privacy (Publishing/Transmitting Images)",
      penalty: "Imprisonment up to 3 years or fine up to ₹2 Lakhs",
    });
  }

  if (riskFactors.sexualHarassment > 0 || /nude|sex|explicit/i.test(lower)) {
    legalSections.push({
      code: "IT Act 2000 - Section 67 / 67A",
      title: "Transmitting Sexually Explicit / Obscene Material in Electronic Form",
      penalty: "Imprisonment up to 5 years + fine up to ₹10 Lakhs",
    });
    legalSections.push({
      code: "BNS Sec 75 / IPC Sec 354A",
      title: "Sexual Harassment & Unwelcome Demands",
      penalty: "Rigorous imprisonment up to 3 years with fine",
    });
  }

  if (riskFactors.stalking > 0 || /know where you live|watching you|following/i.test(lower)) {
    legalSections.push({
      code: "BNS Sec 78 / IPC Sec 354D",
      title: "Cyberstalking & Physical Monitoring",
      penalty: "Imprisonment up to 3 years (1st conviction) / 5 years (repeat)",
    });
  }

  if (riskFactors.intimidation > 0 || /kill|harm|ruin/i.test(lower)) {
    legalSections.push({
      code: "BNS Sec 351 / IPC Sec 503 & 506",
      title: "Criminal Intimidation",
      penalty: "Imprisonment up to 2 years or up to 7 years if threat to cause death/grievous hurt",
    });
  }

  if (riskFactors.financialScam > 0 || /otp|bank|lottery/i.test(lower)) {
    legalSections.push({
      code: "IT Act 2000 - Section 66D",
      title: "Cheating by Personation using Computer Resource",
      penalty: "Imprisonment up to 3 years and fine up to ₹1 Lakh",
    });
  }

  // Recommended actions
  const recommendedActions: string[] = [];

  if (threatLevel === "CRITICAL" || threatLevel === "HIGH") {
    recommendedActions.push("DO NOT comply with demands or send OTP/money. Blackmailers escalate when paid.");
    recommendedActions.push("Preserve original screenshots with timestamp & sender phone/handle visible.");
    recommendedActions.push("Store this evidence in your Cyber Sakhi Vault with cryptographic SHA-256 hash stamp.");
    recommendedActions.push("Notify your trusted emergency contacts and prepare a formal report for cybercrime.gov.in (National Cyber Crime Portal) or dial 1930 / 1091.");
    recommendedActions.push("Block and restrict the sender profile on all platforms after saving the chat backup.");
  } else if (threatLevel === "MEDIUM") {
    recommendedActions.push("Exercise extreme caution: Avoid clicking unsolicited links or answering unknown callers.");
    recommendedActions.push("Do not disclose location, routine, or personal contact info.");
    recommendedActions.push("Archive this conversation in the Evidence Locker as a precautionary measure.");
  } else if (threatLevel === "LOW") {
    recommendedActions.push("Minor risk signals detected. Keep an eye on any escalation.");
    recommendedActions.push("Verify the identity of the sender through a known secondary channel.");
  } else {
    recommendedActions.push("No explicit threat patterns or harassment signals identified.");
    recommendedActions.push("Always maintain safe digital hygiene and never share OTPs with anyone.");
  }

  let summary = "";
  if (threatLevel === "CRITICAL") {
    summary = "CRITICAL THREAT DETECTED: Direct blackmail, bodily harm, or severe coercive harassment identified. Immediate protective measures and escalation recommended.";
  } else if (threatLevel === "HIGH") {
    summary = "HIGH RISK: Severe pattern of intimidation, unauthorized extortion, or privacy violation detected. Preserve evidence immediately.";
  } else if (threatLevel === "MEDIUM") {
    summary = "MODERATE RISK: Suspicious patterns or borderline harassment detected. We advise preserving logs and disengaging.";
  } else if (threatLevel === "LOW") {
    summary = "LOW RISK: Subtle anomalies or mild abusive terminology detected.";
  } else {
    summary = "SAFE: No malicious or harassing language detected in this message.";
  }

  return {
    id: "scan_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    text: trimmed,
    timestamp: new Date().toISOString(),
    threatLevel,
    score: normalizedScore,
    categories: Array.from(detectedCategories),
    triggers: detectedTriggers,
    legalSections,
    recommendedActions,
    summary,
    riskFactors,
  };
}
