"use client";

import React from "react";
import { X } from "lucide-react";
import { useGovModal } from "@/components/gov/govModal";

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  maxWidth?: string;
}

/**
 * Reusable accessible popup for the summary-first email forensics report.
 * Reuses the shared modal lifecycle (focus trap, ESC, scroll lock, focus
 * restore) so every "view details" panel behaves identically.
 */
export function InfoModal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  maxWidth = "max-w-3xl",
}: InfoModalProps) {
  const { mounted, shown, leaving, ref, close } = useGovModal(open, onClose);

  if (!mounted) return null;

  const transition = shown
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-3";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6 transition-opacity duration-200 ${
        shown ? "opacity-100" : "opacity-0"
      } ${leaving ? "opacity-0" : ""}`}
      style={{ backgroundColor: "rgba(2, 6, 23, 0.82)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={ref}
        role="document"
        tabIndex={-1}
        className={`relative w-full ${maxWidth} my-8 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl transition-all duration-200 ${transition}`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-2xl border-b border-slate-800 bg-slate-900 px-5 py-4">
          <div className="flex items-start gap-3">
            {Icon ? (
              <span className="mt-0.5 rounded-lg bg-slate-800 p-2 text-emergency-400">
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <div>
              <h2 className="text-sm font-bold text-slate-100">{title}</h2>
              {subtitle ? (
                <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <button
            data-gov-modal-close
            onClick={close}
            aria-label="Close details"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}