import { DomainIntelligence } from "./emailTypes";

interface DnsAnswer {
  data?: string;
  type?: number;
}

interface DnsResponse {
  Answer?: DnsAnswer[];
  Status?: number;
}

async function lookupDnsRecord(
  domain: string,
  recordType: "MX" | "NS"
): Promise<string[]> {
  try {
    const url =
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}` +
      `&type=${recordType}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/dns-json",
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as DnsResponse;

    return (data.Answer || [])
      .map((answer) => answer.data?.trim())
      .filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

function isSuspiciousDomain(domain: string): boolean {
  const lowerDomain = domain.toLowerCase();

  // Common high-risk / abuse-associated TLDs.
  const suspiciousTlds = [
    ".xyz",
    ".top",
    ".click",
    ".tk",
    ".ml",
    ".ga",
    ".cf",
    ".gq",
    ".pw",
    ".cc",
    ".zip",
    ".review",
    ".loan",
    ".win",
  ];

  if (suspiciousTlds.some((tld) => lowerDomain.endsWith(tld))) {
    return true;
  }

  // Very long domains can be a phishing signal.
  if (lowerDomain.length > 60) {
    return true;
  }

  // Excessive subdomains can be suspicious.
  if (lowerDomain.split(".").length >= 5) {
    return true;
  }

  return false;
}

export async function lookupDomainIntelligence(
  domain: string
): Promise<DomainIntelligence | undefined> {
  const normalizedDomain = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .split("/")[0];

  if (!normalizedDomain || !normalizedDomain.includes(".")) {
    return undefined;
  }

  try {
    const [mx, ns] = await Promise.all([
      lookupDnsRecord(normalizedDomain, "MX"),
      lookupDnsRecord(normalizedDomain, "NS"),
    ]);

    return {
      domain: normalizedDomain,
      mx,
      ns,
      suspicious: isSuspiciousDomain(normalizedDomain),
    };
  } catch {
    return undefined;
  }
}