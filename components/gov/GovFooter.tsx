import React from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { GovBrandLockup } from "@/components/gov/GovBrandLockup";

export const GovFooter: React.FC = () => {
  return (
    <footer className="border-t border-slate-800/60 bg-[#060b16]/90">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3 lg:col-span-2">
            <GovBrandLockup size={34} />
            <p className="max-w-sm text-xs leading-relaxed text-slate-400">
              A Cyber-Sakhi project interface exploring secure cyber
              investigation workflows, evidence chains of custody, and
              accountable access.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Portal
            </span>
            <Link href="/gov" className="w-fit text-sm text-slate-300 transition hover:text-teal-300">
              Overview
            </Link>
            <Link href="/gov/login" className="w-fit text-sm text-slate-300 transition hover:text-teal-300">
              Officer Login
            </Link>
            <Link href="/gov/dashboard" className="w-fit text-sm text-slate-300 transition hover:text-teal-300">
              Portal Preview
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Legal
            </span>
            <Link href="/privacy" className="w-fit text-sm text-slate-300 transition hover:text-teal-300">
              Privacy Policy
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Cyber-Sakhi
            </span>
            <Link href="/" className="w-fit text-sm text-slate-300 transition hover:text-teal-300">
              Main landing
            </Link>
            <Link href="/login" className="w-fit text-sm text-slate-300 transition hover:text-teal-300">
              User login
            </Link>
          </div>
        </div>

        {/* Non-affiliation disclaimer — clearly a project notice, not an official one */}
        <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/80" />
          <p className="text-xs leading-relaxed text-slate-300">
            This is a non-official <strong className="text-slate-200">Cyber-Sakhi project interface</strong>.
            It is not operated by, affiliated with, or endorsed by any government
            department. It does not currently connect to live government systems
            or live case data. No authentication is performed.
          </p>
        </div>

        <div className="mt-6 flex flex-col items-start gap-2 border-t border-slate-800/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono text-[11px] text-slate-600">
            © {new Date().getFullYear()} Cyber-Sakhi Project
          </span>
        </div>
      </div>
    </footer>
  );
};