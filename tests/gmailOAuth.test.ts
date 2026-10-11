import { afterEach, describe, expect, it } from "vitest";
import {
  getGmailRedirectUri,
  getGmailReadonlyScope,
  gmailOAuthErrorMessage,
} from "@/lib/gmailOAuth";

const initialEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, initialEnv);
});

describe("Gmail OAuth configuration", () => {
  it("uses the explicit callback URI and strips untrusted path/query values", () => {
    process.env.GMAIL_OAUTH_REDIRECT_URI = "https://cyber-sakhi.example/other?bad=value";
    expect(getGmailRedirectUri()).toBe("https://cyber-sakhi.example/api/gmail/callback");
  });

  it("allows HTTP only for localhost development", () => {
    process.env.GMAIL_OAUTH_REDIRECT_URI = "http://localhost:3000";
    expect(getGmailRedirectUri()).toBe("http://localhost:3000/api/gmail/callback");
    process.env.GMAIL_OAUTH_REDIRECT_URI = "http://cyber-sakhi.example";
    expect(() => getGmailRedirectUri()).toThrow(/HTTPS/);
  });

  it("requests only Gmail read-only access", () => {
    expect(getGmailReadonlyScope()).toBe("https://www.googleapis.com/auth/gmail.readonly");
  });

  it("does not reflect arbitrary provider errors to the user", () => {
    expect(gmailOAuthErrorMessage("access_denied")).toMatch(/not granted/i);
    expect(gmailOAuthErrorMessage("internal_provider_detail")).not.toContain("internal_provider_detail");
  });
});
