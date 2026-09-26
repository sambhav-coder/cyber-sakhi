/**
 * SIH Demo Email Dataset
 * 
 * Sanitized sample emails for forensic demonstration.
 * These are clearly marked as demo data and do not contain real private information.
 */

export interface DemoEmail {
  id: string;
  threadId?: string;
  labelIds: string[];
  snippet: string;
  internalDate: number;
  sizeEstimate: number;
  from: string;
  to: string;
  subject: string;
  date: string;
  raw: string; // Full MIME source for forensic analysis
  forensicType: "normal" | "phishing" | "spoofed" | "suspicious" | "spf-dkim-dmarc" | "threat-indicators" | "smtp-relay";
  description: string;
}

/**
 * Generate realistic timestamps for demo emails spread over recent days
 */
function generateTimestamp(daysAgo: number, hour: number): number {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  return date.getTime();
}

/**
 * Demo email samples with full MIME sources for forensic analysis
 */
export const DEMO_EMAILS: DemoEmail[] = [
  {
    id: "demo_normal_001",
    threadId: "thread_normal_001",
    labelIds: ["INBOX"],
    snippet: "Regarding the project deadline extension request for the cybersecurity course...",
    internalDate: generateTimestamp(0, 14),
    sizeEstimate: 2847,
    from: "Dr. Sarah Chen <sarah.chen@university.edu>",
    to: "SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>",
    subject: "Re: Project Deadline Extension",
    date: new Date(generateTimestamp(0, 14)).toUTCString(),
    raw: `From: Dr. Sarah Chen <sarah.chen@university.edu>
To: SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>
Subject: Re: Project Deadline Extension
Date: ${new Date(generateTimestamp(0, 14)).toUTCString()}
Message-ID: <demo.normal.001@demo.cybersakhi.org>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Hi,

I've reviewed your project deadline extension request. Given the circumstances
you mentioned, I'm happy to grant a 3-day extension. Please submit your final
report by Friday at 5 PM.

Let me know if you need any additional resources.

Best regards,
Dr. Sarah Chen
Department of Computer Science`,
    forensicType: "normal",
    description: "Normal legitimate email with proper headers and SPF/DKIM validation"
  },
  {
    id: "demo_phishing_001",
    threadId: "thread_phishing_001",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "URGENT: Your account will be suspended within 24 hours unless you verify your identity...",
    internalDate: generateTimestamp(1, 9),
    sizeEstimate: 3456,
    from: "Security Alert <security-alert@g00gle-verify.com>",
    to: "SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>",
    subject: "URGENT: Account Suspension Notice - Verify Immediately",
    date: new Date(generateTimestamp(1, 9)).toUTCString(),
    raw: `From: Security Alert <security-alert@g00gle-verify.com>
To: SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>
Subject: URGENT: Account Suspension Notice - Verify Immediately
Date: ${new Date(generateTimestamp(1, 9)).toUTCString()}
Message-ID: <demo.phishing.001@demo.cybersakhi.org>
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<html>
<body>
<h2>URGENT: Account Suspension Notice</h2>
<p>Dear User,</p>
<p>Your account will be suspended within 24 hours unless you verify your identity immediately.</p>
<p><a href="http://fake-verification-site.com/verify">Click here to verify your account</a></p>
<p>If you do not verify, all your data will be permanently deleted.</p>
<p>Security Team<br>Google Account Protection</p>
</body>
</html>`,
    forensicType: "phishing",
    description: "Phishing attempt with fake domain (g00gle-verify.com) and urgent language"
  },
  {
    id: "demo_spoofed_001",
    threadId: "thread_spoofed_001",
    labelIds: ["INBOX", "SPAM"],
    snippet: "Payment confirmation for your recent purchase of $2,499.00 from Apple Store...",
    internalDate: generateTimestamp(2, 16),
    sizeEstimate: 2987,
    from: "Apple Store <noreply@apple.com>",
    to: "SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>",
    subject: "Payment Confirmation - Order #APPLE-2024-DEMO",
    date: new Date(generateTimestamp(2, 16)).toUTCString(),
    raw: `From: Apple Store <noreply@apple.com>
To: SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>
Subject: Payment Confirmation - Order #APPLE-2024-DEMO
Date: ${new Date(generateTimestamp(2, 16)).toUTCString()}
Message-ID: <demo.spoofed.001@demo.cybersakhi.org>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
Received: from unknown-sender [192.0.2.45] by mail-server.example.com

Dear Customer,

Thank you for your recent purchase of $2,499.00 from Apple Store.

Order Details:
- Order Number: APPLE-2024-DEMO
- Total: $2,499.00
- Payment Method: Credit Card ending in 1234

If you did not make this purchase, please contact our support team immediately.

Apple Store Team`,
    forensicType: "spoofed",
    description: "Spoofed sender (apple.com) with suspicious IP address and missing SPF/DKIM"
  },
  {
    id: "demo_suspicious_001",
    threadId: "thread_suspicious_001",
    labelIds: ["INBOX"],
    snippet: "I noticed you've been active on our platform and wanted to offer you an exclusive opportunity...",
    internalDate: generateTimestamp(3, 11),
    sizeEstimate: 4201,
    from: "Investment Opportunity <wealth-builder@financial-network.net>",
    to: "SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>",
    subject: "Exclusive Investment Opportunity - 500% Returns Guaranteed",
    date: new Date(generateTimestamp(3, 11)).toUTCString(),
    raw: `From: Investment Opportunity <wealth-builder@financial-network.net>
To: SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>
Subject: Exclusive Investment Opportunity - 500% Returns Guaranteed
Date: ${new Date(generateTimestamp(3, 11)).toUTCString()}
Message-ID: <demo.suspicious.001@demo.cybersakhi.org>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Dear Friend,

I noticed you've been active on our platform and wanted to offer you an exclusive opportunity.

Our proprietary trading algorithm has generated 500% returns for our members in just 3 months.

Act now and you can:
- Get guaranteed 500% returns
- Zero risk investment
- Daily payouts
- Complete financial freedom

This offer is only valid for 24 hours.

Click here to secure your position: http://investment-scam-demo.com/secure

Best regards,
Wealth Builder Network`,
    forensicType: "suspicious",
    description: "Suspicious investment scam with unrealistic promises and urgency"
  },
  {
    id: "demo_spf_dkim_dmarc_001",
    threadId: "thread_spf_001",
    labelIds: ["INBOX"],
    snippet: "Your monthly security report is ready for review. SPF, DKIM, and DMARC analysis completed...",
    internalDate: generateTimestamp(4, 10),
    sizeEstimate: 5123,
    from: "Security Monitor <security@company-internal.com>",
    to: "SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>",
    subject: "Monthly Security Report - Email Authentication Analysis",
    date: new Date(generateTimestamp(4, 10)).toUTCString(),
    raw: `From: Security Monitor <security@company-internal.com>
To: SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>
Subject: Monthly Security Report - Email Authentication Analysis
Date: ${new Date(generateTimestamp(4, 10)).toUTCString()}
Message-ID: <demo.spf.001@demo.cybersakhi.org>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
Received-SPF: pass (google.com: domain of company-internal.com designates 198.51.100.1 as permitted sender)
Authentication-Results: google.com;
       spf=pass (google.com: domain of company-internal.com designates 198.51.100.1 as permitted sender) smtp.mailfrom=security@company-internal.com;
       dkim=pass (test mode) header.i=@company-internal.com header.s=default header.b=sample;
       dmarc=pass (p=none sp=none dis=none) header.from=company-internal.com

Dear User,

Your monthly security report is ready for review.

Email Authentication Analysis:
- SPF Status: PASS
- DKIM Status: PASS  
- DMARC Status: PASS
- Domain Reputation: Good
- IP Reputation: Clean

All email authentication mechanisms are functioning correctly.

Security Team`,
    forensicType: "spf-dkim-dmarc",
    description: "Email with complete SPF/DKIM/DMARC authentication headers for demo analysis"
  },
  {
    id: "demo_threat_indicators_001",
    threadId: "thread_threat_001",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "ALERT: Suspicious activity detected from IP addresses known for malicious behavior...",
    internalDate: generateTimestamp(5, 8),
    sizeEstimate: 3876,
    from: "Threat Intelligence <alerts@cybersec-monitor.org>",
    to: "SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>",
    subject: "ALERT: Threat Indicators Detected - Immediate Action Required",
    date: new Date(generateTimestamp(5, 8)).toUTCString(),
    raw: `From: Threat Intelligence <alerts@cybersec-monitor.org>
To: SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>
Subject: ALERT: Threat Indicators Detected - Immediate Action Required
Date: ${new Date(generateTimestamp(5, 8)).toUTCString()}
Message-ID: <demo.threat.001@demo.cybersakhi.org>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

ALERT: Threat Indicators Detected

Our systems have detected the following threat indicators:

1. Malicious IP: 203.0.113.45 (Known C2 server)
2. Suspicious Domain: malware-distribution-demo.net
3. File Hash: 5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d (Trojan variant)
4. Phishing Kit: credentials-harvester-v2

Affected Systems:
- Email gateway
- Web server logs
- Network traffic analysis

Recommended Actions:
- Block IP 203.0.113.45 immediately
- Scan all systems for malware
- Review access logs for the past 48 hours
- Update security signatures

Threat Intelligence Team`,
    forensicType: "threat-indicators",
    description: "Email with threat indicators including malicious IPs, domains, and file hashes"
  },
  {
    id: "demo_smtp_relay_001",
    threadId: "thread_smtp_001",
    labelIds: ["INBOX"],
    snippet: "Your message has been delivered through multiple SMTP relay servers. Path analysis shows...",
    internalDate: generateTimestamp(6, 15),
    sizeEstimate: 2934,
    from: "Email Administrator <postmaster@enterprise-corp.com>",
    to: "SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>",
    subject: "SMTP Relay Path Analysis - Message Delivery Report",
    date: new Date(generateTimestamp(6, 15)).toUTCString(),
    raw: `From: Email Administrator <postmaster@enterprise-corp.com>
To: SIH Demo User <dhairya.sharma.01315616124@adgips.ac.in>
Subject: SMTP Relay Path Analysis - Message Delivery Report
Date: ${new Date(generateTimestamp(6, 15)).toUTCString()}
Message-ID: <demo.smtp.001@demo.cybersakhi.org>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
Received: from mail-server1.enterprise-corp.com (mail-server1.enterprise-corp.com [198.51.100.10])
        by mail-server2.enterprise-corp.com (Postfix) with ESMTP id ABC123
        for <dhairya.sharma.01315616124@adgips.ac.in>
Received: from sender.external-network.com (sender.external-network.com [203.0.113.20])
        by mail-server1.enterprise-corp.com (Postfix) with ESMTP id DEF456
Received: from origin-mail.unknown-sender.net (origin-mail.unknown-sender.net [192.0.2.99])
        by sender.external-network.com with SMTP

SMTP Relay Path Analysis:
1. Origin: 192.0.2.99 (unknown-sender.net) - HIGH RISK
2. Relay 1: 203.0.113.20 (external-network.com) - MEDIUM RISK  
3. Relay 2: 198.51.100.10 (enterprise-corp.com) - LOW RISK
4. Destination: Final delivery

Geolocation Analysis:
- Origin: Unknown region (IP reputation poor)
- Relay 1: Eastern Europe (known for spam sources)
- Relay 2: United States (legitimate business)

Email Administrator`,
    forensicType: "smtp-relay",
    description: "Email showing complete SMTP relay path with geolocation and risk analysis"
  }
];

/**
 * Get demo emails by forensic type for filtering
 */
export function getDemoEmailsByType(type: DemoEmail["forensicType"]): DemoEmail[] {
  return DEMO_EMAILS.filter(email => email.forensicType === type);
}

/**
 * Get all demo emails for the demo mailbox
 */
export function getAllDemoEmails(): DemoEmail[] {
  return [...DEMO_EMAILS].sort((a, b) => b.internalDate - a.internalDate);
}

/**
 * Get a specific demo email by ID
 */
export function getDemoEmailById(id: string): DemoEmail | undefined {
  return DEMO_EMAILS.find(email => email.id === id);
}