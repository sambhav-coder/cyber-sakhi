const GOOGLE_GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

type GmailOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

function configuredValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

/**
 * Gmail's redirect URI is an OAuth-client allow-list entry, not a value that
 * should be inferred from a Host header.  An explicit value also makes local
 * and deployed callback behaviour deterministic behind Vercel/reverse proxies.
 */
export function getGmailRedirectUri(): string {
  const configured =
    configuredValue("GMAIL_OAUTH_REDIRECT_URI") ||
    configuredValue("NEXTAUTH_URL");

  if (!configured) {
    throw new Error("Gmail OAuth redirect URI is not configured.");
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("Gmail OAuth redirect URI is invalid.");
  }

  const isLocalHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Gmail OAuth redirect URI must use HTTPS outside localhost.");
  }

  url.pathname = "/api/gmail/callback";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getGmailOAuthCredentials(): GmailOAuthCredentials {
  const clientId = configuredValue("GOOGLE_GMAIL_CLIENT_ID");
  const clientSecret = configuredValue("GOOGLE_GMAIL_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Gmail OAuth is not configured on the server.");
  }
  return { clientId, clientSecret };
}

export function getGmailReadonlyScope(): string {
  return GOOGLE_GMAIL_READONLY_SCOPE;
}

/** Only OAuth errors that are useful and safe to show to the account holder. */
export function gmailOAuthErrorMessage(error: string | null): string {
  switch (error) {
    case "access_denied":
      return "Gmail access was not granted. You can try connecting again.";
    case "redirect_uri_mismatch":
      return "Gmail connection is not configured for this site. Contact the administrator.";
    case "unauthorized_client":
      return "Gmail connection is not authorized for this application. Contact the administrator.";
    default:
      return "Gmail authorization did not complete. Please try again.";
  }
}
