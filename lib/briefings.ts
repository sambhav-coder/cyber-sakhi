export interface CyberSafetyBrief {
  id: string;
  headline: string;
  tag: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  summary: string;
}

export const cyberSafetyBriefings: CyberSafetyBrief[] = [
  {
    id: "brief-phishing",
    headline: "Fake Bank Login Page Drains ₹87,000 in 3 Minutes",
    tag: "Phishing",
    source: "Cyber Sakhi Safety Desk",
    sourceUrl: "https://cybercrime.gov.in",
    publishedAt: "September 2026",
    summary:
      "An SMS claimed her SBI account was frozen. The link opened a near-perfect copy of the bank login page and, after she entered card details, CVV and OTP, ₹87,000 was gone within minutes. Banks never request OTP, CVV or PIN over SMS or phone.",
  },
  {
    id: "brief-sextortion",
    headline: "Instagram DM Morphed-Photo Blackmail: Do Not Pay",
    tag: "Blackmail",
    source: "Cyber Sakhi Safety Desk",
    sourceUrl: "https://cybercrime.gov.in",
    publishedAt: "August 2026",
    summary:
      "A fake profile threatened to send morphed images to a student's followers and family unless she paid ₹35,000 in Bitcoin within 4 hours. Paying almost never ends the extortion — screenshot everything, block, and report the offence under IT Act Sec 66E & 67A.",
  },
  {
    id: "brief-takeover",
    headline: "SIM Swap: Profile Hijack Across Instagram, WhatsApp & Gmail",
    tag: "Account Takeover",
    source: "Cyber Sakhi Safety Desk",
    sourceUrl: "https://cybercrime.gov.in",
    publishedAt: "August 2026",
    summary:
      "A duplicate SIM let an attacker silently reset every account linked to one phone number. Use authenticator-app 2FA — not SMS codes — and set a SIM-lock PIN with your mobile operator to block unauthorised SIM replacements.",
  },
  {
    id: "brief-upi",
    headline: "Fake Customer-Care '₹1 Refund' Led to ₹98,400 Loss",
    tag: "UPI Fraud",
    source: "Cyber Sakhi Safety Desk",
    sourceUrl: "https://cybercrime.gov.in",
    publishedAt: "July 2026",
    summary:
      "A 'delivery partner' convinced a buyer to enter ₹1 on UPI as a 'refund verification'. You never enter a UPI PIN to receive money — the request debited ₹98,400 the moment the PIN was entered. Report to 1930 instantly; early reports can reverse UPI fraud.",
  },
  {
    id: "brief-helpline",
    headline: "First-Hour Reporting Can Reverse UPI Fraud",
    tag: "Helpline",
    source: "Cyber Sakhi Safety Desk",
    sourceUrl: "https://cybercrime.gov.in",
    publishedAt: "Ongoing briefing",
    summary:
      "Dial 1930 within the first hour of a financial fraud — banks can often reverse UPI transfers reported this fast. Save screenshots and call logs to the Evidence Locker (SHA-256 hashed) before you call, and file the official report at cybercrime.gov.in.",
  },
];