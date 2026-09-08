/**
 * Secure Evidence Encryption Utility
 * 
 * Uses Web Crypto API for AES-256-GCM encryption.
 * 
 * SECURITY MODEL:
 * - Encryption keys are generated client-side using Web Crypto API
 * - Keys are never sent to the server or stored in Supabase
 * - Each encryption operation uses a fresh random IV (96-bit)
 * - AES-256-GCM provides authenticated encryption (confidentiality + integrity)
 * - Keys can be exported/imported as base64 for session management
 * 
 * USAGE:
 * - Generate a session key when user logs in
 * - Use the session key to encrypt evidence before upload
 * - Decrypt evidence on retrieval using the same session key
 * - Store only encrypted content and IV in database
 * - Session keys should be stored in memory/sessionStorage only
 * 
 * LIMITATIONS:
 * - Browser-based encryption is vulnerable to XSS attacks
 * - Keys can be stolen if device is compromised
 * - Session keys are lost if browser session ends
 * - This is client-side encrypted storage, not true end-to-end encryption
 */

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  ciphertext: Uint8Array;
  iv: Uint8Array;
}

/**
 * Encryption result with base64 encoding for database storage
 */
export interface EncryptedDataPayload {
  ciphertext: string; // Base64 encoded ciphertext
  iv: string; // Base64 encoded IV
}

/**
 * Generate a cryptographically secure 256-bit AES-GCM encryption key
 * 
 * @returns CryptoKey for AES-256-GCM encryption/decryption
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256, // 256-bit key
    },
    true, // key is exportable for session management
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data using AES-256-GCM
 * 
 * @param data - Data to encrypt (string or Uint8Array)
 * @param key - AES-256-GCM encryption key
 * @returns Encrypted data with IV
 */
export async function encryptData(
  data: string | Uint8Array,
  key: CryptoKey
): Promise<EncryptedData> {
  // Convert string to Uint8Array if needed
  const dataBytes = typeof data === "string" 
    ? new TextEncoder().encode(data) 
    : data;

  // Generate fresh 96-bit IV for every encryption operation
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits = 12 bytes

  // Encrypt using AES-256-GCM
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    dataBytes as BufferSource
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv: iv,
  };
}

/**
 * Decrypt data using AES-256-GCM
 * 
 * @param encryptedData - Encrypted data with IV
 * @param key - AES-256-GCM encryption key
 * @returns Decrypted data as Uint8Array
 * @throws Error if decryption fails (authentication failure, wrong key, corrupted data)
 */
export async function decryptData(
  encryptedData: EncryptedData,
  key: CryptoKey
): Promise<Uint8Array> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: encryptedData.iv as BufferSource,
      },
      key,
      encryptedData.ciphertext as BufferSource
    );

    return new Uint8Array(decrypted);
  } catch (error) {
    throw new Error(
      "Decryption failed. This may indicate wrong key, corrupted data, or authentication failure."
    );
  }
}

/**
 * Convert encrypted data to base64 for database storage
 * 
 * @param encryptedData - Encrypted data with IV
 * @returns Base64 encoded payload for database
 */
export function encryptedDataToBase64(encryptedData: EncryptedData): EncryptedDataPayload {
  return {
    ciphertext: arrayBufferToBase64(encryptedData.ciphertext),
    iv: arrayBufferToBase64(encryptedData.iv),
  };
}

/**
 * Convert base64 encrypted data back to binary
 * 
 * @param payload - Base64 encoded payload from database
 * @returns Encrypted data with IV
 */
export function base64ToEncryptedData(payload: EncryptedDataPayload): EncryptedData {
  return {
    ciphertext: base64ToUint8Array(payload.ciphertext),
    iv: base64ToUint8Array(payload.iv),
  };
}

/**
 * Export encryption key as base64 for session management
 * 
 * SECURITY NOTE: Exported keys should only be stored in memory or sessionStorage.
 * Never store exported keys in localStorage, cookies, or send to server.
 * 
 * @param key - CryptoKey to export
 * @returns Base64 encoded key
 */
export async function exportEncryptionKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(new Uint8Array(exported));
}

/**
 * Import encryption key from base64
 * 
 * @param base64Key - Base64 encoded key
 * @returns CryptoKey for AES-256-GCM
 */
export async function importEncryptionKey(base64Key: string): Promise<CryptoKey> {
  const keyBytes = base64ToUint8Array(base64Key);
  
  return await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // key is exportable
    ["encrypt", "decrypt"]
  );
}

/**
 * Helper: Convert ArrayBuffer/Uint8Array to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper: Convert base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Calculate SHA-256 hash of data (for integrity verification)
 * 
 * @param data - Data to hash (string or Uint8Array)
 * @returns SHA-256 hash as hex string
 */
export async function computeSha256(data: string | Uint8Array): Promise<string> {
  const dataBytes = typeof data === "string" 
    ? new TextEncoder().encode(data) 
    : data;

  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBytes as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
