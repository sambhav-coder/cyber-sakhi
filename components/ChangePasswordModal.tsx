"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, KeyRound, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Change Password"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-emergency-700/40 bg-[#0c0c18] shadow-[0_0_60px_rgba(220,38,38,0.12)] overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h3 className="text-base font-bold text-white flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emergency-600/20 border border-emergency-500/30">
              <KeyRound className="w-4 h-4 text-emergency-400" />
            </div>
            Change Password
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pb-6 pt-2">
          <ChangePasswordForm onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(false);
    submittingRef.current = false;
  };

  const handleClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    resetForm();
    onClose();
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || isLoading) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage("All fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match.");
      return;
    }

    submittingRef.current = true;
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to change password.");
      } else {
        setSuccessMessage("Password changed successfully!");
        closeTimerRef.current = setTimeout(() => {
          closeTimerRef.current = null;
          handleClose();
        }, 1500);
      }
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMessage && (
        <div className="p-3 rounded-xl bg-emergency-950/80 border border-emergency-500/40 text-emergency-200 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-emergency-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <PasswordField
        label="Current Password"
        value={currentPassword}
        onChange={setCurrentPassword}
        show={showCurrent}
        onToggle={() => setShowCurrent((v) => !v)}
        autoComplete="current-password"
      />
      <PasswordField
        label="New Password"
        value={newPassword}
        onChange={setNewPassword}
        show={showNew}
        onToggle={() => setShowNew((v) => !v)}
        autoComplete="new-password"
      />
      <PasswordField
        label="Confirm New Password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        show={showConfirm}
        onToggle={() => setShowConfirm((v) => !v)}
        autoComplete="new-password"
        error={mismatch ? "Passwords do not match." : undefined}
      />

      <div className="flex gap-2.5 pt-2">
        <button
          type="button"
          onClick={handleClose}
          disabled={isLoading}
          className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition border border-slate-700/50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 py-2.5 rounded-xl bg-emergency-600 text-white text-sm font-semibold hover:bg-emergency-500 disabled:opacity-50 transition shadow-lg shadow-emergency-900/30 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Changing...
            </>
          ) : (
            "Change Password"
          )}
        </button>
      </div>
    </form>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-300">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-xl bg-slate-900/80 border px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition ${
            error
              ? "border-emergency-500/60 focus:ring-emergency-500/40 focus:border-emergency-500"
              : "border-slate-700/60 focus:ring-emergency-500/30 focus:border-emergency-600/50"
          }`}
          placeholder={label}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 transition"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-[11px] text-emergency-400 font-medium">{error}</p>}
    </div>
  );
}
