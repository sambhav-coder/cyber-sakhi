/**
 * Parser for Email Forensics evidence notes
 * Extracts structured data from the Email Forensic Analysis Report format
 */

import { decodeMimeWords } from "./mimeWords";

export interface ParsedEmailForensicsData {
  isEmailForensics: boolean;
  threatLevel?: string;
  threatScore?: string;
  spoofingDetected?: string;
  authentication?: {
    spf?: string;
    spfDetails?: string;
    dkim?: string;
    dkimDetails?: string;
    dmarc?: string;
    dmarcDetails?: string;
  };
  senderInfo?: {
    from?: string;
    fromEmail?: string;
    fromName?: string;
    to?: string;
    subject?: string;
    decodedSubject?: string;
    date?: string;
    senderDomain?: string;
    originatingIP?: string;
  };
  smtpPath?: {
    originatingIP?: string;
    hops?: string;
  };
  findings?: string[];
  recommendations?: string[];
  indicators?: string[];
  rawReport?: string;
}

/**
 * Parses Email Forensics notes string into structured data
 * Returns null if the notes don't match the Email Forensics format
 */
export function parseEmailForensicsNotes(notes: string): ParsedEmailForensicsData | null {
  if (!notes || typeof notes !== 'string') {
    return null;
  }

  // Check if this is an Email Forensics report
  if (!notes.includes('Email Forensic Analysis Report')) {
    return null;
  }

  const result: ParsedEmailForensicsData = {
    isEmailForensics: true,
    rawReport: notes
  };

  try {
    const lines = notes.split('\n');
    let currentSection: string | null = null;
    let findingsBuffer: string[] = [];
    let recommendationsBuffer: string[] = [];
    let indicatorsBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Detect section headers
      if (line.startsWith('Threat Level:')) {
        result.threatLevel = line.replace('Threat Level:', '').trim();
      } else if (line.startsWith('Threat Score:')) {
        result.threatScore = line.replace('Threat Score:', '').trim();
      } else if (line.startsWith('Spoofing Detected:')) {
        result.spoofingDetected = line.replace('Spoofing Detected:', '').trim();
      } else if (line === 'Authentication Results:') {
        currentSection = 'authentication';
      } else if (line === 'Sender Information:') {
        currentSection = 'senderInfo';
      } else if (line === 'SMTP Path:') {
        currentSection = 'smtpPath';
      } else if (line === 'Key Findings:') {
        currentSection = 'findings';
      } else if (line === 'Recommendations:') {
        currentSection = 'recommendations';
      } else if (line.startsWith('Extracted Indicators:')) {
        currentSection = 'indicators';
        // Extract count from line like "Extracted Indicators: 5"
        const countMatch = line.match(/Extracted Indicators:\s*(\d+)/);
        if (countMatch) {
          // We'll count the actual indicators below
        }
      } else if (line.startsWith('-')) {
        // Parse list items based on current section
        const item = line.replace(/^-\s*/, '').trim();
        
        if (currentSection === 'authentication') {
          if (!result.authentication) result.authentication = {};
          if (item.startsWith('SPF:')) {
            const spfValue = item.replace('SPF:', '').trim();
            // Extract status and details
            const spfMatch = spfValue.match(/^(\w+)(?:\s*\((.*)\))?$/);
            if (spfMatch) {
              result.authentication.spf = spfMatch[1];
              result.authentication.spfDetails = spfMatch[2] || '';
            } else {
              result.authentication.spf = spfValue;
            }
          } else if (item.startsWith('DKIM:')) {
            const dkimValue = item.replace('DKIM:', '').trim();
            const dkimMatch = dkimValue.match(/^(\w+)(?:\s*\((.*)\))?$/);
            if (dkimMatch) {
              result.authentication.dkim = dkimMatch[1];
              result.authentication.dkimDetails = dkimMatch[2] || '';
            } else {
              result.authentication.dkim = dkimValue;
            }
          } else if (item.startsWith('DMARC:')) {
            const dmarcValue = item.replace('DMARC:', '').trim();
            const dmarcMatch = dmarcValue.match(/^(\w+)(?:\s*\((.*)\))?$/);
            if (dmarcMatch) {
              result.authentication.dmarc = dmarcMatch[1];
              result.authentication.dmarcDetails = dmarcMatch[2] || '';
            } else {
              result.authentication.dmarc = dmarcValue;
            }
          }
        } else if (currentSection === 'senderInfo') {
          if (!result.senderInfo) result.senderInfo = {};
          if (item.startsWith('From:')) {
            const fromValue = item.replace('From:', '').trim();
            result.senderInfo.from = fromValue;
            const parsed = parseSenderFrom(fromValue);
            result.senderInfo.fromName = parsed.name;
            result.senderInfo.fromEmail = parsed.email;
          } else if (item.startsWith('To:')) {
            result.senderInfo.to = item.replace('To:', '').trim();
          } else if (item.startsWith('Subject:')) {
            const subjectValue = item.replace('Subject:', '').trim();
            result.senderInfo.subject = subjectValue;
            result.senderInfo.decodedSubject = decodeMimeSubject(subjectValue);
          } else if (item.startsWith('Date:')) {
            result.senderInfo.date = item.replace('Date:', '').trim();
          } else if (item.startsWith('Sender Domain:')) {
            result.senderInfo.senderDomain = item.replace('Sender Domain:', '').trim();
          }
        } else if (currentSection === 'smtpPath') {
          if (!result.smtpPath) result.smtpPath = {};
          if (item.startsWith('Originating IP:')) {
            const ipValue = item.replace('Originating IP:', '').trim();
            result.smtpPath.originatingIP = ipValue;
            // Also store in senderInfo for easier access
            if (!result.senderInfo) result.senderInfo = {};
            result.senderInfo.originatingIP = ipValue;
          } else if (item.startsWith('Hops:')) {
            result.smtpPath.hops = item.replace('Hops:', '').trim();
          }
        } else if (currentSection === 'findings' && item.startsWith('•')) {
          findingsBuffer.push(item.replace(/^•\s*/, '').trim());
        } else if (currentSection === 'recommendations' && item.startsWith('•')) {
          recommendationsBuffer.push(item.replace(/^•\s*/, '').trim());
        } else if (currentSection === 'indicators' && item.startsWith('•')) {
          indicatorsBuffer.push(item.replace(/^•\s*/, '').trim());
        }
      }
    }

    // Assign the buffers to result (limit to prevent huge arrays)
    result.findings = findingsBuffer.slice(0, 10); // Show max 10 findings
    result.recommendations = recommendationsBuffer.slice(0, 5); // Show max 5 recommendations
    result.indicators = indicatorsBuffer.slice(0, 8); // Show max 8 indicators

    return result;
  } catch (error) {
    console.error('Error parsing Email Forensics notes:', error);
    // Return partial data on error
    return result;
  }
}

