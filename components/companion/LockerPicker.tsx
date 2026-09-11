"use client";

import React from "react";
import { X, Lock, FileText, Paperclip } from "lucide-react";

export interface LockerItem {
  id: string;
  evidenceCode: string;
  title: string | null;
  mimeType: string | null;
  category: string | null;
  createdAt: string;
  size?: number | null;
  isLocked: boolean;
}

interface LockerPickerProps {
  open: boolean;
  loading: boolean;
  items: LockerItem[];
  onClose: () => void;
  onAttach: (item: LockerItem) => void;
}

export function LockerPicker({ open, loading, items, onClose, onAttach }: LockerPickerProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Attach evidence from your Evidence Locker"
    >
      <div
        className="absolute inset-0 bg-[#07070f]/90 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-3xl glass-panel border-slate-800/90 p-5 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-black text-white">Attach from Evidence Locker</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close evidence picker"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
          Sakhi only reads the <strong>metadata</strong> of attached evidence (its
          EV code, type, state). Locked items show no title or content — unlock
          them in the Evidence Locker first if you need details reviewed.
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {loading && (
            <p className="text-xs text-slate-400 text-center py-8">Loading evidence…</p>
          )}
          {!loading && items.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">
              No evidence yet. Upload a file in the Evidence Locker first.
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-[11px] font-mono font-bold text-emerald-300">
                    {item.evidenceCode}
                  </span>
                  {item.isLocked && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-800/50 font-bold uppercase">
                      Locked
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-200 truncate mt-1">
                  {item.title || (item.isLocked ? "Protected — locked artifact" : "Evidence")}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {item.mimeType || item.category || "file"}
                  {item.size ? ` · ${formatBytes(item.size)}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onAttach(item)}
                disabled={item.isLocked}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emergency-950/60 hover:bg-emergency-900 border border-emergency-700/40 text-emergency-200 text-[11px] font-semibold transition disabled:opacity-35 disabled:cursor-not-allowed"
              >
                <Paperclip className="w-3 h-3" />
                Attach
              </button>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
          For locked items: open the Evidence Locker, view the artifact, and
          unlock it for this session — then attach it here. Sakhi never reads
          sealed/locked contents.
        </p>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}