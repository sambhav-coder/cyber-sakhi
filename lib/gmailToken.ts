import crypto from "crypto";

const COOKIE_NAME = "cyber_sakhi_gmail_token";

function getEncryptionKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not configured.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptGmailToken(token: string): string {
  const key = getEncryptionKey();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptGmailToken(payload: string): string {
  const parts = payload.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted Gmail token.");
  }

  const [ivPart, authTagPart, encryptedPart] = parts;

  const key = getEncryptionKey();

  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(authTagPart, "base64url");
  const encrypted = Buffer.from(encryptedPart, "base64url");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function getGmailTokenCookieName(): string {
  return COOKIE_NAME;
}