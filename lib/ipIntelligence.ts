import { IPIntelligence } from "./emailTypes";

interface IpApiResponse {
  ip?: string;
  city?: string;
  region?: string;
  country_name?: string;
  asn?: string;
  org?: string;
  error?: boolean;
  reason?: string;
  message?: string;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  if (parts.some((part) => part < 0 || part > 255)) {
    return true;
  }

  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;

  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }

  return false;
}

export async function lookupIpIntelligence(
  ip: string
): Promise<IPIntelligence | undefined> {
  if (!ip || isPrivateOrReservedIp(ip)) {
    return undefined;
  }

  try {
    const response = await fetch(
  `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
  {
    headers: {
      Accept: "application/json",
      "User-Agent": "Cyber-Sakhi/1.0",
    },
  }
);


    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as IpApiResponse;

    if (data.error || !data.ip) {
      return undefined;
    }

    return {
      ip: data.ip,
      country: data.country_name,
      region: data.region,
      city: data.city,
      organization: data.org,
      asn: data.asn,
    };
  } catch {
    return undefined;
  }
}