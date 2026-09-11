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

/**
 * No sample evidence ships with the app. The vault must never populate
 * itself with fabricated artifacts — the first-time state is genuinely
 * empty until the user uploads their own evidence.
 */
export const DEFAULT_EVIDENCE: EvidenceItem[] = [];

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
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(EVIDENCE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
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

const PROFILE_DRAFT_KEY = "cyber_sakhi_profile_draft";

export interface ExtendedProfileDraft {
  age?: string;
  city?: string;
  phone?: string;
}

export function getStoredProfileDraft(): ExtendedProfileDraft {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(PROFILE_DRAFT_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ExtendedProfileDraft;
  } catch {
    return {};
  }
}

export function saveStoredProfileDraft(draft: ExtendedProfileDraft): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(draft));
}



/* ------------------------------------------------------------------ *
 * SOS event log.
 *
 * SOS_EVENTS_KEY was declared above but never read or written, so the
 * emergency half of the dashboard had no data source. These are the
 * accessors for it. Newest first, capped at 30 records.
 * ------------------------------------------------------------------ */

export function getStoredSosEvents(): SosEvent[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(SOS_EVENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredSosEvents(events: SosEvent[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOS_EVENTS_KEY, JSON.stringify(events));
}

export function addSosEvent(event: SosEvent): void {
  if (typeof window === "undefined") return;
  const current = getStoredSosEvents();
  saveStoredSosEvents([event, ...current.slice(0, 29)]);
}
