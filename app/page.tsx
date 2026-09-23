"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Shield,
  Phone,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Globe,
  Fingerprint,
  CreditCard,
  UserCog,
  MessageCircleWarning,
  Camera,
  Copy,
  ExternalLink,
  MapPin,
  EyeOff,
} from "lucide-react";
import { CyberSafetyBriefingModal } from "@/components/CyberSafetyBriefingModal";

const BG_INTERVAL_MS = 1700;
const BG_FADE_MS = 900;

const cybercrimeBackgrounds: string[] = [
  "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=2000&q=85&auto=format&fit=crop", // matrix code / hack
  "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=2000&q=85&auto=format&fit=crop", // phishing / scam
  "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=2000&q=85&auto=format&fit=crop", // cybersecurity / code
  "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=2000&q=85&auto=format&fit=crop", // cyber investigation
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=2000&q=85&auto=format&fit=crop", // security / locks & keyboard
  "https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=2000&q=85&auto=format&fit=crop", // blackmail / chat threat
  "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=2000&q=85&auto=format&fit=crop", // UPI / financial fraud screen
  "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=2000&q=85&auto=format&fit=crop", // social media / identity theft
  "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=2000&q=85&auto=format&fit=crop", // hacked / broken screen device
  "https://images.unsplash.com/photo-1573164713988-8665fc963095?w=2000&q=85&auto=format&fit=crop", // women safety / distress / emergency call
  "https://images.unsplash.com/photo-1563206767-6a835c7f8e69?w=2000&q=85&auto=format&fit=crop", // digital fraud / forensic chain
  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=2000&q=85&auto=format&fit=crop", // hardware / hacked device hardware
];

interface CybercrimeCase {
  id: string;
  category: string;
  title: string;
  image: string;
  description: string;
  howTargeted: string[];
  warningSigns: string[];
  prevention: string[];
  accentIcon: React.ComponentType<{ className?: string }>;
}

