/** AES-256-GCM payload version. Increment if the envelope format changes. */
export const ENCRYPTION_PAYLOAD_VERSION = 1 as const;

/** Human-readable algorithm id stored in the transport envelope. */
export const ENCRYPTION_ALGORITHM = "AES-256-GCM" as const;

const AES_GCM_NAME = "AES-GCM";
const AES_GCM_KEY_BITS = 256;
const AES_GCM_KEY_BYTES = AES_GCM_KEY_BITS / 8;
/** 96-bit IV required by AES-GCM; a fresh random IV is generated per encryption. */
const AES_GCM_IV_BYTES = 12;

export type EncryptionAlgorithm = typeof ENCRYPTION_ALGORITHM;
export type EncryptionPayloadVersion = typeof ENCRYPTION_PAYLOAD_VERSION;

/**
 * Data that can be encrypted: UTF-8 text or raw bytes.
 * Callers should serialize structured evidence (email, analysis, notes, files)
 * to a string or BufferSource before encrypting.
 */
export type EncryptableData = string | BufferSource;

/**
 * JSON-safe envelope containing everything needed to decrypt except the secret key.
 * Binary fields are Base64-encoded for database/JSON transport.
 */
export interface EncryptedPayload {
  version: EncryptionPayloadVersion;
  algorithm: EncryptionAlgorithm;
  iv: string;
  ciphertext: string;
}

function getCrypto(): Crypto {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle || typeof webCrypto.getRandomValues !== "function") {
    throw new Error("Web Crypto API is not available in this environment.");
  }
  return webCrypto;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Copy into a standalone ArrayBuffer so Web Crypto accepts it as BufferSource. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toPlaintextBytes(data: EncryptableData): Uint8Array {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function assertAesGcmKey(key: CryptoKey): void {
  if (key.algorithm.name !== AES_GCM_NAME) {
    throw new Error("Key must be an AES-GCM CryptoKey.");
  }
  const length = (key.algorithm as AesKeyAlgorithm).length;
  if (length !== AES_GCM_KEY_BITS) {
    throw new Error("Key must be a 256-bit AES-GCM CryptoKey.");
  }
}

/**
 * Generates a cryptographically secure random 256-bit AES-GCM data encryption key.
 *
 * The key is extractable so it can be wrapped or persisted by a higher-level
 * key-management layer. Do not store this key in localStorage or hardcode it.
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return getCrypto().subtle.generateKey(
    { name: AES_GCM_NAME, length: AES_GCM_KEY_BITS },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts arbitrary evidence bytes or UTF-8 text with AES-256-GCM.
 * A new 96-bit IV is generated for every call and must never be reused
 * with the same key (fresh random IVs satisfy that requirement).
 */
export async function encryptData(
  data: EncryptableData,
  key: CryptoKey
): Promise<EncryptedPayload> {
  assertAesGcmKey(key);
  const webCrypto = getCrypto();
  const iv = webCrypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plaintext = toPlaintextBytes(data);
  const ciphertextBuffer = await webCrypto.subtle.encrypt(
    { name: AES_GCM_NAME, iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext)
  );

  return {
    version: ENCRYPTION_PAYLOAD_VERSION,
    algorithm: ENCRYPTION_ALGORITHM,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

/**
 * Decrypts an envelope produced by encryptData.
 * Returns raw bytes so callers can treat the result as text, JSON, or a file.
 */
export async function decryptData(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<Uint8Array> {
  assertAesGcmKey(key);

  if (payload.version !== ENCRYPTION_PAYLOAD_VERSION) {
    throw new Error("Unsupported encrypted payload version.");
  }
  if (payload.algorithm !== ENCRYPTION_ALGORITHM) {
    throw new Error("Unsupported encrypted payload algorithm.");
  }
  if (typeof payload.iv !== "string" || typeof payload.ciphertext !== "string") {
    throw new Error("Encrypted payload is missing IV or ciphertext.");
  }

  const iv = base64ToBytes(payload.iv);
  if (iv.byteLength !== AES_GCM_IV_BYTES) {
    throw new Error("Encrypted payload IV must be 96 bits.");
  }

  const ciphertext = base64ToBytes(payload.ciphertext);
  const plaintextBuffer = await getCrypto().subtle.decrypt(
    { name: AES_GCM_NAME, iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext)
  );

  return new Uint8Array(plaintextBuffer);
}

/**
 * Exports a CryptoKey as a Base64-encoded raw 256-bit key for wrapping or
 * secure transport. Do not write the result to localStorage.
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  assertAesGcmKey(key);
  const raw = await getCrypto().subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(raw));
}

/**
 * Imports a Base64-encoded raw 256-bit AES-GCM key produced by exportKey.
 */
export async function importKey(exportedKey: string): Promise<CryptoKey> {
  const raw = base64ToBytes(exportedKey);
  if (raw.byteLength !== AES_GCM_KEY_BYTES) {
    throw new Error("Imported key must be 256 bits.");
  }

  return getCrypto().subtle.importKey(
    "raw",
    toArrayBuffer(raw),
    { name: AES_GCM_NAME, length: AES_GCM_KEY_BITS },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function computeSha256(data: ArrayBuffer | string): Promise<string> {
  const buffer = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback simple checksum if crypto.subtle unavailable
  let hash = 0;
  const str = typeof data === "string" ? data : new Uint8Array(data).toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return "hash_" + Math.abs(hash).toString(16).padStart(64, "e");
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
