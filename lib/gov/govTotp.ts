import crypto from "node:crypto";
import { getSupabaseServer } from "@/lib/supabaseServer";

type MfaFactorRow = {
  officer_id: string;
  secret_ciphertext: string;
  enabled_at: string | null;
  revoked_at: string | null;
};

function encryptionKey(): Buffer | null {
  const raw = process.env.GOV_MFA_ENCRYPTION_KEY;
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, "base64");
    return key.length === 32 ? key : null;
  } catch { return null; }
}

/** AES-256-GCM ciphertext format: base64(iv[12] || tag[16] || plaintext). */
export function encryptGovTotpSecret(secret: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("GOV_MFA_ENCRYPTION_KEY must be a 32-byte base64 key.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function decryptGovTotpSecret(ciphertext: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const packed = Buffer.from(ciphertext, "base64");
    if (packed.length < 29) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
  } catch { return null; }
}

function decodeBase32(value: string): Buffer | null {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = "";
  for (const char of clean) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function verifyTotpCode(secret: string, code: string, nowMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = decodeBase32(secret);
  if (!key) return false;
  for (const offset of [-1, 0, 1]) {
    const counter = Math.floor(nowMs / 30_000) + offset;
    const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac("sha1", key).update(bytes).digest();
    const index = digest[digest.length - 1] & 15;
    const expected = ((digest[index] & 127) << 24 | digest[index + 1] << 16 | digest[index + 2] << 8 | digest[index + 3]) % 1_000_000;
    if (crypto.timingSafeEqual(Buffer.from(code), Buffer.from(String(expected).padStart(6, "0")))) return true;
  }
  return false;
}

export async function verifyGovOfficerTotp(officerId: string, code: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer().from("gov_mfa_factors").select("officer_id,secret_ciphertext,enabled_at,revoked_at").eq("officer_id", officerId).is("revoked_at", null).maybeSingle();
  if (error || !data) return false;
  const factor = data as MfaFactorRow;
  const secret = factor.enabled_at ? decryptGovTotpSecret(factor.secret_ciphertext) : null;
  return secret !== null && verifyTotpCode(secret, code);
}
