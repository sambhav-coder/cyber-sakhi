import { randomInt } from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALPHABET_LENGTH = ALPHABET.length;

function randomSegment(length: number): string {
  let segment = "";
  for (let i = 0; i < length; i++) {
    segment += ALPHABET[randomInt(ALPHABET_LENGTH)];
  }
  return segment;
}

export function generateCaseNumber(now: Date = new Date()): string {
  return `CS-${now.getUTCFullYear()}-${randomSegment(6)}`;
}

export function generateEvidenceCode(now: Date = new Date()): string {
  return `EV-${now.getUTCFullYear()}-${randomSegment(8)}`;
}

export function isValidCaseNumber(value: string): boolean {
  return /^CS-\d{4}-[A-Z2-9]{6}$/.test(value);
}

export function isValidEvidenceCode(value: string): boolean {
  return /^EV-\d{4}-[A-Z2-9]{8}$/.test(value);
}