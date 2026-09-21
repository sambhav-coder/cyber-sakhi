import { describe, expect, it } from "vitest";
import { getClientIp, isCrossOriginRequest } from "../../lib/gov/govHttp";

function mockRequest(init?: RequestInit): Request {
  return new Request("http://gov.example.test/gov/api/login", init);
}

describe("govHttp getClientIp", () => {
  it("returns the first x-forwarded-for hop", () => {
    const req = mockRequest({
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = mockRequest({ headers: { "x-real-ip": "198.51.100.4" } });
    expect(getClientIp(req)).toBe("198.51.100.4");
  });

  it("rejects a header value containing unexpected characters", () => {
    const req = mockRequest({ headers: { "x-forwarded-for": "1.2.3.4<script>" } });
    expect(getClientIp(req)).toBeNull();
  });

  it("rejects a bare token rather than trusting it wholesale", () => {
    const req = mockRequest({ headers: { "x-forwarded-for": "lynx/2.8" } });
    expect(getClientIp(req)).toBeNull();
  });

  it("returns null when no IP headers are present", () => {
    expect(getClientIp(mockRequest())).toBeNull();
  });
});

describe("govHttp isCrossOriginRequest", () => {
  it("accepts same-origin POSTs", () => {
    const req = mockRequest({ headers: { origin: "http://gov.example.test" } });
    expect(isCrossOriginRequest(req)).toBe(false);
  });

  it("rejects cross-origin POSTs", () => {
    const req = mockRequest({ headers: { origin: "https://evil.example" } });
    expect(isCrossOriginRequest(req)).toBe(true);
  });

  it("accepts requests with no Origin header", () => {
    expect(isCrossOriginRequest(mockRequest())).toBe(false);
  });

  it("rejects malformed Origin values", () => {
    const req = mockRequest({ headers: { origin: "not a url" } });
    expect(isCrossOriginRequest(req)).toBe(true);
  });
});