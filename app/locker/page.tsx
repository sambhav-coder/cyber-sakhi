"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Lock,
  LockOpen,
  UploadCloud,
  FileText,
  FileCheck2,
  Trash2,
  Copy,
  Download,
  ShieldCheck,
  Eye,
  Search,
  Filter,
  Loader2,
  KeyRound,
  ShieldAlert,
  Fingerprint,
  ScrollText,
  Database,
  Link2,
  Unlink,
  CheckCircle2,
  AlertTriangle,
  X,
  HardDrive,
  KeySquare,
  Radar,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { EvidenceItem } from "@/lib/types";
import { formatBytes } from "@/lib/cryptoUtils";
import {
  encryptData,
  decryptData,
  encryptedDataToBase64,
  base64ToEncryptedData,
  computeSha256 as computeIntegrityHash,
} from "@/lib/encryption";
import {
  getOrCreateSessionKey,
  getSessionKey,
  hasSessionKey,
} from "@/lib/sessionKey";
import {
  deriveKek,
  aesWrap,
  aesUnwrap,
  generateDek,
  exportKeyBytes,
  importKeyBytes,
  generateSecurityKey,
  generateSalt,
  generateVerifier,
  sha256Hex,
  kdfIdentifier,
  defaultKdfIterations,
  lockCryptoVersion,
} from "@/lib/lockCrypto";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import {
  MAX_EVIDENCE_BYTES,
  ACCEPT_ATTRIBUTE,
  EVIDENCE_CATEGORIES,
} from "@/lib/evidenceConstants";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

interface IntegrityProviderStatus {
  key: string;
  label: string;
  status: "active" | "unavailable" | "degraded";
}

interface SystemStatus {
  integrityProvider: IntegrityProviderStatus;
  blockchainAnchor: IntegrityProviderStatus;
}

interface CaseOption {
  id: string;
  case_number: string | null;
  title: string | null;
}

interface ChainEvent {
  id: string;
  action: string;
  notes: string | null;
  actor_id: string | null;
  event_hash: string | null;
  created_at: string;
}

interface ChainVerification {
  isValid: boolean;
  errors: string[];
  verifiedEventCount: number;
  totalEventCount: number;
  schemaVersion: string;
}

interface DetailsState {
  loading: boolean;
  decrypting: boolean;
  verifying: boolean;
  error: string | null;
  sessionKeyAvailable: boolean | null;
  isEncrypted: boolean;
  decryptedBytes: Uint8Array | null;
  integrityStatus: "idle" | "verifying" | "verified" | "failed" | "unencrypted";
  previewUrl: string | null;
  chainEvents: ChainEvent[];
  chainVerification: ChainVerification | null;
  integrityProviderLabel: string | null;
  blockchainAnchorLabel: string | null;
}

const EMPTY_DETAILS: DetailsState = {
  loading: false,
  decrypting: false,
  verifying: false,
  error: null,
  sessionKeyAvailable: null,
  isEncrypted: false,
  decryptedBytes: null,
  integrityStatus: "idle",
  previewUrl: null,
  chainEvents: [],
  chainVerification: null,
  integrityProviderLabel: null,
  blockchainAnchorLabel: null,
};

const FALLBACK_SYSTEM: SystemStatus = {
  integrityProvider: {
    key: "local-sha256-chain",
    label: "Local Crypto Chain (SHA-256 anchored)",
    status: "active",
  },
  blockchainAnchor: {
    key: "blockchain-anchor",
    label: "Blockchain Anchor Registry",
    status: "unavailable",
  },
};

function uint8ArrayToBlob(bytes: Uint8Array, fileType: string): Blob {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes, 0);
  return new Blob([copy.buffer as ArrayBuffer], {
    type: fileType || "application/octet-stream",
  });
}

function bytesToBase64Client(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function recordCustodyEvent(
  evidenceId: string,
  action: string,
  notes?: string
): Promise<boolean> {
  return fetch("/api/chain-of-custody", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evidenceId, action, notes }),
  })
    .then((r) => r.ok)
    .catch(() => false);
}

/* ----------------------------- small bits ----------------------------- */

