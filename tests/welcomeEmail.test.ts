import { describe, expect, it } from "vitest";
import { renderWelcomeEmail } from "../lib/welcomeEmail";

describe("welcome email", () => {
  it("renders a personalized, safe English email with the real privacy route", () => {
    const html = renderWelcomeEmail("Sambhav <Admin>", "https://cybersakhi.example/privacy");
    expect(html).toContain("Hello Sambhav");
    expect(html).toContain("&lt;Admin&gt;");
    expect(html).toContain("Welcome to Cyber-Sakhi");
    expect(html).toContain("Read Privacy Policy");
    expect(html).toContain("https://cybersakhi.example/privacy");
    expect(html).not.toContain("RESEND_API_KEY");
  });
});
