import { describe, expect, it } from "vitest";
import {
  isRelevant,
  isPolicyNoise,
  classify,
  extractLocation,
  buildSummary,
} from "@/lib/news/filters";

describe("isRelevant", () => {
  it("accepts cybercrime stories", () => {
    expect(isRelevant("cyber fraud in Bengaluru: woman duped of Rs 8 lakh")).toBe(true);
    expect(isRelevant("digital arrest scam, mastermind held")).toBe(true);
    expect(isRelevant("phishing SMS stole his OTP")).toBe(true);
    expect(isRelevant("WhatsApp account hacked via SIM swap")).toBe(true);
    expect(isRelevant("investment fraud via fake trading app")).toBe(true);
  });

  it("accepts original-Hindi cybercrime stories", () => {
    expect(isRelevant("ऑनलाइन ठगी में युवक से लाखों की धोखाधड़ी, पुलिस ने मामला दर्ज किया")).toBe(true);
    expect(isRelevant("डिजिटल अरेस्ट बताकर बुजुर्ग से ठगी")).toBe(true);
    expect(isRelevant("फिशिंग लिंक से बैंक खाता खाली")).toBe(true);
  });

  it("rejects unrelated news", () => {
    expect(isRelevant("PM greets nation on Diwali, asks citizens to stay safe")).toBe(false);
    expect(isRelevant("cricket team wins the series 3-2")).toBe(false);
    expect(isRelevant("monsoon rains across Kerala leave roads waterlogged")).toBe(false);
    expect(isRelevant("मानसून की बारिश से दिल्ली में जलभराव")).toBe(false);
    expect(isRelevant("क्रिकेट में भारत की जीत")).toBe(false);
  });
});

describe("isPolicyNoise", () => {
  it("flags payments-policy stories that carry no crime signal", () => {
    expect(
      isPolicyNoise("UPI MDR from October 15: Govt plans daily monitoring to stop merchants passing 0.4% fee")
    ).toBe(true);
    expect(
      isPolicyNoise("'No rethink' on 0.4% fee for UPI payments above Rs 2,000: Report")
    ).toBe(true);
    expect(
      isPolicyNoise("On UPI fee, Opposition's protests, Rahul Gandhi's jibe, government's response")
    ).toBe(true);
    expect(
      isPolicyNoise("'They forced us to use UPI, now they're charging us': Chandni Chowk traders")
    ).toBe(true);
    expect(isPolicyNoise("RBI governor meets finance ministry on digital payments growth")).toBe(true);
  });

  it("allows policy-adjacent stories that do carry a crime signal", () => {
    expect(isPolicyNoise("RBI warns of rising UPI fraud; banks to share real-time data")).toBe(false);
    expect(isPolicyNoise("Cyber cell cracks UPI theft ring after MDR probe")).toBe(false);
  });
});

describe("classify", () => {
  it("recognises digital arrest", () => {
    const c = classify("elderly couple held under digital arrest for 12 days, duped of 1.2 crore");
    expect(c?.category).toBe("Digital arrest");
  });

  it("recognises sextortion before generic fraud", () => {
    const c = classify("man blackmailed over morphed nude photos, loses money");
    expect(c?.category).toBe("Sextortion & blackmail");
  });

  it("recognises job scam", () => {
    const c = classify("part-time task scam on Telegram: students lose savings");
    expect(c?.category).toBe("Job scam");
  });

  it("recognises investment fraud keywords", () => {
    const c = classify("bitcoin trading app fraud: victims lured with high returns");
    expect(c?.category).toBe("Investment fraud");
  });

  it("recognises SIM swap account takeover", () => {
    const c = classify("sim swap: man's bank accounts drained after duplicate SIM");
    expect(c?.category).toBe("Account takeover");
  });

  it("falls back to Financial fraud for a general fraud story", () => {
    const c = classify("police arrest three in a cheating case over property deal");
    expect(c?.category).toBe("Financial fraud");
  });

  it("returns null for non-cyber stories (no false positives)", () => {
    expect(classify("Congress leader alleges blackmail bid behind rival's claim")).toBeNull();
    expect(classify("New underpass opens at My Home Avatar Junction in Cyberabad")).toBeNull();
    expect(classify("Tirupati laddu ghee supplier arrested for adulteration")).toBeNull();
    expect(classify("PM greets nation on Diwali")).toBeNull();
    expect(
      classify("'Forced to use UPI': Gujarat lawyer sends legal notice to PVR INOX")
    ).toBeNull();
  });

  it("keeps UPI stories that carry a real crime signal", () => {
    const c = classify("Operation Toofan to trace drug money through UPI, crypto wallets");
    expect(c?.category).toBe("Financial fraud");
  });

  it("classifies original-Hindi stories into the same taxonomy", () => {
    expect(classify("डिजिटल अरेस्ट बताकर बुजुर्ग से 1 करोड़ की ठगी")?.category).toBe("Digital arrest");
    expect(classify("ब्लैकमेल कर युवती से पैसे ऐंठे, अश्लील वीडियो वायरल की धमकी")?.category).toBe(
      "Sextortion & blackmail"
    );
    expect(classify("फिशिंग लिंक भेजकर बैंक खाता खाली, केवाईसी के नाम पर ठगी")?.category).toBe(
      "Phishing & identity theft"
    );
    expect(classify("यूपीआई ओटीपी बताते ही खाते से पैसे गायब, पुलिस ने मामला दर्ज किया")?.category).toBe(
      "Financial fraud"
    );
  });

  it("returns null for non-cyber Hindi stories", () => {
    expect(classify("मानसून की बारिश से दिल्ली में जलभराव")).toBeNull();
    expect(classify("क्रिकेट में भारत की शानदार जीत")).toBeNull();
  });
});

describe("extractLocation", () => {
  it("finds Indian cities and states", () => {
    expect(extractLocation("woman in Nagpur loses Rs 8 lakh in UPI fraud")).toBe("Nagpur");
    expect(extractLocation("Tamil Nadu cyber cell arrests accused")).toBe("Tamil Nadu");
    expect(extractLocation("Bengaluru resident files complaint")).toBe("Bengaluru");
  });

  it("finds Devanagari place names in Hindi articles", () => {
    expect(extractLocation("मुंबई में ऑनलाइन ठगी का मामला")).toBe("मुंबई");
    expect(extractLocation("उत्तर प्रदेश पुलिस ने साइबर ठगों को पकड़ा")).toBe("उत्तर प्रदेश");
  });

  it("returns null when no Indian place is mentioned", () => {
    expect(extractLocation("global crypto heist nets unknown sum")).toBeNull();
  });
});

describe("buildSummary", () => {
  it("strips HTML and truncates at a sentence boundary", () => {
    const html =
      "<p>An FIR was registered under the IT Act. </p><p>The accused were later produced before a magistrate, and the court remanded them to custody for a week while the investigation continues, and further testimony is being recorded.</p>";
    const summary = buildSummary(html, 100);
    expect(summary).not.toContain("<p>");
    expect(summary).toMatch(/^An FIR was registered under the IT Act\./);
    expect(summary).toMatch(/…$/);
  });

  it("preserves short text verbatim", () => {
    expect(buildSummary("<p>Call 1930.</p>", 300)).toBe("Call 1930.");
  });

  it("returns empty for empty input", () => {
    expect(buildSummary("")).toBe("");
  });
});