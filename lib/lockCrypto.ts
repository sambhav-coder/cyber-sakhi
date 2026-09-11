"use client";

/**
 * Client-side cryptographic lock helpers for the Evidence Locker.
 *
 * Security model:
 * - User provides a password (or we generate a strong random security key).
 * - PBKDF2-SHA256 derives a 256-bit KEK from the credential + random salt.
 * - A freshly generated random DEK encrypts the evidence content (AES-256-GCM).
 * - The DEK is wrapped (encrypted) with the KEK and stored server-side.
 * - A random 256-bit verifier token is wrapped with the KEK; the SHA-256 of
 *   the plaintext token is stored server-side for unlock authentication.
 *
 * Neither the plaintext password/key nor the raw DEK ever leaves the browser.
 */

const KDF_ALGORITHM = "PBKDF2-SHA256";
const KDF_IDENTIFIER = "PBKDF2-SHA256";
const DEFAULT_ITERATIONS = 310_000;
const ENC_ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;

/** Decode base64 (URL-safe tolerant) to Uint8Array over an explicit ArrayBuffer. */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const clean = base64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), "=");
  const binary = atob(padded);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode Uint8Array as base64. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Generate random bytes over an explicit ArrayBuffer and return base64. */
function randomBytesBase64(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)));
  return bytesToBase64(bytes);
}

/** Generate a user-readable random security key (e.g. for "security key" lock). */
export function generateSecurityKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let key = "";
  for (let i = 0; i < bytes.length; i++) {
    key += alphabet[bytes[i] % alphabet.length];
  }
  return key.match(/.{1,4}/g)!.join("-");
}

/**
 * Derive a 256-bit AES-GCM KEK from a credential + salt via PBKDF2-SHA256.
 */
export async function deriveKek(
  credential: string,
  saltBase64: string,
  iterations: number
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(credential),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(saltBase64),
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
  return key;
}

/** Wrap plaintext bytes with an AES-256-GCM key; returns base64 ciphertext + iv. */
export async function aesWrap(
  key: CryptoKey,
  plaintext: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ENC_ALGORITHM, iv },
    key,
    plaintext as BufferSource
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

/** Unwrap plaintext from base64 ciphertext + iv with an AES-256-GCM key. */
export async function aesUnwrap(
  key: CryptoKey,
  ciphertextBase64: string,
  ivBase64: string
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: ENC_ALGORITHM, iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(ciphertextBase64) as BufferSource
  );
  return new Uint8Array(plaintext);
}

/** Generate a random 256-bit DEK as an exportable AES-GCM CryptoKey. */
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

/** Export a CryptoKey's raw bytes as base64. */
export async function exportKeyBytes(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(raw));
}

/** Import raw key bytes (base64) as an AES-GCM CryptoKey. */
export async function importKeyBytes(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(base64) as BufferSource,
    { name: "AES-GCM", length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

/** SHA-256 hex digest of arbitrary bytes/string (for verifier_sha). */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a random 256-bit verifier token and its base64 + sha256. */
export async function generateVerifier(): Promise<{
  verifier: string; // base64 plaintext
  verifierSha: string; // sha256 hex of plaintext
}> {
  const verifier = randomBytesBase64(32);
  const verifierSha = await sha256Hex(verifier);
  return { verifier, verifierSha };
}

/** Convenience: random salt base64 (16 bytes). */
export function generateSalt(): string {
  return randomBytesBase64(16);
}

export const kdfIdentifier = KDF_IDENTIFIER;

export const defaultKdfIterations = DEFAULT_ITERATIONS;

export const lockCryptoVersion = 1;