const cybercrimeCases: CybercrimeCase[] = [
  {
    id: "phishing",
    category: "PHISHING / IDENTITY THEFT",
    title: "Fake Bank Login Page",
    image: "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=900&q=80&auto=format&fit=crop",
    description:
      "A 24-year-old woman in Pune received an SMS claiming her SBI account was frozen. She clicked the link and entered her debit card details, CVV, and OTP on a near-perfect copy of the SBI login page. ₹87,000 was drained from her account within 3 minutes.",
    howTargeted: [
      "Smishing (SMS phishing) with urgent account-freeze scare",
      "Spoofed domain: `sbi-online-verification[.]in`",
      "Fake SSL padlock + cloned bank branding to appear legitimate",
      "Pressure to act within 10 minutes or account be blocked permanently",
    ],
    warningSigns: [
      "Unexpected SMS/Email asking to 'verify KYC' immediately",
      "URL slightly misspelled or with hyphens/extra words",
      "Website asks for OTP, CVV, or ATM PIN on a login screen",
      "Sender address is a free email (Gmail/Outlook) not a bank domain",
    ],
    prevention: [
      "Never click links in unsolicited SMS. Open the official app yourself.",
      "Check the URL bar: legitimate banks use `*.bank` or their own branded domain",
      "Banks NEVER call/SMS asking for OTP, CVV, or PIN",
      "Report suspicious SMS to 1930 and screenshot as evidence → save to Evidence Locker",
    ],
    accentIcon: Fingerprint,
  },
  {
    id: "sextortion",
    category: "BLACKMAIL / SEXTORTION",
    title: "Instagram DM Morphed Photo Threat",
    image: "https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=900&q=80&auto=format&fit=crop",
    description:
      "A college student in Bengaluru received a DM from a fake profile claiming to have 'edited nude photos' of her from her public Instagram posts. The perpetrator demanded ₹35,000 in Bitcoin within 4 hours or threatened to send the morphed images to all her followers and family members.",
    howTargeted: [
      "Photos scraped from public social media accounts (travel, reels, profile pics)",
      "Deepfake/morph software used to fabricate nude images",
      " burner account with 0 posts, random stolen username",
      "Threat timed to a weekday when family was reachable to amplify panic",
    ],
    warningSigns: [
      "New/empty profile messages you with an image you don't recognize",
      "Demands crypto, gift cards, or money transfers (untraceable payment)",
      "Urgent '4 hours' deadlines to trigger emotional decision-making",
      "Perpetrator REFUSES to send full image (only a tiny crop to avoid being traceable)",
    ],
    prevention: [
      "DO NOT PAY. 99% of the time paying leads to more blackmail, not less.",
      "Screenshot EVERYTHING immediately → Cyber Sakhi Evidence Locker (SHA-256 hashed)",
      "Block the account, change your passwords, turn on 2FA, set profiles to private",
      "Call 1930 Cyber Crime Helpline and file a report at cybercrime.gov.in — morphed nude threats are a cognizable offence under IT Act Sec 66E & 67A",
      "Tell a trusted person immediately — shame gives blackmailers power",
    ],
    accentIcon: MessageCircleWarning,
  },
  {
    id: "takeover",
    category: "ACCOUNT TAKEOVER",
    title: "Social Media Profile Hijack",
    image: "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=900&q=80&auto=format&fit=crop",
    description:
      "A professional in Mumbai lost access to her Instagram, WhatsApp, and Gmail within 1 hour. The attacker used a SIM-swap attack: they impersonated her at a mobile store to get a replacement SIM, then performed password resets on every platform. Her followers were sent fake loan links.",
    howTargeted: [
      "SIM swap: attacker visited retail store with fake ID requesting duplicate SIM",
      "All accounts linked to her phone number — SMS 2FA bypassed",
      "Email recovery codes changed to attacker email before she noticed",
      "Within minutes: her contact list was spammed with 'I need ₹50,000 urgently' scams",
    ],
    warningSigns: [
      "Sudden 'No Signal' / network outage on your primary phone for 30+ minutes",
      "Emails about password resets you didn't request",
      "Friends text: 'Did you really message me for money?'",
      "SIM card 'registration failed' message appears on your phone",
    ],
    prevention: [
      "Tell your mobile provider to set a SIM-lock PIN (SMS 121 to request). Require biometric ID for any SIM replacement.",
      "Use Authenticator App (TOTP) as 2FA, NOT SMS 2FA. SMS is easily intercepted.",
      "Save account recovery codes offline (Google, Apple, Meta)",
      "In case of SIM-swap: immediately call your telecom + freeze SIM + log into accounts from a trusted device",
    ],
    accentIcon: UserCog,
  },
  {
    id: "upifraud",
    category: "FINANCIAL / UPI FRAUD",
    title: "Fake Customer Care UPI Scam",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&q=80&auto=format&fit=crop",
    description:
      "A teacher in Jaipur ordered a ₹3,200 dress from an Instagram boutique. The 'delivery partner' called saying her package was stuck and she needed a '₹1 refund verification' on UPI. They said: 'ENTER ₹1 — it's just a verification — you will NOT be charged.' She entered ₹1 and a pop-up requested UPI PIN. After she entered it: ₹98,400 was debited from her savings account.",
    howTargeted: [
      "Fraudsters scraped order confirmations from social ads / courier data leaks",
      "Called exactly when delivery was expected to sound plausible",
      "Used a 'Money Request' feature disguised as 'refund', debiting when PIN entered",
      "Convinced victim to download AnyDesk/TeamViewer in some variants — full account control",
    ],
    warningSigns: [
      "Unknown caller claims to be 'delivery/customer care' and knows your partial order details",
      "Asks you to enter UPI PIN to 'RECEIVE MONEY' — RECEIVING NEVER requires a PIN",
      "Asks to install AnyDesk, TeamViewer, QuickSupport, any remote-access app",
      "Creates urgency: 'package will be returned to warehouse in 5 minutes'",
    ],
    prevention: [
      "GOLDEN RULE: You NEVER enter your UPI PIN to RECEIVE money. Only when YOU are sending.",
      "No legitimate delivery/customer service calls for 'refund verification' of ₹1",
      "Never install remote-access apps (AnyDesk etc.) for a 'customer care call'",
      "If debited — call 1930 IMMEDIATELY (within minutes banks can reverse UPI fraud if reported fast). Save call log to Evidence Locker",
    ],
    accentIcon: CreditCard,
  },
];

