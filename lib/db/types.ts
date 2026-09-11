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
 * The profiles table stores the display name in `full_name` and roles
 * in lowercase (`user` / `admin`). There is no `name` or `image` column.
 */
export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  password_hash: string | null;
  sakhi_number: string | null;
  age: string | null;
  city: string | null;
  phone: string | null;
  created_at: string;
};

export type CaseRow = {
  id: string;
  case_number: string | null;
  title: string | null;
  description: string | null;
  threat_type: string | null;
  status: string | null;
  severity: ThreatSeverity | string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type EmailInvestigationRow = {
  id: string;
  case_id: string | null;
  created_by: string | null;
  source: string | null;
  external_message_id: string | null;
  subject: string | null;
  sender: string | null;
  recipients: unknown | null;
  risk_score: number | null;
  verdict: string | null;
  headers: unknown | null;
  analysis: EmailAnalysisResult | Record<string, unknown> | null;
  created_at: string;
};

export type EvidenceRow = {
  id: string;
  case_id: string | null;
  uploaded_by: string | null;
  title: string;
  filename: string | null;
  file_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  sha256: string | null;
  source: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  encrypted_content: string | null;
  encryption_iv: string | null;
  encrypted_size: number | null;
  category: string | null;
  evidence_code: string | null;
  /* Hardening: password/key-protected lock material (step 3 hardening) */
  lock_method: string | null;
  lock_version: number | null;
  kdf: string | null;
  kdf_salt: string | null;
  kdf_iterations: number | null;
  kdf_params: Record<string, unknown> | null;
  wrapped_key: string | null;
  wrapped_key_iv: string | null;
  verifier_wrapped: string | null;
  verifier_iv: string | null;
  verifier_sha: string | null;
  lock_metadata: Record<string, unknown> | null;
  blockchain_anchor_id: string | null;
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
  source: string | null;
  details: unknown | null;
  created_at: string;
};

export type ReportRow = {
  id: string;
  case_id: string | null;
  generated_by: string | null;
  title: string;
  report_type: string | null;
  file_path: string | null;
  report_data: Record<string, unknown> | null;
  created_at: string;
};

export type CaseChatMessageRow = {
  id: string;
  case_id: string;
  author_id: string | null;
  role: "user" | "sakhi";
  content: string;
  created_at: string;
};

export type AdminCaseOverviewRow = {
  case_number: string | null;
  threat_type: string | null;
  status: string | null;
  severity: string | null;
  created_at: string;
  updated_at: string | null;
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

export type SakhiLanguage = "en" | "hi" | "hinglish";

export type SakhiConversationRow = {
  id: string;
  owner_id: string;
  title: string;
  language: SakhiLanguage;
  case_id: string | null;
  evidence_codes: unknown;
  created_at: string;
  updated_at: string;
};

export type SakhiMessageRole = "user" | "sakhi" | "system";

export type SakhiMessageRow = {
  id: string;
  conversation_id: string;
  role: SakhiMessageRole;
  content: string;
  attachment_meta: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type SakhiMemoryKind = "preference" | "fact" | "session";

export type SakhiMemoryRow = {
  id: string;
  owner_id: string;
  key: string;
  value: string;
  kind: SakhiMemoryKind | string;
  sensitive: boolean;
  created_at: string;
  updated_at: string;
};
