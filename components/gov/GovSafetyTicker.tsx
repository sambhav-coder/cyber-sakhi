"use client";

import React from "react";
import { ShieldCheck, ExternalLink } from "lucide-react";

const REPORTING_URL = "https://cybercrime.gov.in/";

/**
 * Cyber-safety announcement messages. Only the messages listed in the task are
 * used; the single official link points to the National Cyber Crime Reporting
 * Portal. Cyber-Sakhi is never presented as operated by or affiliated with the
 * Government of India — the existing project disclaimer (footer) still applies.
 */
const MESSAGES: React.ReactNode[] = [
  "RBI Safety Reminder: Never share your OTP, PIN, password, or UPI PIN with anyone.",
  "Stay Alert: Do not click suspicious links or share confidential information.",
  <>
    To report cybercrime, visit the official{" "}
    <a
      href={REPORTING_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="gov-ticker-link focus-visible:outline-2 focus-visible:outline-sky-400 focus-visible:outline-offset-2"
      aria-label="National Cyber Crime Reporting Portal — opens in a new tab (official external website)"
    >
      National Cyber Crime Reporting Portal
      <ExternalLink
        className="gov-ticker-ext"
        aria-hidden="true"
      />
    </a>
    {" "}cybercrime.gov.in
  </>,
  "For financial cyber fraud, report immediately through the official cybercrime reporting channels.",
  "Verify before you trust: Government agencies and banks should not ask you to reveal your OTP or PIN.",
];

/**
 * Slim horizontal announcement bar under the top navbar.
 *
 * - Continuous, seamless CSS marquee (the message set is duplicated once for a
 *   loop; nothing else is duplicated in the DOM).
 * - Pauses on hover, focus (buttons/links inside) and while the bar is being
 *   interacted with.
 * - Respects `prefers-reduced-motion`: movement is disabled and the messages
 *   are shown in a static, wrapping layout.
 */
export const GovSafetyTicker: React.FC = () => {
  const renderList = (listKey: string, decorative: boolean) => (
    <ul
      key={listKey}
      className="gov-ticker-track-list"
      aria-hidden={decorative || undefined}
    >
      {MESSAGES.map((message, i) => (
        <li key={i} className="gov-ticker-message">
          <span className="gov-ticker-message-text">{message}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className="gov-ticker"
      role="region"
      aria-label="Cyber-safety safety notices, including the official cybercrime reporting portal reminder"
    >
      <div className="gov-ticker-inner">
        <span className="gov-ticker-label">
          <ShieldCheck className="gov-ticker-label-icon" aria-hidden="true" />
          Safety Notice
        </span>
        <div className="gov-ticker-viewport">
          <div className="gov-ticker-track">
            {renderList("track-a", false)}
            {renderList("track-b", true)}
          </div>
        </div>
      </div>
    </div>
  );
};