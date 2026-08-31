export interface ChatMessage {
  id: string;
  sender: "user" | "sakhi";
  text: string;
  timestamp: string;
  category?: "emergency" | "legal" | "evidence" | "emotional" | "scam" | "general";
  quickActions?: { label: string; actionType: string; payload?: string }[];
}

export function generateSakhiResponse(userQuery: string, language: "en" | "hi" = "en"): ChatMessage {
  const query = userQuery.toLowerCase().trim();
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // 1. Emergency / Immediate Unsafe Feeling
  if (/unsafe|danger|help me|emergency|following me|someone outside|scared|threatened right now|sos|bachao|madad/i.test(query)) {
    if (language === "hi") {
      return {
        id: "sakhi_" + Date.now(),
        sender: "sakhi",
        text: `🚨 **आपकी सुरक्षा हमारी सर्वोच्च प्राथमिकता है।**

यदि आप इस समय किसी तत्काल शारीरिक खतरे में हैं:
1. **तुरंत 112 (राष्ट्रीय आपातकालीन नंबर) या 1091 (महिला हेल्पलाइन) पर कॉल करें।**
2. Cyber Sakhi का **'VoiceShield SOS'** ट्रिगर करें ताकि आपकी लाइव लोकेशन आपके विश्वसनीय संपर्कों को तुरंत भेजी जा सके।
3. किसी सुरक्षित, रोशनी वाली या भीड़-भाड़ वाली जगह (दुकान, मेट्रो स्टेशन, गार्ड रूम) की ओर जाएं।
4. किसी परिचित को तुरंत कॉल पर रखें और अपनी लाइव लोकेशन शेयर करें।

*मैं आपके साथ हूँ। कृपया घबराएँ नहीं, पहले सुरक्षित स्थान पर पहुँचें।*`,
        timestamp: now,
        category: "emergency",
        quickActions: [
          { label: "🚨 Open Emergency SOS", actionType: "NAVIGATE_SOS" },
          { label: "📞 Dial 112 Emergency", actionType: "DIAL_112" },
          { label: "📞 Call 1091 Women Helpline", actionType: "DIAL_1091" },
        ],
      };
    }

    return {
      id: "sakhi_" + Date.now(),
      sender: "sakhi",
      text: `🚨 **Your immediate physical safety comes first.**

If you are facing an active, present danger:
1. **Immediately dial 112 (National Emergency Number) or 1091 (Women Helpline).**
2. Activate **VoiceShield SOS** in Cyber Sakhi to instantly broadcast your live GPS location & alert your trusted contacts.
3. Move toward a well-lit, public area with people (metro station, convenience store, security booth).
4. Stay on a voice call with someone you trust and share your live tracking link.

*Take deep breaths. You are not alone, and we have emergency protocols ready to protect you.*`,
      timestamp: now,
      category: "emergency",
      quickActions: [
        { label: "🚨 Open Emergency SOS", actionType: "NAVIGATE_SOS" },
        { label: "📞 Dial 112 Emergency", actionType: "DIAL_112" },
        { label: "📞 Call 1091 Women Helpline", actionType: "DIAL_1091" },
      ],
    };
  }

  // 2. Blackmail & Extortion (Leaking photos, OTP, sextortion)
  if (/blackmail|leak|photos|nudes|mms|extortion|otp|money|compromise|video call/i.test(query)) {
    if (language === "hi") {
      return {
        id: "sakhi_" + Date.now(),
        sender: "sakhi",
        text: `🛡️ **घबराएँ नहीं, यह एक सामान्य जबरन वसूली (Sextortion/Blackmail) का तरीका है।**

कृपया इन महत्वपूर्ण कदमों का पालन करें:
1. **पैसे या OTP कभी न दें:** पैसे देने से ब्लैकमेल कभी बंद नहीं होता, बल्कि उनकी माँगें बढ़ जाती हैं।
2. **सबूत मिटाएँ नहीं:** चैट, नंबर, प्रोफाइल लिंक और ईमेल के तुरंत स्पष्ट स्क्रीनशॉट लें।
3. **Cyber Sakhi Evidence Locker में सुरक्षित करें:** हमारे वॉल्ट में स्क्रीनशॉट अपलोड करें ताकि कोर्ट-मान्य SHA-256 हैश जनरेट हो सके।
4. **राष्ट्रीय साइबर पोर्टल पर शिकायत दर्ज करें:** **cybercrime.gov.in** पर या साइबर हेल्पलाइन **1930** पर कॉल करें।
5. **कानूनी धाराएं:** यह IT Act धारा 66E (निजता उल्लंघन), धारा 67 (अश्लीलता), और BNS धारा 351 (आपराधिक धमकी) के तहत गैर-जमानती अपराध है।`,
        timestamp: now,
        category: "legal",
        quickActions: [
          { label: "🔒 Save to Evidence Locker", actionType: "NAVIGATE_LOCKER" },
          { label: "🧠 Check Message Threat Score", actionType: "NAVIGATE_DETECTOR" },
          { label: "🌐 National Cyber Portal (1930)", actionType: "OPEN_CYBERCRIME_PORTAL" },
        ],
      };
    }

    return {
      id: "sakhi_" + Date.now(),
      sender: "sakhi",
      text: `🛡️ **Stay calm. You are a victim of coercion, and the law is firmly on your side.**

Follow these strict protective steps:
1. **Never pay money or share OTPs:** Giving in never ends extortion; perpetrators only escalate demands.
2. **Do NOT delete the conversation:** Every message, audio note, and phone number is admissible evidence.
3. **Store in Evidence Locker:** Upload screenshots to your Cyber Sakhi encrypted vault to seal them with a tamper-proof SHA-256 cryptographic stamp.
4. **Report to Cyber Crime Cell:** File an immediate report on **cybercrime.gov.in** or call the National Cyber Helpline at **1930**.
5. **Applicable Legal Protections:** This violates IT Act 2000 Section 66E (Privacy violation), Section 67/67A (Explicit content transmission), and BNS Sec 351 / IPC 506 (Criminal intimidation).

*We can help you compile a 1-click police dossier report in the Evidence Locker.*`,
      timestamp: now,
      category: "legal",
      quickActions: [
        { label: "🔒 Open Evidence Locker", actionType: "NAVIGATE_LOCKER" },
        { label: "🧠 Analyze Threat Level", actionType: "NAVIGATE_DETECTOR" },
        { label: "🌐 Cybercrime.gov.in (1930)", actionType: "OPEN_CYBERCRIME_PORTAL" },
      ],
    };
  }

  // 3. Stalking & Harassment
  if (/stalk|following|harass|abuse|calling again and again|unwanted calls|messages/i.test(query)) {
    return {
      id: "sakhi_" + Date.now(),
      sender: "sakhi",
      text: `👁️ **Cyberstalking and repeated unwanted communication are serious criminal offenses.**

Here is the exact action protocol:
1. **State one clear refusal:** Send one unambiguous message: *"I do not consent to this communication. Do not contact me again or I will file a police FIR."* Do not engage after this.
2. **Document everything:** Log dates, timestamps, numbers, URLs, and caller IDs.
3. **Lock down privacy:** Enable 2-factor authentication, set social profiles to private, and disable location permissions on apps.
4. **Legal Recourse:** Under **BNS Section 78 / IPC Section 354D (Stalking)**, this carries up to 3 years imprisonment on first conviction.
5. **NCW Assistance:** You can also report harassment to the National Commission for Women (NCW) helpline at **7827170170**.`,
      timestamp: now,
      category: "legal",
      quickActions: [
        { label: "🔒 Store Stalking Proof", actionType: "NAVIGATE_LOCKER" },
        { label: "👥 Check Trusted Contacts", actionType: "NAVIGATE_CONTACTS" },
      ],
    };
  }

  // 4. Evidence Preservation Guidance
  if (/preserve|evidence|proof|screenshot|locker|file complaint|fir|court/i.test(query)) {
    return {
      id: "sakhi_" + Date.now(),
      sender: "sakhi",
      text: `🔒 **How to Preserve Legally Admissible Digital Evidence:**

To ensure your evidence stands up before the Cyber Cell and judicial authorities:
1. **Capture Full Metadata:** Screenshots must include the URL bar, contact number/handle, date, and exact system time.
2. **Export Chat Archives:** In WhatsApp/Telegram, use "Export Chat without media" to obtain raw server timestamp logs.
3. **Compute Cryptographic Hash:** When you upload files to **Cyber Sakhi Evidence Locker**, an immutable **SHA-256 hash** and simulated tamper-proof ledger timestamp are calculated to prove the evidence was not altered.
4. **Generate Dossier:** Use our "Export Incident Dossier" feature to produce a pre-formatted complaint document with hash proof.`,
      timestamp: now,
      category: "evidence",
      quickActions: [
        { label: "🔒 Go to Evidence Locker", actionType: "NAVIGATE_LOCKER" },
        { label: "📄 Export Police Dossier", actionType: "NAVIGATE_LOCKER" },
      ],
    };
  }

  // 5. Scams & Financial Fraud
  if (/scam|fraud|lottery|prize|link|bank|card|phishing|fake/i.test(query)) {
    return {
      id: "sakhi_" + Date.now(),
      sender: "sakhi",
      text: `⚠️ **Digital Scam Prevention Advisory:**

- **Golden Rule:** No legitimate bank or authority ever asks for OTP, CVV, or passwords over call/SMS.
- **Do not click short links:** These often download keyloggers or remote access Trojans (AnyDesk/TeamViewer).
- **If already defrauded:** Immediately dial **1930** (Citizen Financial Cyber Fraud Reporting) within the first 2 golden hours to freeze money in the perpetrator's account.
- **Block the card/account:** Contact your bank's 24x7 emergency helpline immediately.`,
      timestamp: now,
      category: "scam",
      quickActions: [
        { label: "🧠 Analyze Scam Message", actionType: "NAVIGATE_DETECTOR" },
        { label: "📞 Call 1930 Cyber Fraud", actionType: "DIAL_1930" },
      ],
    };
  }

  // 6. Emotional & Mental Health Support
  if (/anxious|depressed|crying|sad|overwhelmed|trauma|stress|mental health|cannot sleep/i.test(query)) {
    return {
      id: "sakhi_" + Date.now(),
      sender: "sakhi",
      text: `🌸 **I hear you, and your feelings are completely valid.**

Experiencing digital harassment or threats is deeply distressing. Please remember:
- **This is not your fault:** Harassers deliberately use intimidation to make victims feel isolated and ashamed.
- **You are in control:** You have tools, legal remedies, and people who care about your safety.
- **Speak with someone you trust:** Reach out to a close friend or family member from your Trusted Contacts.
- **Free Confidential Support:** 
  - **Tele-MANAS (Govt Mental Health Helpline):** 14416 (24x7 Toll-Free)
  - **Vandrevala Foundation:** 9999 666 555
  - **KIRAN Helpline:** 1800-599-0019`,
      timestamp: now,
      category: "emotional",
      quickActions: [
        { label: "👥 Talk to Trusted Contacts", actionType: "NAVIGATE_CONTACTS" },
        { label: "📞 Tele-MANAS (14416)", actionType: "DIAL_14416" },
      ],
    };
  }

  // Default General Guidance
  return {
    id: "sakhi_" + Date.now(),
    sender: "sakhi",
    text: `👋 I am **Cyber Sakhi**, your AI safety companion.

I can help you with:
- 🧠 **Threat Analysis:** Paste any suspicious message to check risk level and legal violations.
- 🚨 **Emergency SOS:** Fast silent dispatch to trusted contacts with live location.
- 🔒 **Evidence Locker:** Secure screenshots & chats with tamper-proof SHA-256 hashes.
- ⚖️ **Legal Guidance:** Information on Indian IT Act & BNS/IPC sections for digital harassment.
- 📞 **Helpline Directory:** Direct connect with 112, 1091, and 1930.

How can I assist you right now? Feel free to ask any question or paste a message!`,
    timestamp: now,
    category: "general",
    quickActions: [
      { label: "🧠 Check a Message", actionType: "NAVIGATE_DETECTOR" },
      { label: "🚨 VoiceShield SOS", actionType: "NAVIGATE_SOS" },
      { label: "🔒 Evidence Locker", actionType: "NAVIGATE_LOCKER" },
    ],
  };
}