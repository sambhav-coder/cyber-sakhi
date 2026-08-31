export type ThreatSeverity = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface LegalSection {
  code: string;
  title: string;
  penalty: string;
}

export interface ThreatAnalysisResult {
  id: string;
  text: string;
  timestamp: string;
  threatLevel: ThreatSeverity;
  score: number; // 0 - 100
  categories: string[];
  triggers: string[];
  legalSections: LegalSection[];
  recommendedActions: string[];
  summary: string;
  riskFactors: {
    blackmail: number;
    stalking: number;
    sexualHarassment: number;
    financialScam: number;
    hateSpeech: number;
    intimidation: number;
  };
}

export interface EvidenceItem {
  id: string;
  title: string;
  filename: string;
  fileType: string;
  fileSize: number;
  timestamp: string;
  sha256Hash: string;
  category: "HARASSMENT" | "BLACKMAIL" | "SCAM" | "STALKING" | "THREAT" | "OTHER";
  notes?: string;
  integrityVerified: boolean;
  simulatedIpfsCid: string;
  simulatedTxHash: string;
  dataUrl?: string;
}

export interface TrustedContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  isVerified: boolean;
  isPrimary: boolean;
  notifyWhatsApp: boolean;
  notifySms: boolean;
}

export interface SosEvent {
  id: string;
  timestamp: string;
  status: "ACTIVE" | "RESOLVED" | "SIMULATED";
  location: {
    lat: number;
    lng: number;
    address: string;
    accuracyMeters: number;
  };
  triggerMethod: "WAKE_WORD" | "BUTTON" | "SHAKE" | "SILENT_TAP";
  notifiedContacts: string[];
  audioEvidenceRecorded: boolean;
  audioDurationSeconds?: number;
}

export interface AdminIncident {
  id: string;
  caseCode: string;
  threatType: string;
  severity: ThreatSeverity;
  timestamp: string;
  status: "INVESTIGATING" | "ESCALATED_TO_CYBER_CELL" | "RESOLVED" | "FLAGGED";
  region: string;
  confidenceScore: number;
  anonymizedUserId: string;
}