/**
 * Gets threat level color class based on threat level
 */
export function getThreatLevelColor(threatLevel?: string): string {
  const colorMap: Record<string, string> = {
    'CRITICAL': 'text-red-400 bg-red-950/40 border-red-700/50',
    'HIGH': 'text-orange-400 bg-orange-950/40 border-orange-700/50',
    'MEDIUM': 'text-amber-400 bg-amber-950/40 border-amber-700/50',
    'LOW': 'text-sky-400 bg-sky-950/40 border-sky-700/50',
    'SAFE': 'text-emerald-400 bg-emerald-950/40 border-emerald-700/50',
  };
  return colorMap[threatLevel || ''] || 'text-slate-400 bg-slate-950/40 border-slate-700/50';
}

/**
 * Gets authentication status color class
 */
export function getAuthStatusColor(status?: string): string {
  if (!status) return 'text-slate-400';
  const s = status.toLowerCase();
  if (s === 'pass') return 'text-emerald-400';
  if (s === 'fail') return 'text-red-400';
  if (s === 'neutral' || s === 'none') return 'text-amber-400';
  return 'text-slate-400';
}

/**
 * Decode MIME-encoded subject
 * Handles =?UTF-8?Q?...?= and =?UTF-8?B?...?= formats
 */
export function decodeMimeSubject(subject?: string): string {
  if (!subject) return '';
  return (decodeMimeWords(subject) ?? subject).replace(/s+/g, ' ').trim();
}

/**
 * Extract sender name and email from From header
 * Handles formats like "Display Name <email@domain.com>" and just "email@domain.com"
 */
export function parseSenderFrom(from?: string): { name?: string; email?: string } {
  if (!from) return {};
  
  try {
    // Try to extract name and email from angle bracket format
    const angleMatch = from.match(/^(.*?)\s*<([^>]+)>$/);
    if (angleMatch) {
      let name = angleMatch[1].trim().replace(/^["']|["']$/g, ''); // Remove quotes
      const email = angleMatch[2].trim();
      
      // If name is empty or same as email, just use email
      if (!name || name === email) {
        return { email };
      }
      
      return { name, email };
    }
    
    // If no angle brackets, treat entire string as email
    if (from.includes('@')) {
      return { email: from.trim() };
    }
    
    // If it doesn't look like an email, treat as name
    return { name: from.trim() };
  } catch (e) {
    return { email: from.trim() };
  }
}

/**
 * Format date and time from ISO timestamp
 */
export function formatDateTime(isoString?: string): { date?: string; time?: string } {
  if (!isoString) return {};
  
  try {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    };
  } catch (e) {
    return {};
  }
}