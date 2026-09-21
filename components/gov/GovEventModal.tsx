"use client";

import React from "react";
import { X, Calendar, MapPin, ExternalLink, Tag } from "lucide-react";
import { clsx } from "clsx";
import { useGovModal } from "./govModal";

interface CurrentEvent {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: string;
  location?: string | null;
  eventDate?: string | null;
  imageUrl?: string | null;
  type: "WORKSHOP" | "AWARENESS" | "ADVISORY" | "GUIDELINE" | "ANNOUNCEMENT" | "PROGRAM" | "ALERT";
}

interface GovEventModalProps {
  /** Event to display */
  event: CurrentEvent | null;
  /** Callback to close the modal (fires after the exit transition) */
  onClose: () => void;
  /** Whether the modal is open */
  isOpen: boolean;
}

/**
 * Modal for current-event details.
 *
 * - Open/close transitions (mount fade + panel rise/scale) with a real exit
 *   animation before onClose resolves.
 * - Keyboard: Escape closes, focus is trapped inside the panel while open and
 *   restored to the trigger on close.
 * - Source attribution links to the original official page.
 */
export const GovEventModal: React.FC<GovEventModalProps> = ({
  event,
  onClose,
  isOpen,
}) => {
  const { mounted, shown, ref, close } = useGovModal(isOpen, onClose);

  if (!mounted || !event) return null;

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "WORKSHOP":
        return "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
      case "AWARENESS":
        return "text-sky-300 border-sky-400/30 bg-sky-400/10";
      case "ADVISORY":
        return "text-amber-300 border-amber-400/30 bg-amber-400/10";
      case "ALERT":
        return "text-red-300 border-red-400/30 bg-red-400/10";
      default:
        return "text-teal-300 border-teal-400/30 bg-teal-400/10";
    }
  };

  return (
    <div
      ref={ref}
      className={clsx(
        "fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0"
      )}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal content */}
      <div
        className={clsx(
          "relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700/50 bg-[#070d1a]/95 shadow-2xl transition-all duration-200",
          shown ? "scale-100 translate-y-0 opacity-100" : "scale-95 translate-y-3 opacity-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-700/50">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${getTypeColor(
                  event.type
                )}`}
              >
                <Tag className="h-3 w-3" />
                {event.type}
              </span>
              <span className="text-xs text-slate-500">{event.category}</span>
            </div>
            <h2
              id="event-modal-title"
              className="text-xl font-bold text-slate-50"
            >
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            data-gov-modal-close
            className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition focus-visible:outline-2 focus-visible:outline-sky-400"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Image if available */}
          {event.imageUrl && (
            <div className="mb-6 rounded-xl overflow-hidden">
              <img src={event.imageUrl} alt="" className="w-full h-48 object-cover" />
            </div>
          )}

          {/* Summary */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">
              About this event
            </h3>
            <p className="text-sm leading-relaxed text-slate-400">
              {event.summary}
            </p>
          </div>

          {/* Event details */}
          <div className="space-y-3 mb-6">
            {event.eventDate && (
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Event Date</p>
                  <p className="text-sm text-slate-300">
                    {formatDate(event.eventDate)}
                  </p>
                </div>
              </div>
            )}

            {event.location && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Location</p>
                  <p className="text-sm text-slate-300">{event.location}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Tag className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Published</p>
                <p className="text-sm text-slate-300">
                  {formatDate(event.publishedAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Source attribution */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
            <p className="text-xs text-slate-500 mb-2">Source</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {event.source}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  This information is aggregated from official sources. Cyber-Sakhi
                  does not create or endorse this content.
                </p>
              </div>
              <a
                href={event.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 border border-slate-600/50 hover:border-slate-500/50 hover:bg-slate-800/50 transition focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                <ExternalLink className="h-4 w-4" />
                Open Original Source
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};