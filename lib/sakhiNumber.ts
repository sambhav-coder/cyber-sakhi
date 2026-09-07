/**
 * Sakhi Number Generator
 * 
 * Generates unique Sakhi Numbers in the format: SAKHI-2026-XXXXX
 * where XXXXX is exactly 5 uppercase alphanumeric characters.
 */

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SAKHI_NUMBER_LENGTH = 5;
const SAKHI_PREFIX = "SAKHI-2026-";

/**
 * Generate a cryptographically random Sakhi Number
 * Format: SAKHI-2026-XXXXX (5 uppercase alphanumeric characters)
 * 
 * @returns A unique Sakhi Number string
 */
export function generateSakhiNumber(): string {
  const randomChars: string[] = [];
  
  for (let i = 0; i < SAKHI_NUMBER_LENGTH; i++) {
    const randomIndex = cryptoRandomValue(ALPHANUMERIC.length);
    randomChars.push(ALPHANUMERIC[randomIndex]);
  }
  
  return SAKHI_PREFIX + randomChars.join("");
}

/**
 * Generate a cryptographically secure random integer in range [0, max)
 * Uses Web Crypto API when available, falls back to Math.random()
 * 
 * @param max - Upper bound (exclusive)
 * @returns Random integer in range [0, max)
 */
function cryptoRandomValue(max: number): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] % max;
  }
  
  // Fallback to Math.random() if Web Crypto not available
  return Math.floor(Math.random() * max);
}

/**
 * Validate Sakhi Number format
 * 
 * @param sakhiNumber - The Sakhi Number to validate
 * @returns true if valid format, false otherwise
 */
export function isValidSakhiNumber(sakhiNumber: string): boolean {
  const regex = /^SAKHI-2026-[A-Z0-9]{5}$/;
  return regex.test(sakhiNumber);
}
