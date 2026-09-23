import { describe, expect, it } from "vitest";
import { evidenceToBrief, evidenceBriefText } from "../../lib/evidenceBrief";
import type { EvidenceRow } from "../../lib/db/types";

const SECRET_SHA =
  "abc123def45678901234567890abcdefabcdefabcdefabcdefabcdefabcdefabcd";

const base: EvidenceRow = {
  id: "e1",
  case_id: null,
  uploaded_by: null,
  title: "Suspicious invoice.pdf",
  filename: null,
  file_path: null,
  mime_type: "application/pdf",
  file_size: 2048,
  sha256: SECRET_SHA,
  source: null,
  description: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  encrypted_content: null,
  encryption_iv: null,
  encrypted_size: null,
  category: "document",
  evidence_code: "EV-2026-000001",
  lock_method: null,
  lock_version: null,
  kdf: null,
  kdf_salt: null,
  kdf_iterations: null,
  kdf_params: null,
  wrapped_key: null,
  wrapped_key_iv: null,
  verifier_wrapped: null,
  verifier_iv: null,
  verifier_sha: null,
  lock_metadata: null,
  blockchain_anchor_id: null,
};

describe("evidence briefs — locked metadata never leaks to chat context", () => {
  it("unlocked evidence exposes title + hash and reads as unlocked", () => {
    const brief = evidenceToBrief(base);
    expect(brief.isLocked).toBe(false);
    expect(brief.title).toBe("Suspicious invoice.pdf");
    expect(brief.sha256).toBe(SECRET_SHA);
    expect(brief.protectedNote).toBeNull();

    const text = evidenceBriefText(brief);
    expect(text).toContain("EV-2026-000001");
    expect(text).toContain("unlocked");
    expect(text).toContain("Suspicious invoice");
  });

  it("crypto-locked evidence hides title and hash entirely", () => {
    const locked: EvidenceRow = {
      ...base,
      wrapped_key: "ciphertext",
      lock_method: "aes-256-gcm",
    };
    const brief = evidenceToBrief(locked);
    expect(brief.isLocked).toBe(true);
    expect(brief.title).toBeNull();
    expect(brief.sha256).toBeNull();
    expect(brief.protectedNote).toContain("Locked");

    const text = evidenceBriefText(brief);
    expect(text).toContain("LOCKED");
    expect(text).not.toContain("Suspicious invoice");
    expect(text).not.toContain(SECRET_SHA);
    expect(text).toContain("protected item");
  });

  it("lock metadata flag (meta.locked) alone triggers redaction", () => {
    const brief = evidenceToBrief({ ...base, metadata: { locked: true } });
    expect(brief.isLocked).toBe(true);
    expect(brief.title).toBeNull();
    expect(brief.sha256).toBeNull();
  });
});