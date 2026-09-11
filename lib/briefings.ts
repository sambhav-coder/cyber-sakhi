export type BriefSourceType = "news" | "government" | "advisory" | "report";

export interface CyberSafetyBrief {
  id: string;
  category: string;
  headline: string;
  date: string;
  source: string;
  sourceType: BriefSourceType;
  summary: string;
  url: string;
  lead?: boolean;
}

export const cyberSafetyBriefings: CyberSafetyBrief[] = [
  {
    id: "bengaluru-digital-arrest",
    category: "Digital arrest",
    headline:
      "Bengaluru woman's accounts drained of ₹24 crore over a 5-month 'digital arrest'",
    date: "24 May 2026",
    source: "India Today",
    sourceType: "news",
    lead: true,
    summary:
      "Fraudsters posing as law-enforcement officers investigating a fictitious money-laundering case kept an elderly Bengaluru woman under 'digital arrest' from January to May, progressively extracting ₹24 crore. The racket was uncovered when a bank manager alerted police as she tried to pledge 1.3 kg of gold for more cash; five suspects have been arrested.",
    url: "https://www.indiatoday.in/cities/bengaluru/story/digital-arrest-scam-bengaluru-woman-loses-rs-24-crore-2916265-2026-05-24",
  },
  {
    id: "uttarakhand-digital-arrest",
    category: "Digital arrest",
    headline: "Senior citizen duped of ₹1.20 crore in 'digital arrest'; accused arrested",
    date: "7 September 2026",
    source: "The New Indian Express",
    sourceType: "news",
    summary:
      "Uttarakhand STF arrested a man from West Bengal's Malda district for allegedly letting his bank account route the proceeds of a fraud in which an Almora woman was held on WhatsApp calls for nearly 12 days and threatened with prosecution over a fake money-laundering case before transferring ₹1,20,18,000.",
    url: "https://www.newindianexpress.com/india/2026/Sep/07/senior-citizen-duped-of-rs-120-crore-in-digital-arrest-in-uttarakhand-accused-arrested",
  },
  {
    id: "lucknow-sim-swap",
    category: "SIM swap / UPI fraud",
    headline: "Man loses over ₹8 lakh in cyber fraud",
    date: "15 April 2026",
    source: "The Times of India",
    sourceType: "news",
    summary:
      "A Lucknow resident had ₹8.82 lakh siphoned from four bank accounts after fraudsters used his Aadhaar-linked identity and a duplicate SIM to open a fraudulent UPI profile. Officials suspect a SIM swap and warn that a sudden 'no network' can signal it, urging reporting to 1930 and cybercrime.gov.in.",
    url: "https://timesofindia.indiatimes.com/city/lucknow/man-loses-over-8-lakh-in-cyber-fraud/articleshow/130268394.cms",
  },
];