import {
  EmailHeaderAnalysis,
  SMTPHop,
} from "./emailTypes";

function getHeaderValue(rawHeaders: string, headerName: string): string | undefined {
  const regex = new RegExp(
    `^${headerName}:\\s*(.+(?:\\r?\\n[ \\t].+)*)$`,
    "im"
  );

  const match = rawHeaders.match(regex);

  if (!match) return undefined;

  return match[1]
    .replace(/\r?\n[ \t]+/g, " ")
    .trim();
}

function getReceivedHeaders(rawHeaders: string): string[] {
  const matches = rawHeaders.match(
    /^Received:\s*(.+(?:\r?\n[ \t].+)*)$/gim
  );

  if (!matches) return [];

  return matches.map((header) =>
    header
      .replace(/^Received:\s*/i, "")
      .replace(/\r?\n[ \t]+/g, " ")
      .trim()
  );
}

export function extractHeaders(rawEmail: string): EmailHeaderAnalysis {
  const headerEnd = rawEmail.search(/\r?\n\r?\n/);

  const rawHeaders =
    headerEnd === -1 ? rawEmail.trim() : rawEmail.slice(0, headerEnd).trim();

  return {
    from: getHeaderValue(rawHeaders, "From"),
    to: getHeaderValue(rawHeaders, "To"),
    cc: getHeaderValue(rawHeaders, "Cc"),
    replyTo: getHeaderValue(rawHeaders, "Reply-To"),
    returnPath: getHeaderValue(rawHeaders, "Return-Path"),
    subject: getHeaderValue(rawHeaders, "Subject"),
    date: getHeaderValue(rawHeaders, "Date"),
    messageId: getHeaderValue(rawHeaders, "Message-ID"),
    authenticationResults: getHeaderValue(
      rawHeaders,
      "Authentication-Results"
    ),
    received: getReceivedHeaders(rawHeaders),
    rawHeaders,
  };
}

function extractIp(value: string): string | undefined {
  const ipv4 =
    value.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];

  if (ipv4) return ipv4;

  const ipv6 =
    value.match(/\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/i)?.[0];

  return ipv6;
}

export function reconstructSMTPPath(
  receivedHeaders: string[]
): SMTPHop[] {
  return receivedHeaders.map((header) => {
    const fromMatch = header.match(
      /\bfrom\s+(.+?)(?=\s+by\s+|\s+\(|;|$)/i
    );

    const byMatch = header.match(
      /\bby\s+(.+?)(?=\s+with\s+|\s+id\s+|\s+\(|;|$)/i
    );

    const ip = extractIp(header);

    const timestampMatch = header.match(
      /;\s*(.+)$/
    );

    return {
      from: fromMatch?.[1]?.trim(),
      by: byMatch?.[1]?.trim(),
      ip,
      timestamp: timestampMatch?.[1]?.trim(),
      raw: header,
    };
  });
}