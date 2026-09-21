/**
 * Centralized server-side sanitizer for blockchain / RPC error messages.
 *
 * Provider errors (ethers `JsonRpcProvider`, `Wallet`, contract calls) can
 * embed the RPC URL — which contains the Infura project id / API key — or
 * other credential-bearing connection strings in their `.message`. Anything
 * produced here must be safe to echo back through API responses.
 *
 * Guarantees:
 * - The exact `BLOCKCHAIN_RPC_URL` and `BLOCKCHAIN_PRIVATE_KEY` values are
 *   never present in the output.
 * - Credential-bearing RPC URLs (Infura /v3/<key>, generic user:pass@host)
 *   have their secret parts redacted while host/path details are kept for
 *   debugging.
 * - Private-key-like 64-hex tokens and secret query params are redacted.
 * - Non-sensitive error text passes through unchanged.
 */

const REDACTED = "[REDACTED]";
const REDACTED_CREDS = "[REDACTED_CREDS]";
const REDACTED_HEX = "[REDACTED_HEX]";

/** Collapse an unknown thrown value into its message string. */
function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return String(err || "");
}

/** Redact the exact configured env secrets if they appear verbatim. */
function redactKnownEnvValues(input: string): string {
  let out = input;

  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim();
  if (rpcUrl) {
    out = out.split(rpcUrl).join(REDACTED);
  }

  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY?.trim();
  if (privateKey) {
    const raw = privateKey.replace(/^0x/i, "");
    if (raw) {
      out = out
        .split(privateKey)
        .join(REDACTED)
        .split(raw)
        .join(REDACTED);
    }
  }

  return out;
}

/** `/v2/<key>` and `/v3/<key>` style API-key path segments (Infura, Alchemy, …). */
const API_KEY_PATH_RE = /(\/[vV][23]\/)[A-Za-z0-9_-]+/g;

/** Standard URI credentials, e.g. `https://user:pass@host` or `postgres://u:p@h`. */
const URI_CREDENTIALS_RE = /([a-z][a-z0-9+.-]*:\/\/)([^@\s/:]+:[^@\s]*)(@)/gi;

/** Secret-bearing query/form params. Keeps the key name, redacts the value. */
const SECRET_PARAM_RE =
  /([?&#](?:api[_-]?key|apikey|access_token|auth|password|secret|signature|sig|token|x-api-key)[=:])([^&#\s"'`]+)/gi;

/** Private-key-like tokens: 64 hex chars, optionally 0x-prefixed. */
const HEX_64_RE = /\b(?:0x)?[0-9a-fA-F]{64}\b/g;

/**
 * Sanitize arbitrary sensitive text (used for reason strings that may embed
 * connection details). Preserves non-sensitive debugging information.
 */
export function sanitizeSensitiveText(input: string): string {
  let out = redactKnownEnvValues(input);

  out = out.replace(URI_CREDENTIALS_RE, `$1${REDACTED_CREDS}$3`);
  out = out.replace(API_KEY_PATH_RE, `$1${REDACTED}`);
  out = out.replace(SECRET_PARAM_RE, `$1${REDACTED}`);
  out = out.replace(HEX_64_RE, REDACTED_HEX);

  out = out.trim();
  return out.length > 0 ? out : "[redacted error message]";
}

/**
 * Produce a client-safe error string from an unknown thrown value.
 * Never contains RPC URLs, Infura credentials, private keys, or env secrets.
 * Returns a non-empty fallback when nothing useful survives redaction.
 */
export function sanitizeBlockchainErrorMessage(err: unknown): string {
  const message = toMessage(err);
  if (!message) return "unknown error";
  return sanitizeSensitiveText(message);
}