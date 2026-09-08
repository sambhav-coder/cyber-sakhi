import type { UserRole } from "@/lib/authTypes";
import type { EmailAnalysisResult } from "@/lib/emailTypes";
import type {
  EvidenceItem,
  ThreatSeverity,
  TrustedContact,
} from "@/lib/types";

/**
 * Assumed existing table shapes (tables are not created by this layer).
 * Column names follow snake_case conventions implied by the app models.
 * profiles reads also accept `full_name` if `name` is absent.
 */
export type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string | null;
  image: string | null;
  sakhi_number: string | null;
  created_at: string;
};

export type CaseRow = {
  id: string;
  user_id: string;
  case_code: string | null;
  title: string | null;
  status: string | null;
  threat_type: string | null;
  severity: ThreatSeverity | string | null;
  created_at: string;
};

export type EmailInvestigationRow = {
  id: string;
  user_id: string;
  case_id: string | null;
  subject: string | null;
  threat_level: string | null;
  threat_score: number | null;
  analysis: EmailAnalysisResult | Record<string, unknown>;
  created_at: string;
};

export type EvidenceRow = {
  id: string;
  user_id: string;
  case_id: string | null;
  title: string;
  filename: string;
  file_type: string;
  file_size: number;
  sha256_hash: string;
  category: EvidenceItem["category"] | string;
  notes: string | null;
  integrity_verified: boolean;
  simulated_ipfs_cid: string | null;
  simulated_tx_hash: string | null;
  encrypted_content: string | null;
  encryption_iv: string | null;
  encrypted_size: number | null;
  created_at: string;
};

export type ChainOfCustodyRow = {
  id: string;
  evidence_id: string;
  action: string;
  actor_id: string | null;
  notes: string | null;
  previous_hash: string | null;
  event_hash: string | null;
  hash: string | null; // Legacy field for backwards compatibility
  created_at: string;
};

export type IndicatorRow = {
  id: string;
  investigation_id: string | null;
  case_id: string | null;
  type: string;
  value: string;
  malicious: boolean | null;
  confidence: number | null;
  created_at: string;
};

export type ReportRow = {
  id: string;
  user_id: string;
  case_id: string | null;
  title: string;
  content: string | null;
  created_at: string;
};

export type TrustedContactRow = {
  id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  is_verified: boolean;
  is_primary: boolean;
  notify_whatsapp: boolean;
  notify_sms: boolean;
  created_at: string;
};

export type NewTrustedContact = Omit<TrustedContact, "id"> & {
  userId: string;
};
