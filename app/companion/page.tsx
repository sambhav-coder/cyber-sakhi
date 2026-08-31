"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  MessageSquare,
  Send,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Search,
  Radio,
  PhoneCall,
  Languages,
  RotateCcw,
  Bot,
  User,
  HeartHandshake,
} from "lucide-react";
import { generateSakhiResponse, ChatMessage } from "@/lib/sakhiAI";

function CompanionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize with greeting
  useEffect(() => {
    const initialGreeting = generateSakhiResponse("hello", language);
    setMessages([initialGreeting]);

    const initialQuery = searchParams.get("q");
    if (initialQuery) {
      handleSend(initialQuery);
    }
  }, [language, searchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: "user_" + Date.now(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    setTimeout(() => {
      const sakhiReply = generateSakhiResponse(query, language);
      setMessages((prev) => [...prev, sakhiReply]);
      setIsTyping(false);
    }, 500);
  };

  const handleQuickPrompt = (prompt: string) => {
    handleSend(prompt);
  };

  const handleActionClick = (actionType: string) => {
    switch (actionType) {
      case "NAVIGATE_SOS":
        router.push("/sos");
        break;
      case "NAVIGATE_LOCKER":
        router.push("/locker");
        break;
      case "NAVIGATE_DETECTOR":
        router.push("/detector");
        break;
      case "NAVIGATE_CONTACTS":
        router.push("/contacts");
        break;
      case "DIAL_112":
        window.location.href = "tel:112";
        break;
      case "DIAL_1091":
        window.location.href = "tel:1091";
        break;
      case "DIAL_1930":
        window.location.href = "tel:1930";
        break;
      case "DIAL_14416":
        window.location.href = "tel:14416";
        break;
      case "OPEN_CYBERCRIME_PORTAL":
        window.open("https://cybercrime.gov.in", "_blank");
        break;
      default:
        break;
    }
  };

  const quickChips = [
    "Someone is threatening to leak my photos. What should I do?",
    "I think this message is a scam.",
    "How should I preserve evidence?",
    "I feel unsafe right now. What are my options?",
    "What legal rights do I have against cyber harassment in India?",
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl glass-panel border-pink-900/40">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-600 via-purple-600 to-indigo-500 p-0.5 shadow-lg shadow-pink-900/30">
            <div className="w-full h-full bg-[#0d0d1e] rounded-[14px] flex items-center justify-center">
              <Bot className="w-6 h-6 text-pink-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Sakhi AI Companion</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-950 text-pink-300 border border-pink-700/50 font-bold uppercase">
                HerGuardian 24/7
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Confidential, empathetic advice for digital safety, threats & emotional well-being
            </p>
          </div>
        </div>

        {/* Language Selector */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Languages className="w-4 h-4 text-purple-400" />
          <div className="flex rounded-xl bg-slate-900 border border-slate-700 p-0.5 text-xs font-semibold">
            <button
              onClick={() => setLanguage("en")}
              className={`px-3 py-1 rounded-lg transition ${
                language === "en"
                  ? "bg-purple-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage("hi")}
              className={`px-3 py-1 rounded-lg transition ${
                language === "hi"
                  ? "bg-purple-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              हिंदी (Hindi)
            </button>
          </div>
        </div>
      </div>

      {/* Chat Messages Stream */}
      <div className="rounded-3xl glass-panel border-slate-800/80 p-4 sm:p-6 min-h-[450px] max-h-[550px] overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.sender === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.sender === "user"
                  ? "bg-purple-600 text-white"
                  : "bg-pink-950 text-pink-300 border border-pink-700/50"
              }`}
            >
              {msg.sender === "user" ? (
                <User className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>

            {/* Message Bubble */}
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs leading-relaxed space-y-3 ${
                msg.sender === "user"
                  ? "bg-purple-600 text-white rounded-tr-none shadow-md"
                  : "bg-slate-900/90 text-slate-100 border border-slate-800 rounded-tl-none space-y-2 shadow-lg"
              }`}
            >
              <div className="whitespace-pre-line prose prose-invert prose-xs">
                {msg.text}
              </div>

              {/* Quick Actions in Sakhi replies */}
              {msg.quickActions && msg.quickActions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
                  {msg.quickActions.map((qa, i) => (
                    <button
                      key={i}
                      onClick={() => handleActionClick(qa.actionType)}
                      className="px-3 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-600/40 text-[11px] font-semibold transition flex items-center gap-1.5"
                    >
                      <span>{qa.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div
                className={`text-[10px] text-right ${
                  msg.sender === "user" ? "text-purple-200/70" : "text-slate-500"
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-pink-950 text-pink-300 border border-pink-700/50 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3 rounded-2xl bg-slate-900 text-slate-400 text-xs rounded-tl-none border border-slate-800 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse delay-75" />
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse delay-150" />
              <span className="ml-1 text-[11px]">Sakhi is analyzing safety protocols...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Question Chips */}
      <div className="space-y-1.5">
        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-purple-400" />
          <span>Recommended Safety Queries</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleQuickPrompt(chip)}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-pink-950/60 text-slate-300 hover:text-pink-200 border border-slate-800 hover:border-pink-500/40 transition"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Input Field */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="relative"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            language === "hi"
              ? "सखी से सुरक्षा या कानूनी सलाह के बारे में पूछें..."
              : "Ask Sakhi about online threats, legal options, or emergency steps..."
          }
          className="w-full rounded-2xl bg-slate-900/90 border border-slate-700/80 pl-4 pr-24 py-3.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="absolute right-2 top-2 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-pink-950/40"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>

      {/* Disclaimer Banner */}
      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2.5">
        <HeartHandshake className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
        <span>
          <strong>Important Guidance Note:</strong> Sakhi is an AI safety advisor built for guidance and evidence curation. She does not substitute for police emergency response (112), professional legal counsel, or medical providers.
        </span>
      </div>
    </div>
  );
}

export default function CompanionPage() {
  return (
    <Suspense fallback={<div className="text-pink-400 py-10 text-center">Loading Sakhi Companion...</div>}>
      <CompanionContent />
    </Suspense>
  );
}
