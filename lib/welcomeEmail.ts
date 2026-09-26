import "server-only";
import { getSupabaseServer } from "@/lib/supabaseServer";

const FROM = "Cyber-Sakhi Security <cybersakhi.security@gmail.com>";
const SUBJECT = "Welcome to Cyber-Sakhi — Your Digital Safety Starts Here";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function firstName(name: string | null | undefined): string | null {
  const value = (name ?? "").trim().split(/\s+/)[0];
  return value ? value.slice(0, 80) : null;
}

function privacyUrl(): string | null {
  const base = process.env.NEXTAUTH_URL?.trim();
  if (!base) return null;
  try { return new URL("/privacy", base).toString(); } catch { return null; }
}

export function renderWelcomeEmail(name: string | null | undefined, privacyPolicyUrl: string): string {
  const greeting = firstName(name) ? `Hello ${escapeHtml(firstName(name)!)},` : "Hello there,";
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden"><tr><td style="padding:28px 32px;background:#071a2c;color:#e6fffb"><div style="font-size:20px;font-weight:700;letter-spacing:1px">CYBER-SAKHI</div><div style="margin-top:6px;font-size:12px;color:#99f6e4">Digital safety and threat analysis</div></td></tr><tr><td style="padding:30px 32px;font-size:15px;line-height:1.6"><h1 style="margin:0 0 18px;font-size:25px;color:#0f172a">Welcome to Cyber-Sakhi</h1><p>${greeting}</p><p>Welcome to Cyber-Sakhi. Our platform helps you identify, understand and respond to suspicious digital activity.</p><h2 style="font-size:16px">What Cyber-Sakhi can help with</h2><ul><li>Suspicious and phishing email analysis</li><li>Threat and indicator analysis</li><li>Fraud and malicious-link investigation</li><li>Evidence preservation and security case tracking</li><li>Threat intelligence and investigation context</li></ul><h2 style="font-size:16px">Your privacy &amp; security</h2><p>Use the platform only for legitimate security and investigative purposes, and only process information you are authorized to access.</p><h2 style="font-size:16px">Security guidelines</h2><ul><li>Never share your password, authentication codes or API keys.</li><li>Do not upload information you are not authorized to process.</li><li>Verify suspicious links and messages before interacting with them.</li><li>Be cautious with unexpected attachments and requests for sensitive information.</li></ul><p style="margin:26px 0"><a href="${escapeHtml(privacyPolicyUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">Read Privacy Policy</a></p><p style="font-size:13px;color:#475569">Cyber-Sakhi Security<br>cybersakhi.security@gmail.com<br><br>Stay safe online.</p></td></tr></table></td></tr></table></body></html>`;
}

/** Best-effort and deliberately non-throwing: account creation must succeed
 * even when Resend, sender verification, or the network is unavailable. */
export async function sendWelcomeEmailOnce(input: { userId: string; email: string; name?: string | null; isDemo?: boolean }): Promise<void> {
  if (input.isDemo || input.email.toLowerCase() === "dhairya.sharma.01315616124@adgips.ac.in") return;
  const key = process.env.RESEND_API_KEY;
  const privacy = privacyUrl();
  if (!key || !privacy) { console.error("[welcome-email] skipped: email configuration unavailable"); return; }
  try {
    const db = getSupabaseServer();
    const { data: profile, error: lookupError } = await db.from("profiles").select("welcome_email_sent_at").eq("id", input.userId).maybeSingle();
    if (lookupError || profile?.welcome_email_sent_at) return;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `cybersakhi-welcome-${input.userId}` },
      body: JSON.stringify({ from: FROM, to: [input.email], subject: SUBJECT, html: renderWelcomeEmail(input.name, privacy) }),
    });
    if (!response.ok) { console.error("[welcome-email] Resend rejected delivery", response.status); return; }
    const { error: updateError } = await db.from("profiles").update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", input.userId).is("welcome_email_sent_at", null);
    if (updateError) console.error("[welcome-email] delivery marker update failed");
  } catch { console.error("[welcome-email] delivery attempt failed"); }
}
