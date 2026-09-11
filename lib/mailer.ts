// Minimal email transport for password recovery. Uses the Resend REST API
// over plain fetch (Node 18+ built-in) so NO extra npm dependency is needed.
//
// Required environment variables (set in the Vercel project settings):
//   RESEND_API_KEY  - API key from https://resend.com (Create API Key)
//   EMAIL_FROM      - a verified "From" address, e.g. "Cyber Sakhi <no-reply@yourdomain.com>"
//
// isEmailConfigured() drives the public API so the app never pretends a
// recovery email was sent when no provider is configured.
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function missingEmailConfig(): string[] {
  const missing: string[] = [];
  if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!process.env.EMAIL_FROM) missing.push("EMAIL_FROM");
  return missing;
}

export async function sendRecoveryEmail(opts: {
  to: string;
  name?: string;
  recoveryLink: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      ok: false,
      error: `Email provider is not configured. Missing: ${missingEmailConfig().join(", ")}`,
    };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a18;border-radius:16px">
      <h2 style="color:#ef4444;margin:0 0 12px">Cyber Sakhi — Password Recovery</h2>
      <p style="color:#e2e8f0;line-height:1.6">Hello${opts.name ? ` ${opts.name}` : ""},</p>
      <p style="color:#cbd5e1;line-height:1.6">
        We received a request to recover your Cyber Sakhi account credentials.
        Use the link below to set a new password. This link expires in 15 minutes.
      </p>
      <p style="margin:24px 0">
        <a href="${opts.recoveryLink}"
           style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:10px">
          Set a new password
        </a>
      </p>
      <p style="color:#94a3b8;font-size:13px;line-height:1.6">
        If you did not request this, you can safely ignore this email. Your password will
        stay the same until you use this link.
      </p>
      <p style="color:#64748b;font-size:12px;margin-top:20px">Never share your Sakhi Number or password with anyone.</p>
    </div>
  `;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: "Cyber Sakhi — Recover your account",
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[recover][email] Resend error", res.status, detail.slice(0, 300));
      return { ok: false, error: `Email provider rejected the request (HTTP ${res.status}).` };
    }

    return { ok: true };
  } catch (error) {
    console.error("[recover][email] Network error sending recovery email:", error);
    return { ok: false, error: "Could not reach the email provider." };
  }
}