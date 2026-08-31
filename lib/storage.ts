import { EvidenceItem, TrustedContact, SosEvent, AdminIncident, ThreatAnalysisResult } from "./types";

const CONTACTS_KEY = "cyber_sakhi_contacts";
const EVIDENCE_KEY = "cyber_sakhi_evidence";
const SOS_EVENTS_KEY = "cyber_sakhi_sos_events";
const SCAN_HISTORY_KEY = "cyber_sakhi_scans";

export const DEFAULT_CONTACTS: TrustedContact[] = [
  {
    id: "c1",
    name: "Sunita Sharma (Mother)",
    relationship: "Mother",
    phone: "+91 98765 43210",
    email: "sunita.sharma@example.com",
    isVerified: true,
    isPrimary: true,
    notifyWhatsApp: true,
    notifySms: true,
  },
  {
    id: "c2",
    name: "Ananya Roy (Best Friend)",
    relationship: "Friend",
    phone: "+91 98111 22334",
    email: "ananya.roy@example.com",
    isVerified: true,
    isPrimary: false,
    notifyWhatsApp: true,
    notifySms: true,
  },
  {
    id: "c3",
    name: "Rohan Verma (Brother)",
    relationship: "Brother",
    phone: "+91 99555 66778",
    email: "rohan.v@example.com",
    isVerified: true,
    isPrimary: false,
    notifyWhatsApp: true,
    notifySms: false,
  },
];

export const DEFAULT_EVIDENCE: EvidenceItem[] = [
  {
    id: "ev_1",
    title: "Instagram DM Extortion Threat",
    filename: "insta_threat_screenshot_0826.png",
    fileType: "image/png",
    fileSize: 482910,
    timestamp: "2026-08-26T14:32:00.000Z",
    sha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    category: "BLACKMAIL",
    notes: "Sender demanded ₹25,000 within 2 hours or threatened to distribute morph photos to college contacts.",
    integrityVerified: true,
    simulatedIpfsCid: "bafybeic7v3p5p3x8n6f5r8q2l7m6k4q2l7m6",
    simulatedTxHash: "0x7a29e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852",
  },
  {
    id: "ev_2",
    title: "Repeated WhatsApp Stalking Audio Note",
    filename: "voice_threat_whatsapp_0828.m4a",
    fileType: "audio/m4a",
    fileSize: 1245000,
    timestamp: "2026-08-28T22:15:00.000Z",
    sha256Hash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    category: "STALKING",
    notes: "Caller stated they were outside the building and demanded to meet alone.",
    integrityVerified: true,
    simulatedIpfsCid: "bafybeif9f86d081884c7d659a2feaa0c55ad01",
    simulatedTxHash: "0x4b822cd15d6c15b0f00a089f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b",
  },
];

export const DEFAULT_ADMIN_INCIDENTS: AdminIncident[] = [
  {
    id: "inc_101",
    caseCode: "CS-DEL-2026-8812",
    threatType: "Extortion & Blackmail (Morphing)",
    severity: "CRITICAL",
    timestamp: "2026-08-30T18:42:00Z",
    status: "ESCALATED_TO_CYBER_CELL",
    region: "Delhi NCR / North",
    confidenceScore: 96,
    anonymizedUserId: "USR-9924-ANON",
  },
  {
    id: "inc_102",
    caseCode: "CS-MUM-2026-4402",
    threatType: "Cyberstalking & Location Intimidation",
    severity: "HIGH",
    timestamp: "2026-08-30T21:10:00Z",
    status: "INVESTIGATING",
    region: "Mumbai Suburban",
    confidenceScore: 92,
    anonymizedUserId: "USR-3180-ANON",
  },
  {
    id: "inc_103",
    caseCode: "CS-BLR-2026-3021",
    threatType: "OTP & Financial Coercion",
    severity: "HIGH",
    timestamp: "2026-08-31T09:15:00Z",
    status: "RESOLVED",
    region: "Bengaluru Urban",
    confidenceScore: 89,
    anonymizedUserId: "USR-7712-ANON",
  },
  {
    id: "inc_104",
    caseCode: "CS-HYD-2026-1189",
    threatType: "Social Media Doxxing & Hate Speech",
    severity: "MEDIUM",
    timestamp: "2026-08-31T15:30:00Z",
    status: "FLAGGED",
    region: "Hyderabad Metro",
    confidenceScore: 78,
    anonymizedUserId: "USR-5541-ANON",
  },
  {
    id: "inc_105",
    caseCode: "CS-PUN-2026-9043",
    threatType: "Direct Bodily Harm / Threat Call",
    severity: "CRITICAL",
    timestamp: "2026-08-31T23:05:00Z",
    status: "ESCALATED_TO_CYBER_CELL",
    region: "Pune Central",
    confidenceScore: 98,
    anonymizedUserId: "USR-8829-ANON",
  },
];

export function getStoredContacts(): TrustedContact[] {
  if (typeof window === "undefined") return DEFAULT_CONTACTS;
  const raw = localStorage.getItem(CONTACTS_KEY);
  if (!raw) {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(DEFAULT_CONTACTS));
    return DEFAULT_CONTACTS;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_CONTACTS;
  }
}

export function saveStoredContacts(contacts: TrustedContact[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export function getStoredEvidence(): EvidenceItem[] {
  if (typeof window === "undefined") return DEFAULT_EVIDENCE;
  const raw = localStorage.getItem(EVIDENCE_KEY);
  if (!raw) {
    localStorage.setItem(EVIDENCE_KEY, JSON.stringify(DEFAULT_EVIDENCE));
    return DEFAULT_EVIDENCE;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_EVIDENCE;
  }
}

export function saveStoredEvidence(evidence: EvidenceItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(EVIDENCE_KEY, JSON.stringify(evidence));
}

export function addEvidenceItem(item: EvidenceItem): void {
  const current = getStoredEvidence();
  const updated = [item, ...current];
  saveStoredEvidence(updated);
}

export function getStoredScanHistory(): ThreatAnalysisResult[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(SCAN_HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addScanHistoryItem(scan: ThreatAnalysisResult): void {
  if (typeof window === "undefined") return;
  const current = getStoredScanHistory();
  const updated = [scan, ...current.slice(0, 19)]; // keep latest 20
  localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(updated));
}
