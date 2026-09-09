import { analyzeMessage } from "./threatEngine";
import {
  DEFAULT_CONTACTS,
  DEFAULT_EVIDENCE,
  saveStoredContacts,
  saveStoredEvidence,
  saveStoredSosEvents,
} from "./storage";
import { SosEvent, ThreatAnalysisResult } from "./types";

/* ------------------------------------------------------------------ *
 * Demo dataset
 *
 * The dashboard never invents numbers. When there is nothing stored it
 * shows an empty state and offers this, so a walkthrough has data to
 * read without the charts lying about an empty account.
 *
 * The scans are produced by running the real threat engine over sample
 * messages, then backdating the timestamps, so scores, categories and
 * risk factors are genuine engine output rather than hand-written.
 * ------------------------------------------------------------------ */

const SCAN_HISTORY_KEY = "cyber_sakhi_scans";

interface SampleMessage {
  text: string;
  daysAgo: number;
  hour: number;
}

const SAMPLE_MESSAGES: SampleMessage[] = [
  {
    text: "Send me your OTP right now or I will leak your private photos to your whole college group.",
    daysAgo: 0,
    hour: 21,
  },
  {
    text: "I know where you live. I saw you leave the hostel at 8. Meet me alone tonight.",
    daysAgo: 1,
    hour: 23,
  },
  {
    text: "Pay 25000 rupees within 2 hours or the morphed pictures go to your father.",
    daysAgo: 2,
    hour: 19,
  },
  {
    text: "Your KYC is expired. Share your bank OTP and CVV immediately to avoid account block.",
    daysAgo: 3,
    hour: 12,
  },
  {
    text: "Why are you ignoring me? I have been waiting outside your class for two hours.",
    daysAgo: 5,
    hour: 16,
  },
  {
    text: "Congratulations, you have won a lottery of 10 lakh. Click this link and pay the processing fee.",
    daysAgo: 6,
    hour: 11,
  },
  {
    text: "Hi, are we still meeting for the group project submission tomorrow at 4pm?",
    daysAgo: 7,
    hour: 15,
  },
  {
    text: "Stop posting online or I will make sure everyone sees what you did.",
    daysAgo: 9,
    hour: 22,
  },
  {
    text: "Thanks for sending the notes, they were really helpful for the exam.",
    daysAgo: 11,
    hour: 10,
  },
  {
    text: "I have your number, your address and your sister name. Do not test me.",
    daysAgo: 12,
    hour: 20,
  },
];

function backdate(daysAgo: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}

function buildScans(): ThreatAnalysisResult[] {
  return SAMPLE_MESSAGES.map((sample, i) => {
    const result = analyzeMessage(sample.text);
    return {
      ...result,
      id: `scan_demo_${i}`,
      timestamp: backdate(sample.daysAgo, sample.hour),
    };
  }).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

function buildSosEvents(): SosEvent[] {
  return [
    {
      id: "sos_demo_1",
      timestamp: backdate(1, 23),
      status: "RESOLVED",
      location: {
        lat: 28.6139,
        lng: 77.209,
        address: "Connaught Place, Central Delhi, Delhi 110001",
        accuracyMeters: 12,
      },
      triggerMethod: "WAKE_WORD",
      notifiedContacts: ["c1", "c2", "c3"],
      audioEvidenceRecorded: true,
      audioDurationSeconds: 94,
    },
    {
      id: "sos_demo_2",
      timestamp: backdate(8, 18),
      status: "SIMULATED",
      location: {
        lat: 28.5449,
        lng: 77.1926,
        address: "Hauz Khas Village, South Delhi, Delhi 110016",
        accuracyMeters: 18,
      },
      triggerMethod: "BUTTON",
      notifiedContacts: ["c1"],
      audioEvidenceRecorded: false,
    },
  ];
}

/** Overwrites every local record with the walkthrough dataset. */
export function seedDemoDataset(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(buildScans()));
  saveStoredSosEvents(buildSosEvents());
  saveStoredEvidence(DEFAULT_EVIDENCE);
  saveStoredContacts(DEFAULT_CONTACTS);
}

/** Wipes every local record so the dashboard drops back to its empty state. */
export function clearAllLocalData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SCAN_HISTORY_KEY);
  localStorage.removeItem("cyber_sakhi_sos_events");
  localStorage.setItem("cyber_sakhi_evidence", JSON.stringify([]));
  localStorage.setItem("cyber_sakhi_contacts", JSON.stringify([]));
}