const helplineCards = [
  {
    title: "Women Helpline",
    number: "181",
    subtitle: "24/7 Women in Distress",
    icon: Shield,
    href: "tel:181",
  },
  {
    title: "National Emergency",
    number: "112",
    subtitle: "Immediate Police / Fire / Medical",
    icon: Phone,
    href: "tel:112",
  },
  {
    title: "Cyber Crime Helpline",
    number: "1930",
    subtitle: "Financial / Online Fraud Report",
    icon: AlertTriangle,
    href: "tel:1930",
  },
  {
    title: "National Portal",
    number: "cybercrime.gov.in",
    subtitle: "File Official FIR Online",
    icon: Globe,
    href: "https://cybercrime.gov.in",
  },
];

export default function HomePage() {
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [isCyberSafetyBriefingOpen, setCyberSafetyBriefingOpen] = useState(false);

  const openCyberSafetyBriefing = useCallback(
    () => setCyberSafetyBriefingOpen(true),
    []
  );
  const closeCyberSafetyBriefing = useCallback(
    () => setCyberSafetyBriefingOpen(false),
    []
  );

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => {
      setCurrentBgIndex((prev) => (prev + 1) % cybercrimeBackgrounds.length);
    }, BG_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const copyText = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* silent */
    }
  };

  return (
    <div className="relative bg-midnight-950 text-slate-100 min-h-screen w-full overflow-hidden">
      {/* =========================================================
          CINEMATIC ROTATING BACKGROUND LAYER (FULL VIEWPORT)
          ========================================================= */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {cybercrimeBackgrounds.map((bg, index) => (
          <div
            key={index}
            className="absolute inset-0 bg-cover bg-center will-change-opacity"
            style={{
              backgroundImage: `url(${bg})`,
              opacity: index === currentBgIndex ? 1 : 0,
              transition: `opacity ${BG_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              transform: index === currentBgIndex ? "scale(1.04)" : "scale(1)",
              transitionProperty: "opacity, transform",
              transitionDuration: `${BG_FADE_MS}ms, ${BG_INTERVAL_MS * 6}ms`,
              transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            aria-hidden
          />
        ))}
        {/* Dark cinematic overlay for legibility */}
        <div className="absolute inset-0 cinematic-overlay" aria-hidden />
        {/* Subtle crimson radial glow accents */}
        <div
          className="absolute inset-0 mix-blend-screen opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 20% 10%, rgba(220, 38, 38, 0.35), transparent 60%), radial-gradient(ellipse 55% 45% at 85% 90%, rgba(185, 28, 28, 0.25), transparent 60%)",
          }}
          aria-hidden
        />
        {/* Film grain / scanline overlay for cinematic feel */}
        <div
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.08) 2px 3px)",
          }}
          aria-hidden
        />
      </div>

      {/* =========================================================
          HERO SECTION — 100VH FULL SCREEN
          ========================================================= */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-[100svh] w-full px-4 sm:px-6 pt-16 sm:pt-20 pb-24 sm:pb-32 text-center">
        {/* Logo */}
        <div
          className={`mb-6 sm:mb-9 transition-all duration-1000 ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
          }`}
          style={{ transitionDelay: "80ms" }}
        >
          <div className="relative inline-flex animate-float-slow">
            {/* Logo glow halo */}
            <div
              className="absolute -inset-6 rounded-full blur-3xl opacity-50 animate-pulse-slow pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(239, 68, 68, 0.55) 0%, rgba(185, 28, 28, 0.2) 45%, transparent 70%)",
              }}
              aria-hidden
            />
            {/* Actual PNG logo cutout — no wrapper background */}
            <img
              src="/assets/cyber-sakhi-logo.png"
              alt="Cyber Sakhi Logo"
              className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 object-contain drop-shadow-[0_0_35px_rgba(239,68,68,0.55)]"
              style={{ background: "transparent", mixBlendMode: "screen" }}
              draggable={false}
            />
          </div>
        </div>

        {/* CYBER SAKHI Title */}
        <h1
          className={`font-black tracking-tighter text-center transition-all duration-[1100ms] ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
          style={{ transitionDelay: "260ms" }}
        >
          <span
            className="block text-4xl sm:text-6xl md:text-7xl lg:text-8xl"
            style={{
              color: "#ffffff",
              animation: "pulseGlow 3.8s ease-in-out infinite",
            }}
          >
            CYBER{" "}
            <span className="text-crimson-gradient relative">
              SAKHI
              <span
                className="absolute inset-0 blur-xl opacity-50 text-crimson-gradient pointer-events-none select-none"
                aria-hidden
              >
                SAKHI
              </span>
            </span>
          </span>
        </h1>

        {/* Tagline */}
        <p
          className={`mt-5 sm:mt-6 max-w-2xl mx-auto text-sm sm:text-base md:text-lg font-light tracking-wide text-slate-300/90 leading-relaxed transition-all duration-1000 ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
          style={{ transitionDelay: "480ms" }}
        >
          AI-Powered Digital Safety &amp; Emergency Response System
          <span className="block text-slate-400/80 mt-1.5 text-xs sm:text-sm">
            Evidence integrity · Threat intelligence · Live Location capture — for women, by design.
          </span>
        </p>

        {/* Primary CTA */}
        <div
          className={`mt-8 sm:mt-10 transition-all duration-1000 ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
          style={{ transitionDelay: "640ms" }}
        >
          <button
            type="button"
            onClick={openCyberSafetyBriefing}
            className="group relative inline-flex items-center gap-3 px-7 sm:px-8 py-3.5 sm:py-4 rounded-xl font-bold tracking-wide text-sm sm:text-base overflow-hidden cursor-pointer"
            style={{
              background:
                "linear-gradient(135deg, #b91c1c 0%, #ef4444 45%, #dc2626 75%, #7f1d1d 100%)",
              boxShadow:
                "0 18px 45px -12px rgba(220, 38, 38, 0.75), 0 0 40px -10px rgba(239, 68, 68, 0.55)",
              color: "white",
              clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)",
            }}
          >
            <ShieldCheck className="w-5 h-5" />
            <span>Learn How to Protect Yourself</span>
            <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Auth Buttons */}
        <div
          className={`mt-10 sm:mt-14 flex flex-col sm:flex-row gap-5 sm:gap-8 justify-center items-center transition-all duration-1000 ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
          style={{ transitionDelay: "820ms" }}
        >
          {/* LOGIN */}
          <div className="text-center">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 px-8 sm:px-9 py-3.5 rounded-xl font-extrabold tracking-[0.14em] text-xs sm:text-sm text-white transition-all duration-300 hover:scale-[1.03]"
              style={{
                background: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)",
                boxShadow:
                  "0 12px 32px -10px rgba(220, 38, 38, 0.8), inset 0 1px 0 rgba(255,255,255,0.2)",
                border: "1px solid rgba(254, 202, 202, 0.25)",
              }}
            >
              <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
              LOGIN
            </Link>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-2.5 tracking-wide">
              Are you already a user?
            </p>
          </div>

          {/* SIGN UP */}
          <div className="text-center">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 px-8 sm:px-9 py-3.5 rounded-xl font-extrabold tracking-[0.14em] text-xs sm:text-sm text-slate-100 transition-all duration-300 hover:scale-[1.03]"
              style={{
                background: "rgba(10, 10, 22, 0.55)",
                backdropFilter: "blur(14px)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                boxShadow: "0 12px 35px -16px rgba(0,0,0,0.7)",
              }}
            >
              <Fingerprint className="w-4 h-4 text-emergency-400 group-hover:text-emergency-300 transition-colors" />
              SIGN UP
            </Link>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-2.5 tracking-wide">
              New user?
            </p>
          </div>
        </div>

        {/* Scroll-down indicator */}
        <div
          className={`absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-400/70 transition-all duration-1000 ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDelay: "1200ms" }}
        >
          <span className="text-[10px] tracking-[0.25em] uppercase">Scroll Down</span>
          <div className="w-px h-10 bg-gradient-to-b from-emergency-500/70 to-transparent" />
        </div>
      </section>

      {/* =========================================================
          CASES SECTION — REAL CYBERCRIME LESSONS
          ========================================================= */}
      <section
        id="cybercrime-cases"
        className="relative z-10 pt-24 sm:pt-32 pb-16 px-4 sm:px-6"
      >
        <div className="max-w-7xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-14 sm:mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emergency-950/60 border border-emergency-500/30 text-emergency-300 text-[11px] font-bold tracking-[0.18em] uppercase mb-5 backdrop-blur-md">
              <EyeOff className="w-3.5 h-3.5" />
              <span>Real Cases. Real Lessons.</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
              Know the{" "}
              <span className="text-crimson-gradient">Threats.</span>{" "}
              Stay <span className="text-crimson-gradient">Shielded.</span>
            </h2>
            <p className="mt-5 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
              These recent, representative cases from Indian cyber crime cells show how women are
              targeted online. Learn the patterns. Save the evidence. Report in minutes.
            </p>
          </div>

          {/* Case cards grid */}
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {cybercrimeCases.map((c, idx) => {
              const Icon = c.accentIcon;
              return (
                <article
                  key={c.id}
                  className="group relative glass-panel rounded-3xl overflow-hidden flex flex-col transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_30px_60px_-25px_rgba(220,38,38,0.5)]"
                  style={{
                    animation: `fadeInUp 0.85s ease-out both`,
                    animationDelay: `${200 + idx * 120}ms`,
                  }}
                >
                  {/* Card image */}
                  <div className="relative h-52 sm:h-60 overflow-hidden">
                    <img
                      src={c.image}
                      alt={c.title}
                      className="w-full h-full object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-110"
                      loading="lazy"
                    />
                    {/* Darken overlay */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 55%, rgba(5,5,10,0.96) 100%)",
                      }}
                    />
                    {/* Category tag */}
                    <div className="absolute top-4 left-4 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-[0.16em] uppercase text-white"
                        style={{
                          background: "linear-gradient(135deg, #b91c1c, #ef4444)",
                          boxShadow: "0 6px 18px -5px rgba(220, 38, 38, 0.7)",
                        }}
                      >
                        <Icon className="w-3 h-3" />
                        {c.category}
                      </span>
                    </div>
                    {/* Title */}
                    <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                      <h3 className="text-xl sm:text-2xl font-bold text-white drop-shadow">
                        {c.title}
                      </h3>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="p-5 sm:p-7 space-y-6 text-sm leading-relaxed">
                    {/* What happened */}
                    <div>
                      <h4 className="text-[11px] font-extrabold tracking-[0.18em] uppercase text-emergency-400 mb-2.5 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> What Happened
                      </h4>
                      <p className="text-slate-300/90">{c.description}</p>
                    </div>

                    {/* How Targeted */}
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div>
                        <h4 className="text-[11px] font-extrabold tracking-[0.18em] uppercase text-slate-400 mb-2.5">
                          🎯 How She Was Targeted
                        </h4>
                        <ul className="space-y-1.5">
                          {c.howTargeted.map((pt, i) => (
                            <li key={i} className="flex gap-2 text-slate-300/85 text-[13px]">
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emergency-500 shrink-0" />
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="text-[11px] font-extrabold tracking-[0.18em] uppercase text-amber-400/90 mb-2.5">
                          ⚠️ Warning Signs
                        </h4>
                        <ul className="space-y-1.5">
                          {c.warningSigns.map((pt, i) => (
                            <li key={i} className="flex gap-2 text-slate-300/85 text-[13px]">
                              <span className="mt-1 w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-[9px] font-black shrink-0">
                                !
                              </span>
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Prevention */}
                    <div
                      className="p-4 sm:p-5 rounded-2xl"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(6, 78, 59, 0.28), rgba(6, 95, 70, 0.1))",
                        border: "1px solid rgba(16, 185, 129, 0.25)",
                      }}
                    >
                      <h4 className="text-[11px] font-extrabold tracking-[0.18em] uppercase text-emerald-400 mb-3 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" /> ✅ How to Stay Safe
                      </h4>
                      <ul className="space-y-2">
                        {c.prevention.map((pt, i) => (
                          <li key={i} className="flex gap-2.5 text-slate-200/90 text-[13px]">
                            <span className="mt-1 w-5 h-5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-[10px] font-black shrink-0">
                              ✓
                            </span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* =========================================================
          EMERGENCY HELPLINES SECTION
          ========================================================= */}
      <section
        id="helplines"
        className="relative z-10 py-16 sm:py-24 px-4 sm:px-6"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-950/70 border border-red-500/40 text-red-200 text-[11px] font-extrabold tracking-[0.2em] uppercase mb-5 backdrop-blur-md animate-pulse-slow">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>24 / 7 Emergency Helplines — India</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight">
              When in <span className="text-crimson-gradient">Danger.</span>{" "}
              <span className="text-white">Dial </span>
              <span className="text-crimson-gradient">Immediately.</span>
            </h2>
            <p className="mt-5 text-slate-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              These are toll-free national numbers. Calls are recorded by law enforcement.
              Keep Cyber Sakhi Evidence Locker ready with screenshots before you call — case IDs are issued instantly.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            {helplineCards.map((h, idx) => {
              const Icon = h.icon;
              const isExternal = h.href.startsWith("http");
              return (
                <a
                  key={h.title}
                  href={h.href}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                  className="group relative emergency-number-card rounded-3xl p-6 sm:p-7 text-center transition-all duration-300 hover:-translate-y-1.5 hover:scale-[1.015]"
                  style={{
                    animation: `fadeInUp 0.8s ease-out both`,
                    animationDelay: `${120 + idx * 110}ms`,
                  }}
                >
                  {/* Glow accent */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-3xl bg-emergency-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                  <div className="relative">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center border border-emergency-400/40 bg-gradient-to-br from-emergency-600/30 to-emergency-800/30 backdrop-blur group-hover:border-emergency-300/70 transition-colors">
                      <Icon className="w-6 h-6 text-emergency-300" />
                    </div>
                    <h3 className="text-white font-semibold text-sm tracking-wide mb-1.5">
                      {h.title}
                    </h3>
                    <div className="flex items-center justify-center gap-2">
                      <span
                        className={`font-black ${
                          h.number.length <= 5 ? "text-4xl sm:text-5xl" : "text-lg sm:text-xl"
                        } text-emergency-300`}
                        style={{ textShadow: "0 0 25px rgba(248, 113, 113, 0.55)" }}
                      >
                        {h.number}
                      </span>
                      {!isExternal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            copyText(h.number, `hl-${idx}`);
                          }}
                          className="opacity-60 hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-white/10"
                          aria-label="Copy number"
                          title="Copy"
                        >
                          {copied === `hl-${idx}` ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-300" />
                          )}
                        </button>
                      )}
                      {isExternal && (
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <p className="text-slate-400 text-xs mt-2 tracking-wide">{h.subtitle}</p>
                  </div>
                </a>
              );
            })}
          </div>

          {/* Bottom safety note */}
          <div className="mt-14 sm:mt-16 max-w-3xl mx-auto p-5 sm:p-6 rounded-2xl border border-emergency-500/20 bg-black/40 backdrop-blur-md">
            <div className="flex gap-4 items-start">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, #b91c1c, #7f1d1d)",
                  boxShadow: "0 10px 25px -8px rgba(220, 38, 38, 0.6)",
                }}
              >
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div className="text-xs sm:text-sm text-slate-300/90 leading-relaxed">
                <strong className="text-white text-sm">
                  🚨 In any cybercrime or harassment incident:
                </strong>{" "}
                <span className="block mt-1">
                  ① <strong className="text-emergency-300">Do not delete</strong> any message, image, call log, or transaction.{" "}
                  ② <strong className="text-emerald-300">Screenshot &amp; archive</strong> everything into{" "}
                  <Link href="/locker" className="text-emergency-300 underline underline-offset-2 hover:text-emergency-200">
                    Cyber Sakhi Evidence Locker
                  </Link>{" "}
                  (forensic SHA-256 hash + chain of custody). ③ <strong className="text-emergency-300">Call 1930</strong>{" "}
                  (cyber) or <strong className="text-emergency-300">112</strong> (emergency) within minutes —{" "}
                  <em>UPI frauds are reversible if reported in the first hour.</em>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          PREMIUM FOOTER
          ========================================================= */}
      <footer className="relative z-10 border-t border-emergency-500/10 bg-black/80 backdrop-blur-md mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="grid md:grid-cols-3 gap-10 md:gap-12 items-start">
            {/* Branding */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img
                  src="/assets/cyber-sakhi-logo.png"
                  alt="Cyber Sakhi"
                  className="w-11 h-11 object-contain"
                  style={{ background: "transparent", mixBlendMode: "screen" }}
                  draggable={false}
                />
                <div>
                  <div className="text-lg font-extrabold tracking-tight">
                    CYBER <span className="text-crimson-gradient">SAKHI</span>
                  </div>
                  <div className="text-[10px] text-slate-500 tracking-[0.2em] uppercase">
                    Women's Digital Safety
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                Unified AI safety companion for women in India. On-device threat detection,
                SHA-256 evidence integrity, explicit Live Location capture, and empathetic
                HerGuardian AI guidance — built trust-first, end-to-end.
              </p>
            </div>

            {/* Links */}
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <h4 className="text-white font-bold tracking-wider text-[11px] uppercase mb-4">
                  Platform
                </h4>
                <ul className="space-y-2.5 text-slate-400">
                  <li>
                    <Link href="/login" className="hover:text-emergency-300 transition-colors">
                      Login with Sakhi Number
                    </Link>
                  </li>
                  <li>
                    <Link href="/signup" className="hover:text-emergency-300 transition-colors">
                      Create Free Account
                    </Link>
                  </li>
                  <li>
                    <Link href="/dashboard" className="hover:text-emergency-300 transition-colors">
                      Safety Dashboard
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold tracking-wider text-[11px] uppercase mb-4">
                  Safety Center
                </h4>
                <ul className="space-y-2.5 text-slate-400">
                  <li>
                    <Link href="#cybercrime-cases" className="hover:text-emergency-300 transition-colors">
                      Real Cybercrime Cases
                    </Link>
                  </li>
                  <li>
<button
                    type="button"
                    onClick={openCyberSafetyBriefing}
                    className="hover:text-emergency-300 transition-colors text-left"
                  >
                    Cyber Safety Briefing
                  </button>
                  </li>
                  <li>
                    <Link href="/companion" className="hover:text-emergency-300 transition-colors">
                      Talk to Sakhi AI
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            {/* Legal / Credits */}
            <div className="text-xs space-y-5">
              <div>
                <h4 className="text-white font-bold tracking-wider text-[11px] uppercase mb-3">
                  Legal &amp; Privacy
                </h4>
                <ul className="space-y-2 text-slate-400">
                  <li>
                    <Link href="/privacy" className="hover:text-emergency-300 transition-colors flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> Privacy Policy
                    </Link>
                  </li>
                </ul>
                <p className="mt-4 text-slate-500 leading-relaxed">
                  Client-side SHA-256 evidence hashing. Zero-knowledge encryption for vaulted
                  data. Your personal safety information never travels unencrypted.
                </p>
              </div>
              <div className="pt-3 border-t border-white/5 space-y-1">
                <p className="text-slate-500">
                  © {new Date().getFullYear()} Cyber Sakhi. All rights reserved.
                </p>
                <p className="text-slate-600 tracking-wide text-[11px]">
                  Stay Safe. Stay Protected. 🛡️
                </p>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Global brand pulse-glow keyframes (shared) */}
      <style jsx global>{`
        @keyframes pulseGlow {
          0%, 100% {
            text-shadow:
              0 0 28px rgba(239, 68, 68, 0.45),
              0 0 58px rgba(239, 68, 68, 0.25),
              0 2px 0 rgba(0, 0, 0, 0.4);
          }
          50% {
            text-shadow:
              0 0 48px rgba(239, 68, 68, 0.75),
              0 0 95px rgba(220, 38, 38, 0.55),
              0 2px 0 rgba(0, 0, 0, 0.4);
          }
        }
      `}</style>

      {/* Cyber Safety Briefing — premium newspaper overlay over the landing page */}
      <CyberSafetyBriefingModal
        isOpen={isCyberSafetyBriefingOpen}
        onClose={closeCyberSafetyBriefing}
      />
    </div>
  );
}
