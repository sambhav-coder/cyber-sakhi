"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  KeyRound,
  UserCheck,
  ShieldAlert,
} from "lucide-react";
import { CyberSakhiLogo } from "@/components/CyberSakhiLogo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl,
      });

      if (res?.error) {
        setErrorMessage("Invalid email or password. Please check your credentials.");
      } else if (res?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      setErrorMessage("An unexpected authentication error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await signIn("google", { callbackUrl });
    } catch (err) {
      setErrorMessage("Could not initialize Google authentication.");
      setIsLoading(false);
    }
  };

  const fillCredentials = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage(null);
  };

  return (
    <div className="max-w-md mx-auto my-6 space-y-6 animate-in fade-in duration-300">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 rounded-2xl bg-purple-950/60 border border-purple-800/50 shadow-lg shadow-purple-950/40">
          <CyberSakhiLogo className="w-10 h-10" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Sign In to Cyber Sakhi
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Secure, privacy-first access to your safety companion & evidence vault
        </p>
      </div>

      {/* Main Card */}
      <div className="p-6 sm:p-8 rounded-3xl glass-panel border-purple-800/40 glow-purple space-y-5">
        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2 animate-in zoom-in-95">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-purple-500/40 text-slate-100 text-xs font-semibold transition flex items-center justify-center gap-3 group"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
            />
            <path
              fill="#FBBC05"
              d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.1c0 2.8.7 5.4 1.9 7.8l3.7-2.9z"
            />
            <path
              fill="#34A853"
              d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="flex-1 h-px bg-slate-800" />
          <span>or continue with email</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleCredentialsLogin} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !email.trim() || !password}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-purple-950/40"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Demo Fast-Fill Box */}
        <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-800/40 space-y-2 text-[11px]">
          <div className="font-bold text-purple-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Hackathon Quick-Demo Personas:</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fillCredentials("admin@cybersakhi.org", "Admin@Sakhi2026!")}
              className="p-2 rounded-lg bg-slate-900/80 hover:bg-purple-900/50 border border-purple-600/30 text-left transition flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <div>
                <div className="font-semibold text-purple-200">Admin Account</div>
                <div className="text-[9px] text-slate-400">Full RBAC /admin</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => fillCredentials("user@cybersakhi.org", "User@Sakhi2026!")}
              className="p-2 rounded-lg bg-slate-900/80 hover:bg-purple-900/50 border border-slate-700 text-left transition flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold text-slate-200">User Account</div>
                <div className="text-[9px] text-slate-400">Standard USER</div>
              </div>
            </button>
          </div>
        </div>

        {/* Switch to Signup */}
        <div className="text-center pt-1 text-xs text-slate-400">
          <span>Don't have an account yet? </span>
          <Link
            href={`/signup${callbackUrl !== "/dashboard" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`}
            className="text-purple-400 hover:text-purple-300 font-semibold underline"
          >
            Create New Account
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-purple-400 py-12 text-center">Loading authentication...</div>}>
      <LoginForm />
    </Suspense>
  );
}