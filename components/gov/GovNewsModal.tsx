"use client";

import React, { useState } from "react";
import { X, Youtube, ExternalLink, Clock, Calendar, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { useGovModal } from "./govModal";

interface CyberNewsItem {
  id: string;
  title: string;
  description: string;
  channelName: string;
  channelUrl: string;
  videoId?: string | null;
  publishedAt: string;
  thumbnailUrl?: string | null;
  sourceUrl: string;
  type: "VIDEO" | "ARTICLE" | "ADVISORY";
  /** Known from the videos/status API when the provider could not embed. */
  embeddable?: boolean;
}

interface GovNewsModalProps {
  /** News item to display */
  news: CyberNewsItem | null;
  /** Callback to close the modal (fires after the exit transition) */
  onClose: () => void;
  /** Whether the modal is open */
  isOpen: boolean;
}

/**
 * Modal for cyber-safety news details.
 *
 * - Open/close transitions (mount fade + panel rise/scale) with a real exit
 *   animation before onClose resolves.
 * - Keyboard: Escape closes, focus is trapped while open and restored to the
 *   trigger on close.
 * - VIDEO items embed through the privacy-friendly youtube-nocookie iframe only
 *   when the video is embeddable; otherwise (or on request) they open on
 *   YouTube directly — broken iframe states are never rendered.
 */
export const GovNewsModal: React.FC<GovNewsModalProps> = ({
  news,
  onClose,
  isOpen,
}) => {
  const [showEmbed, setShowEmbed] = useState(false);
  const { mounted, shown, ref, close } = useGovModal(isOpen, onClose);

  if (!mounted || !news) return null;

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

  const getEmbedUrl = (videoId: string) =>
    `https://www.youtube-nocookie.com/embed/${videoId}`;

  const embedDisabled = news.type === "VIDEO" && news.embeddable === false;

  const renderPlayerAction = () => {
    if (embedDisabled) {
      return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 px-4 py-3 rounded-xl bg-black/50">
          <AlertTriangle className="h-5 w-5 text-amber-300" />
          <p className="text-xs text-slate-200 text-center sm:text-left">
            This video cannot be embedded here. You can still watch it on YouTube.
          </p>
          <button
            type="button"
            onClick={() => window.open(news.sourceUrl, "_blank", "noopener,noreferrer")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <ExternalLink className="h-4 w-4" />
            Open on YouTube
          </button>
        </div>
      );
    }
    if (!showEmbed && news.thumbnailUrl) {
      return (
        <button
          type="button"
          onClick={() => setShowEmbed(true)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600/90 hover:bg-red-600 text-white font-semibold transition focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <Youtube className="h-5 w-5" />
          Watch Here
        </button>
      );
    }
    return null;
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
      aria-labelledby="news-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal content */}
      <div
        className={clsx(
          "relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700/50 bg-[#070d1a]/95 shadow-2xl transition-all duration-200",
          shown ? "scale-100 translate-y-0 opacity-100" : "scale-95 translate-y-3 opacity-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-700/50">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {news.type === "VIDEO" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border border-red-400/30 bg-red-400/10 text-red-300">
                  <Youtube className="h-3 w-3" />
                  Video
                </span>
              )}
              <span className="text-xs text-slate-500">
                {news.type === "VIDEO" ? "YouTube" : "Article"}
              </span>
            </div>
            <h2
              id="news-modal-title"
              className="text-xl font-bold text-slate-50"
            >
              {news.title}
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
          {/* Video embed or thumbnail preview */}
          {news.type === "VIDEO" && news.videoId && (
            <div className="mb-6">
              {showEmbed && !embedDisabled ? (
                <div className="relative w-full pt-[56.25%] rounded-xl overflow-hidden bg-slate-900">
                  <iframe
                    src={getEmbedUrl(news.videoId)}
                    title={news.title}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900">
                  {news.thumbnailUrl && (
                    <img
                      src={news.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4">
                    {renderPlayerAction()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">
              Description
            </h3>
            <p className="text-sm leading-relaxed text-slate-400">
              {news.description}
            </p>
          </div>

          {/* News details */}
          <div className="space-y-3 mb-6">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Published</p>
                <p className="text-sm text-slate-300">
                  {formatDate(news.publishedAt)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Youtube className="h-5 w-5 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500 mb-0.5">
                  Channel / Source
                </p>
                <p className="text-sm text-slate-300">{news.channelName}</p>
              </div>
            </div>
          </div>

          {/* Action buttons for videos */}
          {news.type === "VIDEO" && news.videoId && (
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              {!showEmbed && !embedDisabled && (
                <button
                  type="button"
                  onClick={() => setShowEmbed(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-medium transition focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  <Youtube className="h-4 w-4" />
                  Watch Here
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  window.open(news.sourceUrl, "_blank", "noopener,noreferrer")
                }
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-600/50 hover:border-slate-500/50 hover:bg-slate-800/50 text-slate-300 font-medium transition focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                <ExternalLink className="h-4 w-4" />
                Open on YouTube
              </button>
            </div>
          )}

          {/* Source attribution */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
            <p className="text-xs text-slate-500 mb-2">Source</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {news.channelName}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  This content is aggregated from official sources. Cyber-Sakhi
                  does not create or endorse this content.
                </p>
              </div>
              <a
                href={news.sourceUrl}
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