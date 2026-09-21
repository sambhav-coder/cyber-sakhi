import { describe, it, expect } from "vitest";
import { extractHeaders } from "@/lib/emailParser";
import { decodeMimeWords } from "@/lib/mimeWords";
import { decodeMimeSubject } from "@/lib/emailForensicsParser";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("decodeMimeWords (RFC 2047)", () => {
  it("decodes a base64 UTF-8 Hindi subject", () => {
    expect(decodeMimeWords(`=?UTF-8?B?${b64("खाता बंद होगा")}?=`)).toBe("खाता बंद होगा");
  });

  it("decodes Q-encoded UTF-8 without mojibake", () => {
    expect(decodeMimeWords("=?utf-8?q?Caf=C3=A9_ma=C3=B1ana?=")).toBe("Café mañana");
  });

  it("joins adjacent encoded-words without inserting spaces", () => {
    expect(decodeMimeWords("=?UTF-8?Q?Hel?= =?UTF-8?Q?lo?=")).toBe("Hello");
  });

  it("reassembles a multi-byte character split across two words", () => {
    const bytes = Buffer.from("₹500 refund", "utf8");
    const a = bytes.subarray(0, 2).toString("base64");
    const b = bytes.subarray(2).toString("base64");
    expect(decodeMimeWords(`=?UTF-8?B?${a}?=\r\n =?UTF-8?B?${b}?=`)).toBe("₹500 refund");
  });

  it("keeps plain text around encoded display names", () => {
    expect(decodeMimeWords(`=?UTF-8?B?${b64("राहुल")}?= <rahul@example.com>`)).toBe(
      "राहुल <rahul@example.com>"
    );
  });

  it("decodes legacy charsets", () => {
    expect(decodeMimeWords("=?ISO-8859-1?Q?R=E9sum=E9?=")).toBe("Résumé");
  });

  it("leaves unencoded values untouched", () => {
    expect(decodeMimeWords("Invoice =? pending")).toBe("Invoice =? pending");
  });
});

describe("extractHeaders", () => {
  it("returns decoded subject and From", () => {
    const h = extractHeaders(
      `From: =?UTF-8?B?${b64("एसबीआई")}?= <alert@sbi-kyc.xyz>\r\nSubject: =?UTF-8?B?${b64("तुरंत KYC करें")}?=\r\n\r\nbody`
    );
    expect(h.from).toBe("एसबीआई <alert@sbi-kyc.xyz>");
    expect(h.subject).toBe("तुरंत KYC करें");
  });

  it("does not let an empty header swallow the next header", () => {
    const h = extractHeaders("Subject:\r\nFrom: a@b.com\r\n\r\nbody");
    expect(h.subject).toBeUndefined();
    expect(h.from).toBe("a@b.com");
  });

  it("unfolds a header whose value starts on the next line", () => {
    const h = extractHeaders("Subject:\r\n Your account\r\n\tis locked\r\nFrom: a@b.com\r\n\r\nx");
    expect(h.subject).toBe("Your account is locked");
  });

  it("parses headers of a paste that starts with blank lines", () => {
    const h = extractHeaders("\r\n\r\nFrom: a@b.com\r\nSubject: Hi\r\n\r\nbody");
    expect(h.from).toBe("a@b.com");
    expect(h.subject).toBe("Hi");
  });

  it("keeps rawHeaders undecoded for evidence", () => {
    const raw = `Subject: =?UTF-8?B?${b64("नमस्ते")}?=`;
    expect(extractHeaders(`${raw}\r\n\r\nx`).rawHeaders).toBe(raw);
  });
});

describe("decodeMimeSubject", () => {
  it("uses the shared decoder", () => {
    expect(decodeMimeSubject("=?UTF-8?Q?Hel?= =?UTF-8?Q?lo_=F0=9F=91=8B?=")).toBe("Hello 👋");
  });
});
