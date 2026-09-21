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

export interface EvidenceLockEnvelope {
  lockMethod: string;
  lockVersion: number;
  kdf: string;
  kdfSalt: string;
  kdfIterations: number;
  kdfParams: Record<string, unknown>;
  wrappedKey: string;
  wrappedKeyIv: string;
  verifierWrapped: string;
  verifierIv: string;
}

export interface EvidenceAnchorView {
  anchorId: string | null;
  anchorType: string | null;
  anchorStatus:
    | "not_created"
    | "pending"
    | "confirmed"
    | "verified"
    | "failed"
    | "unavailable"
    | "digest_mismatch";
  txHash: string | null;
  blockNumber: number | null;
  networkName: string | null;
  chainId: string | null;
  digest: string | null;
  anchoredAt: string | null;
}

export interface EvidenceItem {
  id: string;
  title: string;
  filename: string;
  fileType: string;
  fileSize: number;
  timestamp: string;
  sha256Hash: string;
  /**
   * Server-authoritative SHA-256 of the stored evidence bytes (see
   * lib/evidenceDigest). Present when the server could hash actual content;
   * used for blockchain anchoring, never the client-supplied sha256Hash.
   */
  integrityDigest?: string;
  category: "HARASSMENT" | "BLACKMAIL" | "SCAM" | "STALKING" | "THREAT" | "OTHER";
  notes?: string;
  integrityVerified: boolean;
  /** True when the original content is stored encrypted (AES-256-GCM). */
  encrypted: boolean;
  /** Human-facing vault reference, e.g. EV-2026-XXXXXXXX. */
  evidenceCode: string;
  /** Persisted lock state: locked evidence cannot be modified or deleted. */
  locked: boolean;
  lockedAt?: string | null;
  caseId?: string | null;
  caseNumber?: string | null;
  /** Number of recorded chain-of-custody events for this artifact. */
  custodyCount?: number;
  dataUrl?: string;
  /** True when crypto lock material exists (password/key lock, not just soft). */
  hasLockMaterial?: boolean;
  /** Client-side lock envelope (kdf params, wrapped key, verifier) — only when hasLockMaterial && locked. */
  lockEnvelope?: EvidenceLockEnvelope | null;
  /** Blockchain anchor status for this evidence item. */
  anchor?: EvidenceAnchorView | null;
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
