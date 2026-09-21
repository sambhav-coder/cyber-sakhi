import type { Metadata } from "next";
import React from "react";
import "./gov.css";

export const metadata: Metadata = {
  title: {
    default: "Government Portal — Cyber-Sakhi",
    template: "%s — Cyber-Sakhi Government Portal",
  },
  description:
    "Cyber-Sakhi Government Portal — demonstration environment for cyber investigation, evidence intelligence, and accountable digital investigations. Not an official government website.",
};

export default function GovLayout({ children }: { children: React.ReactNode }) {
  return <div className="gov-portal">{children}</div>;
}