function StatusPill({
  tone,
  children,
}: {
  tone: "green" | "amber" | "red" | "slate";
  children: React.ReactNode;
}) {
  const tones = {
    green:
      "bg-emerald-950/60 text-emerald-300 border-emerald-700/60",
    amber: "bg-amber-950/50 text-amber-300 border-amber-700/60",
    red: "bg-red-950/50 text-red-300 border-red-800/70",
    slate: "bg-slate-900 text-slate-300 border-slate-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------- integrity status console ---------------------- */

function ConsoleNode({
  icon: Icon,
  title,
  status,
  detail,
}: {
  icon: React.ElementType;
  title: string;
  status: "active" | "unavailable";
  detail: string;
}) {
  const active = status === "active";
  return (
    <div className="flex flex-col items-center gap-2 text-center min-w-0">
      <div className="relative">
        {active ? (
          <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping-slow" />
        ) : (
          <span className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping-slow" />
        )}
        <div
          className={cn(
            "relative w-9 h-9 rounded-xl flex items-center justify-center border",
            active
              ? "bg-emerald-950/60 border-emerald-600/50 text-emerald-300"
              : "bg-amber-950/50 border-amber-600/40 text-amber-300"
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
        {title}
      </div>
      <div className="text-[9px] leading-tight font-mono text-slate-500 max-w-[110px]">
        {detail}
      </div>
    </div>
  );
}

function LinkDots() {
  return (
    <div className="flex items-center gap-1 self-center">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-emergency-500/70"
          style={{ animation: `pulse 1.6s ease-in-out ${i * 0.18}s infinite` }}
        />
      ))}
    </div>
  );
}

/* ------------------------------ main page ------------------------------ */

export default function EvidenceLockerPage() {
  const { data: session } = useSession();

  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Upload form
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] =
    useState<EvidenceItem["category"]>("HARASSMENT");
  const [newNotes, setNewNotes] = useState("");
  const [attachCaseId, setAttachCaseId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);

  // Details modal
  const [detailsItem, setDetailsItem] = useState<EvidenceItem | null>(null);
  const [details, setDetails] = useState<DetailsState>({ ...EMPTY_DETAILS });
  const [associateCaseId, setAssociateCaseId] = useState<string>("");

  // Confirmation modal
  const [confirm, setConfirm] = useState<{
    kind: "delete" | "lock" | "unlock";
    item: EvidenceItem;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Crypto lock/unlock modal (password/key-protected lock)
  const [lockModal, setLockModal] = useState<{
    mode: "lock" | "unlock";
    item: EvidenceItem;
  } | null>(null);
  const [lockMode, setLockMode] = useState<"password" | "security_key">(
    "password"
  );
  const [lockCredential, setLockCredential] = useState("");
  const [lockGeneratedKey, setLockGeneratedKey] = useState<string | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockSuccess, setLockSuccess] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Blockchain anchor state per evidence item
  const [anchorBusyId, setAnchorBusyId] = useState<string | null>(null);

  const showToast = useCallback(
    (kind: "success" | "error" | "info", text: string) => {
      setToast({ kind, text });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 5000);
    },
    []
  );

  const loadEvidence = useCallback(async () => {
    try {
      const res = await fetch("/api/evidence", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load evidence");
      }
      const data = await res.json();
      setEvidenceList(data.evidence || []);
      if (data.system) {
        // Enrich with the real EVM provider status (safe, read-only).
        try {
          const bcRes = await fetch("/api/blockchain/status", {
            cache: "no-store",
          });
          if (bcRes.ok) {
            const bc = await bcRes.json();
            setSystem({
              ...data.system,
              blockchainAnchor: {
                key: "blockchain-anchor-evm",
                label: bc.configured
                  ? `EVM Anchor (${bc.networkName || bc.chainId || "EVM"})`
                  : "Blockchain Anchor (EVM) — not configured",
                status: bc.configured ? "active" : "unavailable",
              },
            });
          } else {
            setSystem(data.system);
          }
        } catch {
          setSystem(data.system);
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load vault");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCases = useCallback(async () => {
    try {
      const res = await fetch("/api/cases", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCases((data.cases || data || []).map((c: any) => ({
          id: c.id,
          case_number: c.case_number ?? null,
          title: c.title ?? null,
        })));
      }
    } catch {
      // case association stays unavailable; uploads simply skip it
    }
  }, []);

  useEffect(() => {
    loadEvidence();
    loadCases();
  }, [loadEvidence, loadCases]);

  useEffect(() => {
    if (!detailsItem) {
      if (details.previewUrl) URL.revokeObjectURL(details.previewUrl);
      setDetails({ ...EMPTY_DETAILS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsItem]);

  const openDetails = async (item: EvidenceItem) => {
    // Crypto-locked artifacts cannot be opened directly — route to the unlock modal.
    if (item.locked && item.hasLockMaterial) {
      handleLockClick(item);
      return;
    }
    setDetailsItem(item);
    setDetails((prev) => ({ ...prev, loading: true, error: null }));
    setAssociateCaseId(item.caseId ?? "");

    const keyAvailable = hasSessionKey();
    let encryptedPayload: { ciphertext: string; iv: string } | null = null;

    try {
      const resp = await fetch(
        `/api/evidence?id=${encodeURIComponent(item.id)}`
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to retrieve evidence");
      }
      const payload = await resp.json();
      const ev = payload.evidence;
      encryptedPayload =
        ev.encryptedContent && ev.encryptionIv
          ? { ciphertext: ev.encryptedContent, iv: ev.encryptionIv }
          : null;

      setDetails((prev) => ({ ...prev, isEncrypted: !!encryptedPayload }));

      try {
        const chainResp = await fetch(
          `/api/chain-of-custody?evidenceId=${encodeURIComponent(
            item.id
          )}&verify=true`
        );
        if (chainResp.ok) {
          const chainData = await chainResp.json();
          setDetails((prev) => ({
            ...prev,
            chainEvents: chainData.events || [],
            chainVerification: chainData.verification || null,
            integrityProviderLabel:
              chainData.integrityProvider?.label || null,
            blockchainAnchorLabel: chainData.blockchainAnchor?.label || null,
          }));
        }
      } catch {
        // non-fatal
      }
    } catch (err: any) {
      setDetails((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Failed to load evidence details",
      }));
      await recordCustodyEvent(
        item.id,
        "VIEWED",
        "Evidence details opened (content not decrypted)"
      );
      return;
    }

    await recordCustodyEvent(item.id, "VIEWED", "Evidence details viewed in vault");

    if (!encryptedPayload) {
      setDetails((prev) => ({
        ...prev,
        loading: false,
        integrityStatus: "unencrypted",
        sessionKeyAvailable: keyAvailable,
      }));
      return;
    }

    if (!keyAvailable) {
      setDetails((prev) => ({
        ...prev,
        loading: false,
        sessionKeyAvailable: false,
        error:
          "This artifact is encrypted with a session key that is no longer available in this browser. Re-upload any evidence you need to decrypt after returning to this page. Metadata, hashes and custody history remain readable.",
      }));
      return;
    }

    const sessionKey = await getSessionKey();
    if (!sessionKey) {
      setDetails((prev) => ({
        ...prev,
        loading: false,
        sessionKeyAvailable: false,
        error: "Encryption session key is unavailable. Evidence cannot be decrypted.",
      }));
      return;
    }

    try {
      setDetails((prev) => ({ ...prev, decrypting: true, loading: true }));
      setDetails((prev) => ({ ...prev, sessionKeyAvailable: true }));
      const decrypted = await decryptData(
        base64ToEncryptedData(encryptedPayload),
        sessionKey
      );

      await recordCustodyEvent(
        item.id,
        "DECRYPTED",
        `Decrypted client-side for preview (${formatBytes(decrypted.byteLength)})`
      );

      setDetails((prev) => ({
        ...prev,
        decrypting: false,
        decryptedBytes: decrypted,
        verifying: true,
      }));

      const recomputed = await computeIntegrityHash(decrypted);
      const matches =
        recomputed.toLowerCase() === (item.sha256Hash || "").toLowerCase();

      if (matches) {
        await recordCustodyEvent(
          item.id,
          "INTEGRITY_VERIFIED",
          `Integrity verified: recomputed SHA-256 matches stored hash (${recomputed.substring(
            0,
            12
          )}...)`
        );
      } else {
        await recordCustodyEvent(
          item.id,
          "INTEGRITY_FAILED",
          `Integrity FAILED: expected ${(item.sha256Hash || "").substring(
            0,
            12
          )}..., got ${recomputed.substring(0, 12)}...`
        );
      }

      const url = URL.createObjectURL(
        uint8ArrayToBlob(decrypted, item.fileType)
      );

      setDetails((prev) => ({
        ...prev,
        loading: false,
        verifying: false,
        integrityStatus: matches ? "verified" : "failed",
        previewUrl: url,
      }));
    } catch (decryptErr: any) {
      setDetails((prev) => ({
        ...prev,
        loading: false,
        decrypting: false,
        verifying: false,
        error:
          decryptErr?.message ||
          "Decryption failed. The ciphertext, session key, or stored IV may be invalid.",
      }));
    }
  };

  const closeDetails = () => {
    if (details.previewUrl) URL.revokeObjectURL(details.previewUrl);
    setDetailsItem(null);
    setDetails({ ...EMPTY_DETAILS });
  };

  const verifyIntegrity = async (item: EvidenceItem) => {
    const k = hasSessionKey();
    let payload: { ciphertext: string; iv: string } | null = null;
    try {
      const resp = await fetch(`/api/evidence?id=${encodeURIComponent(item.id)}`);
      if (!resp.ok) throw new Error(await resp.text());
      const ev = (await resp.json()).evidence;
      if (ev.encryptedContent && ev.encryptionIv) {
        payload = { ciphertext: ev.encryptedContent, iv: ev.encryptionIv };
      }
    } catch {
      showToast("error", "Could not retrieve this artifact from the vault.");
      return;
    }

    if (!payload) {
      showToast(
        "info",
        "Metadata-only artifact: its SHA-256 fingerprint was recorded at upload, but there is no encrypted content to recompute in this session."
      );
      return;
    }
    if (!k) {
      showToast(
        "error",
        "Session encryption key is unavailable — integrity can only be re-verified by the session that created this artifact."
      );
      await recordCustodyEvent(item.id, "VIEWED", "Integrity re-check attempted without session key");
      return;
    }
    const sessionKey = await getSessionKey();
    if (!sessionKey) {
      showToast("error", "Session encryption key is unavailable.");
      return;
    }

    try {
      const decrypted = await decryptData(
        base64ToEncryptedData(payload),
        sessionKey
      );
      const recomputed = await computeIntegrityHash(decrypted);
      const matches =
        recomputed.toLowerCase() === (item.sha256Hash || "").toLowerCase();
      const status = matches ? "INTEGRITY_VERIFIED" : "INTEGRITY_FAILED";
      await recordCustodyEvent(
        item.id,
        status,
        matches
          ? `Integrity verified: recomputed SHA-256 matches stored hash (${recomputed.substring(
              0,
              12
            )}...)`
          : `Integrity FAILED: hash mismatch (${recomputed.substring(0, 12)}...)`
      );
      showToast(
        matches ? "success" : "error",
        matches
          ? "Integrity verified — recomputed SHA-256 matches the stored fingerprint."
          : "Integrity check FAILED — the recomputed hash does not match the stored fingerprint."
      );
    } catch (err: any) {
      showToast(
        "error",
        err?.message || "Integrity check could not be completed."
      );
    }
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    if (selectedFile.size > MAX_EVIDENCE_BYTES) {
      setUploadError(
        `File is ${formatBytes(selectedFile.size)} — the Evidence Locker accepts files up to 25 MB.`
      );
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadStatus("Generating encryption session key...");

    try {
      const sessionKey = await getOrCreateSessionKey();
      setUploadStatus("Hashing original content (SHA-256)...");

      const buffer = await selectedFile.arrayBuffer();
      const sha256 = await computeIntegrityHash(new Uint8Array(buffer));

      setUploadStatus("Encrypting with AES-256-GCM...");
      const encryptedData = await encryptData(
        new Uint8Array(buffer),
        sessionKey
      );
      const encryptedPayload = encryptedDataToBase64(encryptedData);

      setUploadStatus("Uploading encrypted artifact to the vault...");
      const response = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim() || selectedFile.name,
          filename: selectedFile.name,
          fileType: selectedFile.type || "application/octet-stream",
          fileSize: selectedFile.size,
          sha256Hash: sha256,
          category: newCategory,
          notes:
            newNotes.trim() ||
            "Uploaded manually to Cyber Sakhi Secure Vault.",
          encryptedContent: encryptedPayload.ciphertext,
          encryptionIv: encryptedPayload.iv,
          encryptedSize: encryptedPayload.ciphertext.length,
          ...(attachCaseId ? { caseId: attachCaseId } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to upload evidence" }));
        throw new Error(errorData.error || "Failed to upload evidence");
      }

      const result = await response.json();
      await recordCustodyEvent(
        result.evidence.id,
        "INTEGRITY_VERIFIED",
        `SHA-256 integrity fingerprint recorded at upload: ${sha256.substring(
          0,
          16
        )}...`
      );

      const msg =
        result.custodyErrors && result.custodyErrors.length > 0
          ? "Evidence sealed in the vault (some custody events could not be recorded)."
          : "Evidence sealed in the vault with end-to-end encryption and a SHA-256 fingerprint.";
      showToast("success", msg);

      setSelectedFile(null);
      setNewTitle("");
      setNewNotes("");
      setAttachCaseId("");
      setUploadStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadEvidence();
    } catch (err) {
      console.error("Evidence upload error:", err);
      setUploadError(
        err instanceof Error ? err.message : "Failed to upload evidence"
      );
    } finally {
      setUploadStatus(null);
      setIsUploading(false);
    }
  };

  const handleLockToggle = (kind: "lock" | "unlock", item: EvidenceItem) => {
    setConfirm({ kind, item });
  };

  /** Route lock/unlock actions to the crypto modal or legacy confirm path. */
  const handleLockClick = (item: EvidenceItem) => {
    if (item.locked) {
      // Crypto-locked → use the protected unlock modal.
      if (item.hasLockMaterial) {
        setLockModal({ mode: "unlock", item });
        setLockMode("password");
        setLockCredential("");
        setLockError(null);
        setLockSuccess(null);
        setLockGeneratedKey(null);
        return;
      }
      // Legacy soft-lock (no material) → keep the PATCH unlock flow.
      handleLockToggle("unlock", item);
      return;
    }
    // Not locked → open the crypto lock modal (real password/key protection).
    setLockModal({ mode: "lock", item });
    setLockMode("password");
    setLockCredential("");
    setLockError(null);
    setLockSuccess(null);
    setLockGeneratedKey(null);
    setCopiedKey(false);
  };

  /** Real cryptographic lock: wrap DEK + verifier, re-encrypt content, persist. */
  const persistCryptoLock = async () => {
    if (!lockModal) return;
    const item = lockModal.item;
    const credential =
      lockMode === "security_key" && lockGeneratedKey
        ? lockGeneratedKey
        : lockCredential;

    if (!credential.trim()) {
      setLockError("Enter a password or use a generated security key.");
      return;
    }

    setLockBusy(true);
    setLockError(null);
    try {
      // 1) Retrieve the unlocked ciphertext (this evidence is currently unlocked).
      const resp = await fetch(`/api/evidence?id=${encodeURIComponent(item.id)}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to retrieve evidence");
      }
      const ev = (await resp.json()).evidence;
      if (!ev.encryptedContent || !ev.encryptionIv) {
        throw new Error(
          "This artifact has no stored ciphertext and cannot be password-protected. Only encrypted artifacts can be locked."
        );
      }

      const sessionKey = await getSessionKey();
      if (!sessionKey) {
        throw new Error(
          "Session encryption key is unavailable. Re-upload the artifact before locking."
        );
      }

      // 2) Decrypt with the session key, then generate a fresh per-evidence DEK.
      const plaintext = await decryptData(
        base64ToEncryptedData({
          ciphertext: ev.encryptedContent,
          iv: ev.encryptionIv,
        }),
        sessionKey
      );

      const dek = await generateDek();
      const dekBytes = new Uint8Array(await crypto.subtle.exportKey("raw", dek));

      // 3) Re-encrypt the content with the DEK (stored server-side).
      const reencrypted = await encryptData(plaintext, dek);
      const reencryptedPayload = encryptedDataToBase64(reencrypted);

      // 4) Derive a KEK from the credential via PBKDF2 and wrap the DEK + verifier.
      const salt = generateSalt();
      const iterations = defaultKdfIterations;
      const kek = await deriveKek(credential, salt, iterations);

      const wrappedKey = await aesWrap(kek, dekBytes);

      const { verifier, verifierSha } = await generateVerifier();
      const verifierBytes = new TextEncoder().encode(verifier);
      const wrappedVerifier = await aesWrap(kek, verifierBytes);

      // 5) Persist the lock envelope + re-encrypted content.
      const lockRes = await fetch(`/api/evidence/${item.id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: lockMode,
          lockVersion: lockCryptoVersion,
          kdf: kdfIdentifier,
          kdfSalt: salt,
          kdfIterations: iterations,
          kdfParams: {
            hash: "SHA-256",
            keyLength: 256,
            algorithm: "PBKDF2",
            iterations,
          },
          wrappedKey: wrappedKey.ciphertext,
          wrappedKeyIv: wrappedKey.iv,
          verifierWrapped: wrappedVerifier.ciphertext,
          verifierIv: wrappedVerifier.iv,
          verifierSha,
          reencryptedContent: reencryptedPayload.ciphertext,
          reencryptedIv: reencryptedPayload.iv,
          reencryptedSize: reencryptedPayload.ciphertext.length,
        }),
      });
      const lockData = await lockRes.json().catch(() => ({}));
      if (!lockRes.ok) {
        throw new Error(lockData.error || "Failed to lock evidence");
      }

      // 6) Report success. For security keys, surface the key for the user to keep.
      if (lockMode === "security_key") {
        setLockSuccess(
          `Evidence locked with a security key. Save it now — it is shown only once and never stored by the server.`
        );
      } else {
        setLockSuccess("Evidence is locked with your chosen password.");
        setLockModal(null);
      }

      await loadEvidence();
      showToast(
        "success",
        "Evidence cryptographically locked. Its content is now protected by your password or key."
      );
    } catch (err) {
      setLockError(err instanceof Error ? err.message : "Failed to lock evidence");
    } finally {
      setLockBusy(false);
    }
  };

  /** Real unlock: client unwraps verifier + DEK, authenticates, then decrypts content. */
  const persistCryptoUnlock = async () => {
    if (!lockModal) return;
    const item = lockModal.item;
    if (!lockCredential.trim()) {
      setLockError("Enter your password or security key.");
      return;
    }

    setLockBusy(true);
    setLockError(null);
    try {
      // 1) Fetch the masked locked envelope (salt, iterations, wrapped blobs).
      const resp = await fetch(`/api/evidence?id=${encodeURIComponent(item.id)}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to retrieve evidence");
      }
      const ev = (await resp.json()).evidence;
      const envelope =
        (ev as any).lockEnvelope ||
        (item.lockEnvelope as any) ||
        null;

      if (!envelope || !envelope.kdfSalt) {
        throw new Error(
          "This artifact has no lock credential — it was not cryptographically locked."
        );
      }

      // 2) Derive the KEK from the user's credential.
      const kek = await deriveKek(
        lockCredential,
        envelope.kdfSalt,
        envelope.kdfIterations || defaultKdfIterations
      );

      // 3) Unwrap the verifier. Wrong password → AES-GCM authentication failure.
      let verifier: Uint8Array;
      let dekBytes: Uint8Array;
      try {
        verifier = await aesUnwrap(
          kek,
          envelope.verifierWrapped,
          envelope.verifierIv
        );
        dekBytes = await aesUnwrap(kek, envelope.wrappedKey, envelope.wrappedKeyIv);
      } catch {
        setLockError("Incorrect password or key.");
        return;
      }
      const verifierText = new TextDecoder().decode(verifier);

      // 4) Authenticate with the server (records UNLOCKED + DECRYPTED custody events).
      const unlockRes = await fetch(`/api/evidence/${item.id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifier: verifierText }),
      });
      const unlockData = await unlockRes.json().catch(() => ({}));
      if (!unlockRes.ok) {
        setLockError(unlockData.error || "Failed to unlock evidence.");
        return;
      }

      const uev = unlockData.evidence;
      if (!uev.encryptedContent || !uev.encryptionIv) {
        throw new Error("Unlock succeeded but no ciphertext was returned.");
      }

      // 5) Decrypt with the unwrapped DEK and open the preview.
      const dek = await importKeyBytes(
        bytesToBase64Client(dekBytes)
      );
      const plaintext = await decryptData(
        base64ToEncryptedData({
          ciphertext: uev.encryptedContent,
          iv: uev.encryptionIv,
        }),
        dek
      );

      // Build the full in-memory item (session-only reveal; refresh re-locks).
      const unlockedItem: EvidenceItem = {
        id: item.id,
        title: uev.title || item.title,
        filename: uev.filename || item.filename,
        fileType: uev.fileType || "application/octet-stream",
        fileSize: uev.fileSize ?? 0,
        timestamp: item.timestamp,
        sha256Hash: uev.sha256Hash || "",
        category: (uev.category as EvidenceItem["category"]) || "OTHER",
        notes: uev.notes || undefined,
        integrityVerified: true,
        encrypted: true,
        evidenceCode: uev.evidenceCode || item.evidenceCode,
        locked: true, // stays server-locked; this is a session-only reveal
        lockedAt: item.lockedAt,
        caseId: item.caseId,
        caseNumber: item.caseNumber,
        custodyCount: item.custodyCount,
        hasLockMaterial: true,
        lockEnvelope: envelope,
        anchor: (item as any).anchor || null,
      };

      await recordCustodyEvent(
        item.id,
        "VIEWED",
        "Evidence unlocked and viewed in this session (content decrypted client-side)"
      );

      // 7) Open the details modal with the decrypted preview.
      const previewUrl = URL.createObjectURL(
        uint8ArrayToBlob(plaintext, unlockedItem.fileType)
      );
      setLockModal(null);
      setDetailsItem(unlockedItem);
      setDetails({
        ...EMPTY_DETAILS,
        loading: false,
        decrypting: false,
        decryptedBytes: plaintext,
        isEncrypted: true,
        integrityStatus: "verified",
        previewUrl,
        sessionKeyAvailable: true,
      });

      showToast(
        "success",
        "Evidence unlocked for this session. Refresh or close the page and it locks again."
      );
    } catch (err) {
      setLockError(err instanceof Error ? err.message : "Failed to unlock evidence");
    } finally {
      setLockBusy(false);
    }
  };

  /** Fetch the blockchain anchor status for an evidence item. */
  const loadAnchorStatus = useCallback(async (itemId: string) => {
    try {
      const res = await fetch(
        `/api/evidence/${encodeURIComponent(itemId)}/anchor`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      const anchor = data.anchor
        ? {
            anchorId: data.anchor.id,
            anchorType: data.anchor.anchorType,
            anchorStatus: (data.anchor.status ||
              "not_created") as
              | "not_created"
              | "pending"
              | "confirmed"
              | "verified"
              | "failed"
              | "unavailable"
              | "digest_mismatch",
            txHash: data.anchor.txHash,
            blockNumber: data.anchor.blockNumber,
            networkName: data.anchor.networkName,
            chainId: data.anchor.chainId,
            digest: data.anchor.digest,
            anchoredAt: data.anchor.anchoredAt,
          }
        : null;

      setEvidenceList((prev) =>
        prev.map((e) => (e.id === itemId ? { ...e, anchor } : e))
      );
    } catch {
      // non-fatal
    }
  }, []);

  // Load anchor status for listed evidence items (lazy, non-blocking).
  const evidenceIdsRef = useRef<string>("");
  useEffect(() => {
    const ids = evidenceList
      .filter((e) => !e.anchor)
      .map((e) => e.id)
      .join(",");
    if (ids && ids !== evidenceIdsRef.current) {
      evidenceIdsRef.current = ids;
      const timer = setTimeout(() => {
        evidenceList
          .filter((e) => !e.anchor)
          .slice(0, 40)
          .forEach((e) => loadAnchorStatus(e.id));
      }, 600);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceList, loadAnchorStatus]);

  /** POST a real anchor attempt for an evidence item; reload status afterward. */
  const handleAnchorEvidence = async (item: EvidenceItem) => {
    setAnchorBusyId(item.id);
    try {
      const res = await fetch(`/api/evidence/${encodeURIComponent(item.id)}/anchor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || "Anchor attempt failed"
        );
      }
      const a = data.anchor;
      if (a?.submitted) {
        showToast(
          "success",
          `Blockchain anchor confirmed — tx ${a.txHash}`
        );
      } else if (a?.status === "unavailable") {
        showToast(
          "info",
          a.reason ||
            "Blockchain anchoring is not configured — no transaction was created."
        );
      } else if (a?.status === "failed") {
        showToast(
          "error",
          `Anchor failed: ${a.reason || "unknown reason"}`
        );
      } else {
        showToast("info", `Anchor status: ${a?.status} — no transaction created.`);
      }
      await loadAnchorStatus(item.id);
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Anchor attempt failed"
      );
    } finally {
      setAnchorBusyId(null);
    }
  };

  /** Verify an existing anchor digest on-chain. */
  const handleVerifyAnchor = async (item: EvidenceItem) => {
    setAnchorBusyId(item.id);
    try {
      const res = await fetch(
        `/api/evidence/${encodeURIComponent(item.id)}/anchor?verify=true`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }
      const v = data.verification;
      if (!v) {
        showToast("info", "No blockchain anchor exists for this artifact.");
      } else if (v.status === "verified") {
        showToast(
          "success",
          "Anchor VERIFIED on-chain — the on-chain digest matches this artifact."
        );
      } else if (v.status === "digest_mismatch") {
        showToast(
          "error",
          "Digest mismatch — the on-chain digest no longer matches this artifact."
        );
      } else if (v.status === "unavailable") {
        showToast(
          "info",
          v.reason || "Blockchain provider unavailable — could not verify on-chain."
        );
      } else {
        showToast("error", v.reason || "On-chain verification failed.");
      }
      await loadAnchorStatus(item.id);
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Verification failed"
      );
    } finally {
      setAnchorBusyId(null);
    }
  };

  const persistLockToggle = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    const wantsLock = confirm.kind === "lock";
    try {
      const res = await fetch(`/api/evidence/${confirm.item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: wantsLock }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update lock state");
      }
      showToast(
        "success",
        wantsLock
          ? "Evidence locked. It can no longer be modified, unlinked, or deleted until unlocked."
          : "Evidence unlocked."
      );
      setConfirm(null);
      await loadEvidence();
      if (detailsItem?.id === confirm.item.id) {
        setDetailsItem({ ...detailsItem, locked: wantsLock });
      }
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to update lock state"
      );
    } finally {
      setConfirmBusy(false);
    }
  };

  const persistDelete = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/evidence/${confirm.item.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete evidence");
      }
      showToast("info", data.message || "Evidence deleted.");
      setConfirm(null);
      if (detailsItem?.id === confirm.item.id) closeDetails();
      await loadEvidence();
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to delete evidence"
      );
    } finally {
      setConfirmBusy(false);
    }
  };

  const persistCaseReassociate = async (target: string | null) => {
    if (!detailsItem) return;
    try {
      const res = await fetch(`/api/evidence/${detailsItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update case association");
      }
      showToast("success", "Case association updated.");
      await loadEvidence();
      setDetailsItem(
        (prev) =>
          prev
            ? { ...prev, caseId: target, caseNumber: data.evidence?.caseNumber ?? null }
            : prev
      );
    } catch (err) {
      showToast(
        "info",
        err instanceof Error ? err.message : "Failed to update case association"
      );
      setDetailsItem((prev) => (prev ? { ...prev } : prev));
    }
  };

  const handleDeleteFromList = (item: EvidenceItem) => {
    if (item.locked) {
      showToast(
        "error",
        "This evidence is locked. Unlock it before deleting — locked evidence cannot be removed."
      );
      return;
    }
    setConfirm({ kind: "delete", item });
  };

  const copyHash = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHashId(id);
    setTimeout(() => setCopiedHashId(null), 2500);
  };

  const handleDownloadDecrypted = async () => {
    if (!detailsItem || !details.decryptedBytes) return;
    const blob = uint8ArrayToBlob(details.decryptedBytes, detailsItem.fileType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = detailsItem.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    await recordCustodyEvent(
      detailsItem.id,
      "DOWNLOADED",
      `Decrypted download from vault (${formatBytes(details.decryptedBytes.byteLength)})`
    );
  };

  const exportDossier = async () => {
    if (evidenceList.length === 0) return;
    const consoleStatus = system || FALLBACK_SYSTEM;
    const anchorStatus =
      consoleStatus.blockchainAnchor?.status === "active" ? "CONNECTED" : "NOT CONNECTED";

    const dossierText = `================================================================================
CYBER SAKHI — INCIDENT EVIDENCE DOSSIER & CHAIN OF CUSTODY REPORT
Generated for Law Enforcement / National Cyber Crime Portal (cybercrime.gov.in)
================================================================================
Report Generation Timestamp : ${new Date().toISOString()}
Security Protocol            : AES-256-GCM (client-side) + SHA-256 fingerprints
Local Crypto Chain          : ${consoleStatus.integrityProvider?.status === "active" ? "ACTIVE" : "UNAVAILABLE"} (${consoleStatus.integrityProvider?.label || "SHA-256 chain"})
Blockchain Anchor           : ${anchorStatus} (${consoleStatus.blockchainAnchor?.label || "—"})

This report lists the artifacts held in this vault with their immutable
cryptographic fingerprints and recorded chain-of-custody events. External
blockchain anchoring is not connected; integrity rests on the client-side
SHA-256 fingerprint and the tamper-evident local hash chain.

EVIDENCE LEDGER:
--------------------------------------------------------------------------------
${evidenceList
  .map(
    (ev, idx) => `
[ARTIFACT #${idx + 1}]   Evidence ID: ${ev.evidenceCode || ev.id}
Title        : ${ev.title}
File Name    : ${ev.filename}
File Type    : ${ev.fileType}
File Size    : ${formatBytes(ev.fileSize)}
Stored       : ${ev.timestamp}
Category     : ${ev.category}
Case         : ${ev.caseNumber || "Unassociated"}
Encrypted    : ${ev.encrypted ? "YES (AES-256-GCM, session key)" : "NO (metadata only)"}
Locked       : ${ev.locked ? "YES" : "No"}
Custody Events: ${ev.custodyCount ?? "n/a"}
SHA-256 Hash : ${ev.sha256Hash}
Notes        : ${ev.notes || "(none)"}
`
  )
  .join("\n--------------------------------------------------------------------------------\n")}

================================================================================
LEGAL NOTICE:
The cryptographic fingerprints and chain-of-custody events recorded above
were generated when each artifact was stored. Keep this dossier alongside
the original files. Under Section 65B of the Indian Evidence Act, electronic
records may be admitted when accompanied by a certificate identifying the
device and the integrity of the record — this dossier documents the hashes
and custody history maintained by Cyber Sakhi.
================================================================================
`;

    // Record an EXPORTED custody event for each artifact on a best-effort
    // basis so the ledger reflects the disclosure.
    await Promise.allSettled(
      evidenceList.map((ev) =>
        recordCustodyEvent(ev.id, "EXPORTED", "Included in exported dossier")
      )
    );

    const blob = new Blob([dossierText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Cyber_Sakhi_Evidence_Dossier_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const filteredEvidence = useMemo(
    () =>
      evidenceList.filter((item) => {
        const matchesCategory =
          filterCategory === "ALL" || item.category === filterCategory;
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
          q === "" ||
          item.title.toLowerCase().includes(q) ||
          item.filename.toLowerCase().includes(q) ||
          (item.sha256Hash || "").toLowerCase().includes(q) ||
          (item.evidenceCode || "").toLowerCase().includes(q) ||
          (item.caseNumber || "").toLowerCase().includes(q);
        return matchesCategory && matchesSearch;
      }),
    [evidenceList, filterCategory, searchQuery]
  );

  const overallVerification = useMemo(() => {
    const v = details.chainVerification;
    if (!v) return null;
    return v.isValid ? "Passed" : "Failed";
  }, [details.chainVerification]);

  const isImageFile = (type: string) => type && type.startsWith("image/");
  const isPreviewableText = (type: string, filename: string = "") =>
    type === "application/pdf" ||
    type === "text/plain" ||
    filename.toLowerCase().endsWith(".pdf") ||
    filename.toLowerCase().endsWith(".txt");

  const consoleStatus = system || FALLBACK_SYSTEM;

  const openUploadPanel = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* ------------------------------ toast ------------------------------ */}
      {toast && (
        <div
          className={cn(
            "fixed top-20 right-4 sm:right-6 z-[90] max-w-sm px-4 py-3 rounded-xl border text-xs font-medium shadow-2xl backdrop-blur-xl animate-fade-in-up",
            toast.kind === "success" &&
              "bg-emerald-950/90 border-emerald-700/60 text-emerald-200",
            toast.kind === "error" &&
              "bg-red-950/90 border-red-800/70 text-red-200",
            toast.kind === "info" &&
              "bg-amber-950/90 border-amber-700/60 text-amber-200"
          )}
        >
          <div className="flex items-start gap-2">
            {toast.kind === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : toast.kind === "error" ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* ----------------------------- header ----------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <EyebrowBadge icon={Lock}>
            <span>Encrypted Proof Vault · Chain of Custody</span>
          </EyebrowBadge>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Evidence Locker
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl">
            Preserve screenshots, chat logs, audio and documents with
            client-side encryption and immutable SHA-256 fingerprints — kept
            in a tamper-evident chain of custody for cyber cell filings.
          </p>
        </div>

        <button
          onClick={exportDossier}
          disabled={evidenceList.length === 0}
          className="px-5 py-2.5 rounded-xl bg-emergency-600 hover:bg-emergency-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-emergency-950/40"
        >
          <Download className="w-4 h-4" />
          <span>Export Dossier (TXT)</span>
        </button>
      </div>

      {/* ------------------------ integrity console ------------------------ */}
      <div className="rounded-2xl glass-panel p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emergency-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Evidence Integrity Pipeline
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border",
                consoleStatus.integrityProvider?.status === "active"
                  ? "bg-emerald-950/60 border-emerald-700/60 text-emerald-300"
                  : "bg-amber-950/50 border-amber-700/60 text-amber-300"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LOCAL CHAIN ACTIVE
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border",
                consoleStatus.blockchainAnchor?.status === "active"
                  ? "bg-emerald-950/60 border-emerald-700/60 text-emerald-300"
                  : "bg-amber-950/50 border-amber-700/60 text-amber-300"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {consoleStatus.blockchainAnchor?.status === "active"
                ? "BLOCKCHAIN ANCHOR AVAILABLE"
                : "BLOCKCHAIN ANCHOR NOT CONFIGURED"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-4 px-1">
          <ConsoleNode
            icon={FileText}
            title="Artifact"
            status="active"
            detail="encrypted or metadata"
          />
          <LinkDots />
          <ConsoleNode
            icon={Fingerprint}
            title="SHA-256"
            status="active"
            detail="integrity fingerprint"
          />
          <LinkDots />
          <ConsoleNode
            icon={ScrollText}
            title="Custody Chain"
            status="active"
            detail="tamper-evident hash"
          />
          <LinkDots />
          <ConsoleNode
            icon={Database}
            title="Local Chain"
            status={
              consoleStatus.integrityProvider?.status === "active"
                ? "active"
                : "unavailable"
            }
            detail={consoleStatus.integrityProvider?.label || "SHA-256 chain"}
          />
          <LinkDots />
          <ConsoleNode
            icon={Link2}
            title="Blockchain"
            status={
              consoleStatus.blockchainAnchor?.status === "active"
                ? "active"
                : "unavailable"
            }
            detail={
              consoleStatus.blockchainAnchor?.status === "active"
                ? "connected"
                : "not connected"
            }
          />
        </div>
        <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
          The local SHA-256 chain hashes each custody event into the previous
          one. Blockchain anchoring is not connected, so no external
          transaction anchor exists — nothing is pretended to be anchored.
        </p>
      </div>

      {/* ----------------------- session-key notice ------------------------ */}
      <div className="rounded-2xl border border-amber-700/40 bg-amber-950/20 px-4 py-3 flex items-start gap-3">
        <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-[11px] leading-relaxed text-amber-100/90">
          <span className="font-bold text-amber-200">
            Encryption session keys are private to this browser session.
          </span>{" "}
          Uploaded content is encrypted client-side with AES-256-GCM before it
          leaves your device, and the key is held only in this tab&apos;s
          session storage. Closing this session means that key is destroyed and
          previously uploaded content can no longer be decrypted in a later
          session (the encrypted copy stays safely in the vault). Administrators
          cannot decrypt your evidence. Keep original copies somewhere safe and
          re-upload anything you need to decrypt later.
        </div>
      </div>

      {/* ------------------------------ grid ------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* upload panel */}
        <div className="lg:col-span-5 space-y-5">
          <div className="p-6 rounded-2xl glass-panel space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-emergency-400" />
                <span>Upload Evidence Artifact</span>
              </h3>
              <span className="hidden sm:flex text-[11px] text-emerald-400 items-center gap-1 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" /> Client Encrypted
              </span>
            </div>

            <form onSubmit={handleFileSubmit} className="space-y-4">
              <div className="border-2 border-dashed border-emergency-700/40 hover:border-emergency-500/60 rounded-xl p-5 text-center bg-emergency-950/10 transition">
                <input
                  ref={fileInputRef}
                  type="file"
                  id="evidenceFile"
                  className="hidden"
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setSelectedFile(f);
                      if (!newTitle) setNewTitle(f.name);
                    }
                  }}
                />
                <label
                  htmlFor="evidenceFile"
                  className="cursor-pointer flex flex-col items-center justify-center gap-1.5"
                >
                  <UploadCloud className="w-7 h-7 text-emergency-400 mb-1" />
                  <span className="text-xs font-semibold text-emergency-200">
                    {selectedFile
                      ? selectedFile.name
                      : "Select Screenshot / Chat Log / Document"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {selectedFile
                      ? `${formatBytes(selectedFile.size)} — Ready to hash & encrypt`
                      : "PDF, DOCX, TXT, CSV, XLSX, images, ZIP, JSON, EML… up to 25 MB"}
                  </span>
                </label>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="evidence-title"
                  className="text-[11px] font-semibold text-slate-300"
                >
                  Incident / Artifact Title
                </label>
                <input
                  id="evidence-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. WhatsApp Extortion Message Screenshot"
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emergency-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="evidence-category"
                    className="text-[11px] font-semibold text-slate-300"
                  >
                    Threat Category
                  </label>
                  <select
                    id="evidence-category"
                    value={newCategory}
                    onChange={(e) =>
                      setNewCategory(e.target.value as EvidenceItem["category"])
                    }
                    className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-2.5 text-xs text-slate-100 focus:outline-none focus:border-emergency-500"
                  >
                    {EVIDENCE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0) + c.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="evidence-case"
                    className="text-[11px] font-semibold text-slate-300"
                  >
                    Link to a Case (optional)
                  </label>
                  <select
                    id="evidence-case"
                    value={attachCaseId}
                    onChange={(e) => setAttachCaseId(e.target.value)}
                    className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-2.5 text-xs text-slate-100 focus:outline-none focus:border-emergency-500"
                  >
                    <option value="">None</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.case_number || "Case"} — {c.title || "Untitled"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="evidence-notes"
                  className="text-[11px] font-semibold text-slate-300"
                >
                  Context / Sender Details
                </label>
                <textarea
                  id="evidence-notes"
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Include sender handle, phone number, date and context..."
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emergency-500"
                />
              </div>

              <button
                type="submit"
                disabled={isUploading || !selectedFile}
                className="w-full py-2.5 px-4 rounded-xl bg-emergency-600 hover:bg-emergency-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{uploadStatus || "Processing..."}</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Seal &amp; Lock in Vault</span>
                  </>
                )}
              </button>

              {uploadError && (
                <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-red-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              {!isUploading && !uploadError && selectedFile && (
                <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 text-[11px] flex items-start gap-2">
                  <HardDrive className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {selectedFile.name} is queued. Content will be hashed and
                    encrypted <strong>client-side</strong> with your session key
                    before upload — nothing readable leaves this device.
                  </span>
                </div>
              )}
            </form>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs text-slate-400">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <FileCheck2 className="w-4 h-4 text-emergency-400" />
              <span>Section 65B (Indian Evidence Act) Ready</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Every artifact is sealed with a deterministic SHA-256 checksum and
              an append-only chain of custody, so you can later certify that no
              alteration occurred between capture and filing.
            </p>
          </div>
        </div>

        {/* evidence list */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 rounded-2xl glass-card flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files, hashes, EV/CS codes..."
                className="w-full rounded-lg bg-slate-900/90 border border-slate-700/80 pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emergency-500"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="rounded-lg bg-slate-900/90 border border-slate-700/80 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                {EVIDENCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0) + c.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-12 rounded-2xl glass-panel flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emergency-400" />
              <span className="text-xs">Retrieving sealed evidence...</span>
            </div>
          ) : loadError ? (
            <div className="p-8 rounded-2xl glass-panel text-center text-red-300 text-xs">
              {loadError}
            </div>
          ) : evidenceList.length === 0 ? (
            <div className="rounded-2xl glass-panel p-8 sm:p-10 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emergency-950/60 border border-emergency-700/50 flex items-center justify-center relative">
                <span className="absolute inset-0 rounded-2xl bg-emergency-700/20 animate-ping-slow" />
                <Lock className="w-7 h-7 text-emergency-300 relative" />
              </div>
              <h2 className="mt-5 text-lg font-bold text-white">
                Your private, encrypted space
              </h2>
              <p className="mt-2 max-w-md mx-auto text-xs text-slate-400 leading-relaxed">
                This vault is empty because nothing has been sealed in it yet.
                Save screenshots, chat logs, audio and documents here and they
                are encrypted with AES-256-GCM and fingerprinted with SHA-256
                the moment you upload them.
              </p>
              <button
                onClick={openUploadPanel}
                className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emergency-600 hover:bg-emergency-500 text-white text-xs font-bold transition shadow-lg shadow-emergency-950/40"
              >
                <Lock className="w-4 h-4" />
                Se&nbsp;al your first evidence
              </button>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div className="flex items-center gap-2 text-emerald-300 text-[11px] font-bold mb-1">
                    <Lock className="w-3.5 h-3.5" />
                    End-to-end encryption
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Content is encrypted in your browser with AES-256-GCM. Only
                    the session that uploaded it holds the key.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div className="flex items-center gap-2 text-emergency-300 text-[11px] font-bold mb-1">
                    <Fingerprint className="w-3.5 h-3.5" />
                    SHA-256 fingerprint
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Every artifact is hashed at capture so later changes can be
                    detected against the stored digest.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div className="flex items-center gap-2 text-emergency-300 text-[11px] font-bold mb-1">
                    <ScrollText className="w-3.5 h-3.5" />
                    Tamper-evident custody
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Each action is chained into the previous event&apos;s hash,
                    making edits to the ledger detectable.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div className="flex items-center gap-2 text-amber-300 text-[11px] font-bold mb-1">
                    <Link2 className="w-3.5 h-3.5" />
                    Blockchain anchor
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Not connected — no external witness is claimed until a real
                    anchoring service exists.
                  </p>
                </div>
              </div>
            </div>
          ) : filteredEvidence.length === 0 ? (
            <div className="p-8 rounded-2xl glass-panel text-center text-slate-400 text-xs">
              No evidence artifacts match your filter.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEvidence.map((item) => (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl glass-card space-y-3 relative group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.locked && item.hasLockMaterial ? (
                          <span className="font-bold text-sm text-slate-300 truncate">
                            Protected Artifact
                          </span>
                        ) : (
                          <span className="font-bold text-sm text-slate-100 truncate">
                            {item.title}
                          </span>
                        )}
                        {item.locked ? (
                          <StatusPill tone="amber">
                            <Lock className="w-2.5 h-2.5" /> LOCKED
                          </StatusPill>
                        ) : null}
                        {item.locked && item.hasLockMaterial ? (
                          <StatusPill tone="red">
                            <KeySquare className="w-2.5 h-2.5" /> PASSWORD/KEY
                          </StatusPill>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                        <span className="text-emergency-300/90 font-semibold">
                          {item.evidenceCode || "EV-…"}
                        </span>
                        <span>•</span>
                        {item.locked && item.hasLockMaterial ? (
                          <span className="text-amber-300/80">
                            content hidden until unlocked
                          </span>
                        ) : (
                          <span>{item.filename}</span>
                        )}
                        {item.locked && item.hasLockMaterial ? null : (
                          <>
                            <span>•</span>
                            <span>{formatBytes(item.fileSize)}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openDetails(item)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Open evidence details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          handleLockClick(item)
                        }
                        className={cn(
                          "p-2 rounded-lg transition",
                          item.locked
                            ? "bg-amber-950/60 hover:bg-amber-900/70 text-amber-300"
                            : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
                        )}
                        title={item.locked ? "Unlock evidence" : "Lock evidence with a password or key"}
                      >
                        {item.locked ? (
                          <LockOpen className="w-3.5 h-3.5" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteFromList(item)}
                        className="p-2 rounded-lg bg-slate-800/80 hover:bg-red-950/80 text-slate-400 hover:text-red-400 transition"
                        title={item.locked ? "Locked — cannot be deleted" : "Delete from vault"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {item.locked && item.hasLockMaterial ? (
                      <StatusPill tone="red">
                        <KeyRound className="w-2.5 h-2.5" /> CONTENT PROTECTED
                      </StatusPill>
                    ) : (
                      <>
                        <StatusPill tone="slate">{item.category}</StatusPill>
                        {item.encrypted ? (
                          <StatusPill tone="green">
                            <Lock className="w-2.5 h-2.5" /> ENCRYPTED · AES-256-GCM
                          </StatusPill>
                        ) : (
                          <StatusPill tone="amber">
                            METADATA ONLY
                          </StatusPill>
                        )}
                      </>
                    )}
                    <StatusPill tone="green">
                      <CheckCircle2 className="w-2.5 h-2.5" /> HASHED
                    </StatusPill>
                    {item.caseNumber && (
                      <StatusPill tone="slate">
                        <Link2 className="w-2.5 h-2.5" /> {item.caseNumber}
                      </StatusPill>
                    )}
                    <StatusPill tone="slate">
                      <ScrollText className="w-2.5 h-2.5" /> {item.custodyCount ?? 0} custody
                      event{(item.custodyCount ?? 0) === 1 ? "" : "s"}
                    </StatusPill>
                    {item.anchor && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide",
                          item.anchor.anchorStatus === "verified" ||
                            item.anchor.anchorStatus === "confirmed"
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/60"
                            : item.anchor.anchorStatus === "digest_mismatch" ||
                              item.anchor.anchorStatus === "failed"
                            ? "bg-red-950/50 text-red-300 border-red-800/70"
                            : "bg-amber-950/50 text-amber-300 border-amber-700/60"
                        )}
                        title={item.anchor.txHash || "No transaction"}
                      >
                        <Radar className="w-2.5 h-2.5" />
                        {String(item.anchor.anchorStatus).toUpperCase().replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  {item.notes && (
                    <p className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                      {item.notes.length > 240
                        ? item.notes.substring(0, 240) + "…"
                        : item.notes}
                    </p>
                  )}

                  <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/90 flex items-center justify-between gap-2 text-[11px] font-mono">
                    {item.locked && item.hasLockMaterial ? (
                      <div className="truncate text-slate-500 flex-1 min-w-0">
                        <span className="text-amber-300 font-semibold">
                          SHA-256: protected
                        </span>{" "}
                        — fingerprint is revealed after unlock
                      </div>
                    ) : (
                      <>
                        <div className="truncate text-slate-400 flex-1 min-w-0">
                          <span className="text-emergency-300 font-semibold">
                            SHA-256:{" "}
                          </span>
                          <span className={item.sha256Hash ? "" : "text-slate-600"}>
                            {item.sha256Hash || "not stored"}
                          </span>
                        </div>
                        {item.sha256Hash && (
                          <button
                            onClick={() => copyHash(item.sha256Hash, item.id)}
                            className="text-slate-400 hover:text-white shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-800"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedHashId === item.id ? "Copied!" : "Copy"}</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {!(item.locked && item.hasLockMaterial) && (
                      <button
                        onClick={() => verifyIntegrity(item)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-emerald-700/50 transition"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verify Integrity
                      </button>
                    )}
                    <button
                      onClick={() => handleAnchorEvidence(item)}
                      disabled={anchorBusyId === item.id}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-300 hover:text-sky-200 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-sky-700/50 transition disabled:opacity-50"
                      title="Create a real blockchain anchor for this artifact's digest"
                    >
                      {anchorBusyId === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Radar className="w-3.5 h-3.5" />
                      )}
                      Anchor
                    </button>
                    {item.anchor && (item.anchor.txHash || item.anchor.digest) && (
                      <button
                        onClick={() => handleVerifyAnchor(item)}
                        disabled={anchorBusyId === item.id}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 hover:border-emerald-700/50 transition disabled:opacity-50"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verify Anchor
                      </button>
                    )}
                    {item.locked && (
                      <span className="text-[10px] text-amber-300/90 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Locked — to reassociate or
                        delete, unlock first
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* --------------------------- details modal --------------------------- */}
      {detailsItem && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl my-8 rounded-2xl bg-[#0d0d1a] border border-emergency-700/40 p-6 space-y-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-emergency-300 flex items-center gap-2">
                <FileCheck2 className="w-5 h-5" />
                <span>Evidence Chain-of-Custody Certificate</span>
              </h3>
              <button
                onClick={closeDetails}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <span className="text-slate-500">Evidence ID: </span>
                <span className="font-mono text-emergency-300">
                  {detailsItem.evidenceCode || "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Filename: </span>
                <span className="font-mono text-slate-200">
                  {detailsItem.filename}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Type: </span>
                <span className="text-slate-200">
                  {detailsItem.fileType || "unknown"} •{" "}
                  {formatBytes(detailsItem.fileSize)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Stored: </span>
                <span className="text-slate-200">
                  {new Date(detailsItem.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Encryption: </span>
                {detailsItem.encrypted ? (
                  <StatusPill tone="green">AES-256-GCM (session key)</StatusPill>
                ) : (
                  <StatusPill tone="amber">Metadata only</StatusPill>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Lock: </span>
                {detailsItem.locked ? (
                  <StatusPill tone="amber">
                    <Lock className="w-2.5 h-2.5" /> LOCKED
                  </StatusPill>
                ) : (
                  <StatusPill tone="slate">Unlocked</StatusPill>
                )}
              </div>
            </div>

            <div className="text-xs flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-slate-500 shrink-0">Linked Case: </span>
              {detailsItem.locked ? (
                <span className="text-slate-300 font-mono">
                  {detailsItem.caseNumber || "None"}{" "}
                  <span className="text-amber-300/80">(locked — unlock to change)</span>
                </span>
              ) : (
                <div className="flex items-center gap-2 flex-wrap flex-1">
                  <select
                    value={associateCaseId}
                    onChange={(e) =>
                      persistCaseReassociate(e.target.value || null)
                    }
                    className="rounded-lg bg-slate-900 border border-slate-700/80 px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emergency-500"
                  >
                    <option value="">None</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.case_number || "Case"} — {c.title || "Untitled"}
                      </option>
                    ))}
                  </select>
                  {detailsItem.caseId && (
                    <button
                      onClick={() => persistCaseReassociate(null)}
                      className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-300 px-2 py-1 rounded bg-slate-800"
                    >
                      <Unlink className="w-3 h-3" /> Unlink
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <span className="text-slate-500 text-xs">Stored SHA-256: </span>
              <div className="font-mono text-[11px] bg-slate-900 p-2 rounded border border-slate-800 break-all text-emergency-300 mt-1">
                {detailsItem.sha256Hash || "not stored"}
              </div>
            </div>

            {details.loading && (
              <div className="p-4 rounded-xl bg-emergency-950/40 border border-emergency-700/50 text-emergency-200 text-xs flex items-start gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-0.5">
                    {details.decrypting
                      ? "Decrypting evidence content..."
                      : details.verifying
                      ? "Verifying SHA-256 integrity..."
                      : "Retrieving encrypted evidence from vault..."}
                  </div>
                  <div className="text-[11px] text-emergency-300/70">
                    Client-side AES-256-GCM operation in progress.
                  </div>
                </div>
              </div>
            )}

            {details.error && (
              <div
                className={cn(
                  "p-4 rounded-xl border text-xs flex items-start gap-2",
                  details.sessionKeyAvailable === false
                    ? "bg-amber-950/50 border-amber-700/60 text-amber-200"
                    : "bg-red-950/50 border-red-800/70 text-red-200"
                )}
              >
                {details.sessionKeyAvailable === false ? (
                  <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-semibold">
                    {details.sessionKeyAvailable === false
                      ? "Session Encryption Key Unavailable"
                      : "Could Not Open Content"}
                  </div>
                  <div className="leading-relaxed opacity-90">
                    {details.error}
                  </div>
                </div>
              </div>
            )}

            {details.integrityStatus === "verified" && details.previewUrl && (
              <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-3 text-[11px] text-emerald-200 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold mb-0.5">
                    Integrity Verified — recomputed SHA-256 matches the stored
                    fingerprint.
                  </div>
                  <div className="opacity-80">
                    Preview below is the authenticated plaintext decrypted in
                    this browser with your session key.
                  </div>
                </div>
              </div>
            )}
            {details.integrityStatus === "failed" && (
              <div className="rounded-xl border border-red-800/70 bg-red-950/40 p-3 text-[11px] text-red-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold mb-0.5">
                    Integrity check FAILED — the stored content no longer
                    matches its original fingerprint.
                  </div>
                  <div className="opacity-80">
                    Do not rely on this artifact. The chain of custody records
                    the verification failure.
                  </div>
                </div>
              </div>
            )}
            {details.integrityStatus === "unencrypted" && (
              <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-[11px] text-amber-200 flex items-start gap-2">
                <Database className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold mb-0.5">Metadata-only artifact.</div>
                  <div className="opacity-80">
                    Its SHA-256 fingerprint was recorded at capture, but no
                    encrypted content is stored, so nothing can be decrypted or
                    re-verified in this session.
                  </div>
                </div>
              </div>
            )}

            {details.previewUrl && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Decrypted Preview
                </div>
                <div className="max-h-80 overflow-auto rounded-xl border border-slate-800 bg-black/30">
                  {isImageFile(detailsItem.fileType) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={details.previewUrl}
                      alt={detailsItem.filename}
                      className="w-full object-contain"
                    />
                  ) : isPreviewableText(detailsItem.fileType, detailsItem.filename) ? (
                    <iframe
                      src={details.previewUrl}
                      title={detailsItem.filename}
                      className="w-full min-h-[300px]"
                    />
                  ) : (
                    <div className="p-4 text-[11px] text-slate-400">
                      This file type cannot be previewed inline. Use the download
                      button below to open the authenticated plaintext.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {details.decryptedBytes && (
                <button
                  onClick={handleDownloadDecrypted}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white px-3 py-2 rounded-lg bg-emergency-700 hover:bg-emergency-600 transition"
                >
                  <Download className="w-3.5 h-3.5" /> Download Decrypted
                </button>
              )}
              <button
                onClick={() => verifyIntegrity(detailsItem)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-700/50 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Verify Integrity Now
              </button>
              <button
                onClick={() =>
                  handleLockClick(detailsItem)
                }
                className={cn(
                  "inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg transition",
                  detailsItem.locked
                    ? "text-amber-300 bg-amber-950/60 border border-amber-700/50 hover:bg-amber-900/60"
                    : "text-slate-200 bg-slate-900 border border-slate-700 hover:bg-slate-800"
                )}
              >
                {detailsItem.locked ? (
                  <>
                    <LockOpen className="w-3.5 h-3.5" /> Unlock
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" /> Lock
                  </>
                )}
              </button>
              <button
                onClick={() => handleDeleteFromList(detailsItem)}
                disabled={detailsItem.locked}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-300 hover:text-red-200 px-3 py-2 rounded-lg bg-red-950/40 border border-red-900/60 hover:border-red-700/60 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>

            {details.chainEvents.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <ScrollText className="w-3.5 h-3.5 text-emergency-400" />
                  Chain of Custody
                  {overallVerification && (
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full border font-bold",
                        overallVerification === "Passed"
                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/60"
                          : "bg-red-950/50 text-red-300 border-red-800/70"
                      )}
                    >
                      {details.chainVerification?.verifiedEventCount}/
                      {details.chainVerification?.totalEventCount} hashes
                      verified — {overallVerification}
                    </span>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/70">
                  {details.chainEvents.map((event) => (
                    <div key={event.id} className="px-3 py-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-emergency-300">
                          {event.action}
                        </span>
                        <span className="text-slate-500 font-mono">
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </div>
                      {event.notes && (
                        <div className="text-slate-400 mt-0.5">{event.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-[11px] text-slate-400 space-y-2">
              <div className="flex items-center gap-2 text-slate-200 font-bold">
                <Radar className="w-3.5 h-3.5 text-sky-400" />
                Blockchain Anchor
                {detailsItem.anchor?.anchorStatus ? (
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border font-bold",
                      detailsItem.anchor.anchorStatus === "verified" ||
                        detailsItem.anchor.anchorStatus === "confirmed"
                        ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/60"
                        : detailsItem.anchor.anchorStatus === "digest_mismatch" ||
                          detailsItem.anchor.anchorStatus === "failed"
                        ? "bg-red-950/50 text-red-300 border-red-800/70"
                        : "bg-amber-950/50 text-amber-300 border-amber-700/60"
                    )}
                  >
                    {String(detailsItem.anchor.anchorStatus)
                      .toUpperCase()
                      .replace(/_/g, " ")}
                  </span>
                ) : null}
              </div>
              {detailsItem.anchor?.txHash ? (
                <div className="space-y-1 font-mono">
                  <div className="flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">Tx hash:</span>
                    <span className="break-all text-sky-300">
                      {detailsItem.anchor.txHash}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">Block:</span>
                    <span>{detailsItem.anchor.blockNumber ?? "—"}</span>
                    <span className="text-slate-500">Network:</span>
                    <span>
                      {detailsItem.anchor.networkName || detailsItem.anchor.chainId || "—"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">Digest:</span>
                    <span className="break-all">
                      {detailsItem.anchor.digest?.substring(0, 40) || "—"}…
                    </span>
                  </div>
                  {detailsItem.anchor.anchoredAt && (
                    <div className="flex items-start gap-2">
                      <span className="text-slate-500 shrink-0">Anchored:</span>
                      <span>
                        {new Date(detailsItem.anchor.anchoredAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="leading-relaxed">
                  No external blockchain transaction exists for this artifact.
                  Integrity is provided by the client-side SHA-256 fingerprint
                  and the local tamper-evident chain of custody
                  {details.integrityProviderLabel
                    ? ` (${details.integrityProviderLabel})`
                    : ""}
                  . An anchor is only claimed after a real on-chain transaction
                  is confirmed.
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  onClick={() => handleAnchorEvidence(detailsItem)}
                  disabled={anchorBusyId === detailsItem.id}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-300 hover:text-sky-200 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-sky-700/50 transition disabled:opacity-50"
                >
                  {anchorBusyId === detailsItem.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Radar className="w-3.5 h-3.5" />
                  )}
                  {detailsItem.anchor?.txHash
                    ? "Re-Anchor / New Commit"
                    : "Anchor on Blockchain"}
                </button>
                {(detailsItem.anchor?.txHash || detailsItem.anchor?.digest) && (
                  <button
                    onClick={() => handleVerifyAnchor(detailsItem)}
                    disabled={anchorBusyId === detailsItem.id}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-700/50 transition disabled:opacity-50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verify On-Chain
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------- confirmation modal ------------------------- */}
      {confirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-[#0d0d1a] border border-emergency-700/40 p-6 space-y-4 text-white shadow-2xl">
            <div className="flex items-center gap-2">
              {confirm.kind === "delete" ? (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              ) : confirm.kind === "lock" ? (
                <Lock className="w-5 h-5 text-amber-400" />
              ) : (
                <LockOpen className="w-5 h-5 text-emerald-400" />
              )}
              <h3 className="text-sm font-bold text-slate-100">
                {confirm.kind === "delete"
                  ? "Delete this evidence?"
                  : confirm.kind === "lock"
                  ? "Lock this evidence?"
                  : "Unlock this evidence?"}
              </h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {confirm.kind === "delete" &&
                "This permanently removes the artifact, its encrypted content, and its entire chain-of-custody ledger from the vault. This cannot be undone."}
              {confirm.kind === "lock" &&
                "Locked evidence is protected: it cannot be reassociated with a case, edited, or deleted until it is unlocked. The lock and its custody event are persisted server-side."}
              {confirm.kind === "unlock" &&
                "Unlocking removes the protection so the artifact can be reassociated or deleted again. A custody event records the unlock."}
            </p>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
              <div className="font-mono text-slate-200 truncate">
                {confirm.item.evidenceCode || confirm.item.id}
              </div>
              <div className="text-slate-400 mt-0.5 truncate">
                {confirm.item.title}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setConfirm(null)}
                disabled={confirmBusy}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={
                  confirm.kind === "delete"
                    ? persistDelete
                    : persistLockToggle
                }
                disabled={confirmBusy}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-2",
                  confirm.kind === "delete"
                    ? "bg-red-700 hover:bg-red-600 text-white"
                    : confirm.kind === "lock"
                    ? "bg-amber-700 hover:bg-amber-600 text-white"
                    : "bg-emerald-700 hover:bg-emerald-600 text-white"
                )}
              >
                {confirmBusy && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                {confirm.kind === "delete"
                  ? "Delete Evidence"
                  : confirm.kind === "lock"
                  ? "Lock Evidence"
                  : "Unlock Evidence"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------- crypto lock / unlock modal ----------------------- */}
      {lockModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-[#0d0d1a] border border-emergency-700/40 p-6 space-y-4 text-white shadow-2xl my-8">
            <div className="flex items-center gap-2">
              {lockModal.mode === "lock" ? (
                <KeySquare className="w-5 h-5 text-amber-400" />
              ) : (
                <LockOpen className="w-5 h-5 text-emerald-400" />
              )}
              <h3 className="text-sm font-bold text-slate-100">
                {lockModal.mode === "lock"
                  ? lockMode === "security_key"
                    ? "Protect with a security key"
                    : "Protect this evidence with a password"
                  : "Unlock this evidence"}
              </h3>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
              <div className="font-mono text-slate-200 truncate">
                {lockModal.item.evidenceCode || lockModal.item.id}
              </div>
              <div className="text-slate-400 mt-0.5 truncate">
                {lockModal.mode === "unlock"
                  ? "Password/key protected artifact"
                  : lockModal.item.title}
              </div>
            </div>

            {lockModal.mode === "lock" && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setLockMode("password");
                    setLockError(null);
                    setLockGeneratedKey(null);
                  }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-[11px] font-bold transition border",
                    lockMode === "password"
                      ? "bg-emergency-700/40 border-emergency-600 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
                  )}
                >
                  Password
                </button>
                <button
                  onClick={() => {
                    setLockMode("security_key");
                    setLockError(null);
                    setLockCredential("");
                    if (!lockGeneratedKey) setLockGeneratedKey(generateSecurityKey());
                  }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-[11px] font-bold transition border",
                    lockMode === "security_key"
                      ? "bg-emergency-700/40 border-emergency-600 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
                  )}
                >
                  Security key
                </button>
              </div>
            )}

            {lockModal.mode === "lock" && lockMode === "security_key" && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-700/40 space-y-2">
                <div className="text-[11px] text-amber-200 font-bold">
                  This key is generated now and shown only once. It is never
                  stored by the server — save it somewhere safe.
                </div>
                {lockGeneratedKey && (
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs font-mono text-amber-300 break-all bg-slate-950/70 p-2 rounded flex-1">
                      {lockGeneratedKey}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(lockGeneratedKey);
                        setCopiedKey(true);
                        setTimeout(() => setCopiedKey(false), 2000);
                      }}
                      className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded bg-slate-800 text-slate-200 hover:bg-slate-700"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedKey ? "Copied!" : "Copy"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {(lockModal.mode === "unlock" ||
              (lockModal.mode === "lock" && lockMode === "password")) && (
              <div className="space-y-1">
                <label
                  htmlFor="lock-credential"
                  className="text-[11px] font-semibold text-slate-300"
                >
                  {lockModal.mode === "lock"
                    ? "Choose a strong password"
                    : "Enter your password or security key"}
                </label>
                <input
                  id="lock-credential"
                  type="password"
                  value={lockCredential}
                  onChange={(e) => setLockCredential(e.target.value)}
                  placeholder={
                    lockModal.mode === "unlock"
                      ? "Password / security key"
                      : "At least 8 characters"
                  }
                  autoComplete="off"
                  className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emergency-500"
                />
              </div>
            )}

            {lockError && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-red-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{lockError}</span>
              </div>
            )}

            {lockSuccess && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-700/50 text-emerald-200 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{lockSuccess}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {lockModal.mode === "lock"
                ? "Your password is derived into an encryption key in this browser with PBKDF2-SHA256. Only wrapped keys are stored on the server — nothing can unlock this evidence without your password or key."
                : "The lock is verified locally in this browser and against the server before content is decrypted. Unlock only lasts for this session — refresh or close the page and this evidence locks itself again."}
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setLockModal(null)}
                disabled={lockBusy}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              {lockModal.mode === "lock" && lockSuccess && (
                <button
                  onClick={() => setLockModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                >
                  Done
                </button>
              )}
              {!(lockModal.mode === "lock" && lockSuccess) && (
                <button
                  onClick={
                    lockModal.mode === "lock"
                      ? persistCryptoLock
                      : persistCryptoUnlock
                  }
                  disabled={lockBusy}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-2",
                    lockModal.mode === "lock"
                      ? "bg-amber-700 hover:bg-amber-600 text-white"
                      : "bg-emerald-700 hover:bg-emerald-600 text-white"
                  )}
                >
                  {lockBusy && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {lockModal.mode === "lock"
                    ? lockMode === "security_key"
                      ? "Protect with Key"
                      : "Lock Evidence"
                    : "Unlock & View"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}