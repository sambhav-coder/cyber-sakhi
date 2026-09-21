import { describe, expect, it } from "vitest";
import {
  extractValidatedIps,
  isPrivateIp,
  isPublicIp,
  isValidIp,
  isValidIpv4,
  isValidIpv6,
  selectOriginatingIp,
} from "../../lib/ip";
import { reconstructSMTPPath } from "../../lib/emailParser";

describe("strict IPv4 validation", () => {
  it("accepts a valid public IPv4", () => {
    expect(isValidIpv4("8.8.8.8")).toBe(true);
    expect(isPublicIp("8.8.8.8")).toBe(true);
  });

  it("accepts a valid private IPv4 and classifies it as private", () => {
    expect(isValidIpv4("192.168.1.10")).toBe(true);
    expect(isPrivateIp("192.168.1.10")).toBe(true);
    expect(isPublicIp("192.168.1.10")).toBe(false);
  });

  it("rejects an out-of-range octet", () => {
    expect(isValidIpv4("999.1.1.1")).toBe(false);
  });

  it("rejects a leading-zero dotted quad (date/version-like text)", () => {
    expect(isValidIpv4("09.17.02.11")).toBe(false);
    expect(isValidIpv4("09.17.02.10")).toBe(false);
  });

  it("rejects boundary issues: more/fewer octets, trailing junk", () => {
    expect(isValidIpv4("1.2.3")).toBe(false);
    expect(isValidIpv4("1.2.3.4.5")).toBe(false);
    expect(isValidIpv4("1.2.3.4 ")).toBe(false);
    expect(isValidIpv4(" 1.2.3.4")).toBe(false);
  });
});

describe("strict IPv6 validation", () => {
  it("never treats a timestamp as an IPv6 address", () => {
    expect(isValidIpv6("07:08:55")).toBe(false);
    expect(isValidIp("07:08:55")).toBe(false);
    expect(isValidIpv6("17 Sep 2026 07:08:55 +0000".slice(-8))).toBe(false);
  });

  it("accepts a valid compressed IPv6", () => {
    expect(isValidIpv6("2001:db8::1")).toBe(true);
    expect(isValidIpv6("::1")).toBe(true);
    expect(isValidIpv6("fe80::1")).toBe(true);
  });

  it("accepts a valid full (non-compressed) IPv6", () => {
    expect(isValidIpv6("2001:0db8:0000:0000:0000:ff00:0042:8329")).toBe(true);
  });

  it("accepts bracketed IPv6 literals", () => {
    expect(isValidIpv6("[2001:db8::1]")).toBe(true);
  });

  it("accepts IPv4-mapped IPv6 with an embedded IPv4", () => {
    expect(isValidIpv6("::ffff:203.0.113.9")).toBe(true);
    expect(isValidIpv6("2001:db8::192.0.2.1")).toBe(true);
  });

  it("rejects too-few-group colon tokens and malformed compression", () => {
    expect(isValidIpv6("1:2:3")).toBe(false);
    expect(isValidIpv6("07:08:55:11")).toBe(false);
    expect(isValidIpv6("1::2::3")).toBe(false);
    expect(isValidIpv6("gggg:1:2:3:4:5:6:7")).toBe(false);
    expect(isValidIpv6("::ffff:999.1.1.1")).toBe(false);
  });
});

describe("extractValidatedIps", () => {
  it("never extracts a timestamp as an IP", () => {
    expect(extractValidatedIps("07:08:55 +0000")).toEqual([]);
  });

  it("never extracts a leading-zero dotted quad", () => {
    expect(extractValidatedIps("seen 09.17.02.11 in body")).toEqual([]);
  });

  it("extracts a valid IP and ignores the timestamp beside it", () => {
    expect(
      extractValidatedIps(
        "from [203.0.113.5] by mx.example.net; Sat, 17 Sep 2026 07:08:55 +0000"
      )
    ).toEqual(["203.0.113.5"]);
  });

  it("emits an IPv4-mapped IPv6 once, as IPv6, not as a loose quad", () => {
    expect(extractValidatedIps(" via ::ffff:203.0.113.9 end ")).toEqual([
      "203.0.113.9",
    ]);
  });

  it("extracts both families in textual order", () => {
    expect(
      extractValidatedIps("2001:db8::1 relay 8.8.8.8 done 07:08:55")
    ).toEqual(["2001:db8::1", "8.8.8.8"]);
  });
});

describe("reconstructSMTPPath IP extraction", () => {
  it("does not bind a timestamp-only Received header to an IP", () => {
    const header =
      "from mail.example.com by mx.example.net with ESMTPS id abc123; Sat, 17 Sep 2026 07:08:55 +0000";
    const [hop] = reconstructSMTPPath([header]);
    expect(hop.ip).toBeUndefined();
  });

  it("selects the valid IP when a header carries IP and timestamp together", () => {
    const header =
      "from mail.example.com (mail.example.com [203.0.113.5]) by mx.example.net with ESMTPS id abc123; Sat, 17 Sep 2026 07:08:55 +0000";
    const [hop] = reconstructSMTPPath([header]);
    expect(hop.ip).toBe("203.0.113.5");
  });

  it("keeps the timestamp field separate from ip", () => {
    const header =
      "from mail.example.com ([192.0.2.9]) by mx.example.net; Sat, 17 Sep 2026 07:08:55 +0000";
    const [hop] = reconstructSMTPPath([header]);
    expect(hop.ip).toBe("192.0.2.9");
    expect(hop.timestamp).toContain("07:08:55");
  });
});

describe("selectOriginatingIp", () => {
  it("returns unavailable when no public IP exists (private + timestamps only)", () => {
    const hops = reconstructSMTPPath([
      "from [10.1.2.3] by mx.example.net; Sat, 17 Sep 2026 07:08:55 +0000",
      "from 192.168.1.10 by gw.corp.example; Sat, 17 Sep 2026 07:07:00 +0000",
    ]);
    const text = hops.map((h) => h.raw).join("\n");
    expect(selectOriginatingIp(hops, text)).toBeUndefined();
  });

  it("prefers the outermost public hop IP", () => {
    const hops = reconstructSMTPPath([
      "from [198.51.100.7] by mx.example.net; Sat, 17 Sep 2026 07:08:55 +0000",
      "from 192.168.1.10 by gw.corp.example; Sat, 17 Sep 2026 07:07:00 +0000",
    ]);
    const text = hops.map((h) => h.raw).join("\n");
    expect(selectOriginatingIp(hops, text)).toBe("198.51.100.7");
  });

  it("falls back to the last public IP in the chain when the last hop is private", () => {
    const hops = reconstructSMTPPath([
      "from [192.168.0.5] by mx.example.net; Sat, 17 Sep 2026 07:08:55 +0000",
      "from mail.sender.example (mail.sender.example [203.0.113.7]) by gw.corp.example; Sat, 17 Sep 2026 07:07:00 +0000",
    ]);
    const text = hops.map((h) => h.raw).join("\n");
    expect(selectOriginatingIp(hops, text)).toBe("203.0.113.7");
  });

  it("never returns a timestamp as the origin", () => {
    const hops = reconstructSMTPPath([
      "from mail.example.com by mx.example.net; Sat, 17 Sep 2026 07:08:55 +0000",
    ]);
    expect(selectOriginatingIp(hops, "no ip here")).toBeUndefined();
  });
});