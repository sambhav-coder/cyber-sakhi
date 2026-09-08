/**
 * Session Key Management Utility
 * 
 * Manages encryption session keys for evidence encryption/decryption.
 * Keys are stored in sessionStorage only (cleared on browser close).
 * Never stores keys in localStorage, cookies, or sends to server.
 */

import {
  generateEncryptionKey,
  exportEncryptionKey,
  importEncryptionKey,
} from "./encryption";

const SESSION_KEY_STORAGE_KEY = "cyber_sakhi_encryption_session_key";

/**
 * Get or create a session encryption key
 * Generates a new key if one doesn't exist in current session
 * 
 * @returns CryptoKey for AES-256-GCM encryption
 */
export async function getOrCreateSessionKey(): Promise<CryptoKey> {
  // Check if key exists in sessionStorage
  const existingKeyBase64 = sessionStorage.getItem(SESSION_KEY_STORAGE_KEY);
  
  if (existingKeyBase64) {
    try {
      return await importEncryptionKey(existingKeyBase64);
    } catch (error) {
      // If import fails, generate new key
      console.warn("Failed to import existing session key, generating new one");
      sessionStorage.removeItem(SESSION_KEY_STORAGE_KEY);
    }
  }
  
  // Generate new session key
  const newKey = await generateEncryptionKey();
  const exportedKey = await exportEncryptionKey(newKey);
  sessionStorage.setItem(SESSION_KEY_STORAGE_KEY, exportedKey);
  
  return newKey;
}

/**
 * Get existing session key without creating new one
 * 
 * @returns CryptoKey if exists, null otherwise
 */
export async function getSessionKey(): Promise<CryptoKey | null> {
  const existingKeyBase64 = sessionStorage.getItem(SESSION_KEY_STORAGE_KEY);
  
  if (!existingKeyBase64) {
    return null;
  }
  
  try {
    return await importEncryptionKey(existingKeyBase64);
  } catch (error) {
    // Invalid key in storage
    sessionStorage.removeItem(SESSION_KEY_STORAGE_KEY);
    return null;
  }
}

/**
 * Clear the session key from storage
 * Call this when user logs out or session expires
 */
export function clearSessionKey(): void {
  sessionStorage.removeItem(SESSION_KEY_STORAGE_KEY);
}

/**
 * Check if session key exists
 * 
 * @returns true if session key exists
 */
export function hasSessionKey(): boolean {
  return sessionStorage.getItem(SESSION_KEY_STORAGE_KEY) !== null;
}
