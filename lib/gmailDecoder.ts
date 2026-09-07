export function decodeGmailRaw(raw: string): string {
  if (!raw) {
    throw new Error("Gmail raw message is empty.");
  }

  const normalized = raw
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  return Buffer.from(padded, "base64").toString("utf-8");
}