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

export function generateMockIpfsCid(hash: string): string {
  const clean = hash.replace(/[^a-f0-9]/gi, "").substring(0, 32);
  return `bafybeic${clean}k4q2l7m6`;
}

export function generateMockTxHash(hash: string): string {
  const clean = hash.replace(/[^a-f0-9]/gi, "").padEnd(64, "0").substring(0, 64);
  return `0x${clean}`;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
