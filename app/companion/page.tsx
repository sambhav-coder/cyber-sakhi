"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Send,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Lock,
  PhoneCall,
  Languages,
  Bot,
  User,
  HeartHandshake,
  Mic,
  Plus,
  Trash2,
  Pencil,
  Paperclip,
  X,
  FileText,
  Loader2,
  MessageCircle,
  Hash,
  Mail,
  LayoutDashboard,
  ChevronRight,
} from "lucide-react";
import type { ChatMessage, SakhiLanguage } from "@/lib/sakhiAI";
import { VoiceModePortal } from "@/components/companion/VoiceModePortal";
import { LockerPicker } from "@/components/companion/LockerPicker";
import type { LockerItem } from "@/components/companion/LockerPicker";
import { getBrowserSpeechCapabilities, speakNow } from "@/lib/voice/speech";
import { SakhiPresence } from "@/components/companion/SakhiPresence";

interface ConversationSummary {
  id: string;
  title: string;
  language: SakhiLanguage;
  createdAt: string;
  updatedAt: string;
}

interface PendingAttachment {
  kind: "document" | "evidence";
  name?: string;
  content?: string;
  note?: string;
  evidenceCode?: string;
  title?: string;
}

interface UploadExtract {
  name: string;
  size: number;
  mimeType: string;
  kind: string;
  kindLabel: string;
  content: string | null;
  note: string | null;
  contentLength: number;
  preview: string;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CompanionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [language, setLanguage] = useState<SakhiLanguage>("en");
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [voiceStatusText, setVoiceStatusText] = useState<string>("Voice: probing browser support…");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [lockerOpen, setLockerOpen] = useState(false);
  const [lockerLoading, setLockerLoading] = useState(false);
  const [lockerItems, setLockerItems] = useState<LockerItem[]>([]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [showLanding, setShowLanding] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [introText, setIntroText] = useState("");
  const [showIntro, setShowIntro] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [canAutoPlay, setCanAutoPlay] = useState(false);
  const speakRef = useRef<ReturnType<typeof speakNow> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const quickChips: string[] = [
    "Someone is threatening to leak my photos. What should I do?",
    "I got an SMS saying my KYC will expire and to click a link. Is it a scam?",
    "I shared an OTP with someone by mistake. What should I do now?",
    "Someone I don't know won't stop calling and messaging me.",
    "How should I preserve screenshots as evidence?",
  ];

  // ---- conversations -------------------------------------------------------
  const refreshConversations = async () => {
    try {
      const res = await fetch("/api/chat/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      /* offline */
    }
  };

  const openConversation = async (id: string) => {
    setLoadingHistory(true);
    setActiveConvoId(id);
    try {
      const res = await fetch(`/api/chat?conversationId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setMessages((data.messages || []).map((m: any) => ({
        id: m.id,
        sender: m.sender as ChatMessage["sender"],
        text: m.text,
        timestamp: m.timestamp || nowLabel(),
        quickActions: m.quickActions || undefined,
      })));
    } catch {
      setMessages([]);
      setNotice("Couldn't load that conversation.");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    refreshConversations();
    const caps = getBrowserSpeechCapabilities();
    setVoiceStatusText(
      caps.stt || caps.tts
        ? "Voice Mode: on-device speech available in this browser."
        : "Voice Mode: this browser lacks speech support — type instead."
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sakhi introduction with speech synthesis
  useEffect(() => {
    if (!showLanding) return;

    const greeting = "Hi. I'm Sakhi.";
    const introduction = "I'm here to help you stay safe online.";
    const fullText = greeting + "\n\n" + introduction;

    // Check browser speech capabilities
    const caps = getBrowserSpeechCapabilities();
    setSpeechEnabled(caps.tts);

    // Try to detect autoplay capability
    const testSpeech = () => {
      try {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const testUtterance = new SpeechSynthesisUtterance('');
          window.speechSynthesis.speak(testUtterance);
          window.speechSynthesis.cancel();
          setCanAutoPlay(true);
        }
      } catch {
        setCanAutoPlay(false);
      }
    };

    // Start introduction sequence
    const startIntroduction = () => {
      setIsSpeaking(true);
      setShowIntro(true);
      
      // Text animation
      let index = 0;
      const textInterval = setInterval(() => {
        if (index < fullText.length) {
          setIntroText(fullText.slice(0, index + 1));
          index++;
        } else {
          clearInterval(textInterval);
          setIsSpeaking(false);
        }
      }, 40);

      // Speech synthesis
      if (caps.tts && canAutoPlay) {
        const speakHandle = speakNow(fullText, {
          language: "en",
          rate: 0.9,
          onStart: () => {
            setIsSpeaking(true);
          },
          onEnd: () => {
            setIsSpeaking(false);
          },
          onError: () => {
            setIsSpeaking(false);
          }
        });
        speakRef.current = speakHandle;
      }

      return () => {
        clearInterval(textInterval);
        speakRef.current?.cancel();
      };
    };

    // Test autoplay then start
    testSpeech();
    
    // Small delay to allow autoplay test
    const startDelay = setTimeout(() => {
      startIntroduction();
    }, 100);

    return () => {
      clearTimeout(startDelay);
      speakRef.current?.cancel();
    };
  }, [showLanding, canAutoPlay]);

  useEffect(() => {
    const initialQuery = searchParams.get("q");
    if (initialQuery) {
      doSend(initialQuery);
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const startNewConversation = () => {
    setActiveConvoId(null);
    setMessages([]);
    setAttachments([]);
    setEditingTitle(null);
    setShowLanding(false);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  const enterChatMode = () => {
    setShowLanding(false);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  const enterVoiceMode = () => {
    setShowLanding(false);
    setVoiceOpen(true);
  };

  const enableSpeechAndRetry = () => {
    setCanAutoPlay(true);
    // Restart introduction with speech
    const greeting = "Hi. I'm Sakhi.";
    const introduction = "I'm here to help you stay safe online.";
    const fullText = greeting + "\n\n" + introduction;
    
    setIsSpeaking(true);
    setIntroText("");
    
    let index = 0;
    const textInterval = setInterval(() => {
      if (index < fullText.length) {
        setIntroText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(textInterval);
        setIsSpeaking(false);
      }
    }, 40);

    const speakHandle = speakNow(fullText, {
      language: "en",
      rate: 0.9,
      onStart: () => {
        setIsSpeaking(true);
      },
      onEnd: () => {
        setIsSpeaking(false);
      },
      onError: () => {
        setIsSpeaking(false);
      }
    });
    speakRef.current = speakHandle;
  };

  const deleteConversation = async (id: string) => {
    try {
      await fetch("/api/chat/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id }),
      });
    } catch { /* offline */ }
    if (activeConvoId === id) {
      setActiveConvoId(null);
      setMessages([]);
    }
    refreshConversations();
  };

  const renameConversation = async (id: string, title: string) => {
    try {
      await fetch("/api/chat/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, title }),
      });
    } catch { /* offline */ }
    setEditingTitle(null);
    refreshConversations();
  };

  // ---- sending -------------------------------------------------------------
  const doSend = async (
    text?: string,
    forcedAttachments?: PendingAttachment[]
  ): Promise<string | null> => {
    const query = (text ?? inputText).trim();
    const atts = forcedAttachments ?? attachments;
    if (!query) return null;

    setMessages((prev) => [...prev, {
      id: "user_" + Date.now(),
      sender: "user",
      text: query,
      timestamp: nowLabel(),
    }]);
    setInputText("");
    setAttachments([]);
    setNotice(null);
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          language,
          conversationId: activeConvoId,
          attachments: atts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sakhi companion service error.");

      const reply: ChatMessage = {
        id: data?.id || "sakhi_" + Date.now(),
        sender: "sakhi",
        text: data?.text || "",
        timestamp: data?.timestamp || nowLabel(),
        quickActions: data?.quickActions || [],
        category: data?.category,
      };
      setMessages((prev) => [...prev, reply]);
      if (data?.provider?.label) setProviderLabel(data.provider.label);
      if (data?.context?.conversationId) {
        setActiveConvoId(data.context.conversationId);
        refreshConversations();
      }
      return reply.text || data?.text || null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sakhi companion service error.";
      setMessages((prev) => [...prev, {
        id: "sakhi_err_" + Date.now(),
        sender: "sakhi",
        text: `Sorry — I couldn't complete that. ${msg}`,
        timestamp: nowLabel(),
      }]);
      return null;
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = (text?: string) => {
    void doSend(text);
  };

  // ---- uploads -------------------------------------------------------------
  const handleUploadFile = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotice("That file is too large (max 5 MB for text analysis).");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/chat/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed.");
      const extract: UploadExtract = data.file;
      if (extract.content && extract.content.trim()) {
        await doSend(`Please review this document for safety signals.`, [
          {
            kind: "document",
            name: extract.name,
            content: extract.content,
            note: extract.note ?? undefined,
          },
        ]);
      } else {
        setAttachments((prev) => [...prev, {
          kind: "document",
          name: extract.name,
          note: extract.note || "No text was extracted.",
        }]);
        setNotice(
          extract.note ||
            "The file was attached, but no text could be extracted."
        );
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // ---- evidence attach -----------------------------------------------------
  const openLockerPicker = async () => {
    setLockerOpen(true);
    setLockerLoading(true);
    try {
      const res = await fetch("/api/evidence", { cache: "no-store" });
      const data = await res.json();
      const items = Array.isArray(data) ? data : data?.evidence || [];
      setLockerItems(items.map((it: any) => ({
        id: it.id,
        evidenceCode: it.evidence_code || it.evidenceCode || "EV-UNKNOWN",
        title: it.title ?? null,
        mimeType: it.mime_type || it.mimeType || null,
        category: it.category || null,
        createdAt: it.created_at || "",
        size: it.file_size ?? null,
        isLocked:
          it.lock_metadata?.locked === true ||
          it.metadata?.locked === true ||
          Boolean(it.lock_method),
      })));
    } catch {
      setLockerItems([]);
      setNotice("Couldn't load your Evidence Locker.");
    } finally {
      setLockerLoading(false);
    }
  };

  const attachLockerItem = (item: LockerItem) => {
    setAttachments((prev) => [...prev, {
      kind: "evidence",
      evidenceCode: item.evidenceCode,
      title: item.title || undefined,
    }]);
    setLockerOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ---- voice ---------------------------------------------------------------
  const handleVoiceUtterance = async (text: string): Promise<string | null> => {
    return doSend(text);
  };

  // ---- quick actions --------------------------------------------------------
  const handleActionClick = (actionType: string) => {
    switch (actionType) {
      case "NAVIGATE_SOS": router.push("/sos"); break;
      case "NAVIGATE_LOCKER": router.push("/locker"); break;
      case "NAVIGATE_DETECTOR": router.push("/detector"); break;
      case "NAVIGATE_CONTACTS": router.push("/contacts"); break;
      case "DIAL_112": window.location.href = "tel:112"; break;
      case "DIAL_1091": window.location.href = "tel:1091"; break;
      case "DIAL_1930": window.location.href = "tel:1930"; break;
      case "DIAL_14416": window.location.href = "tel:14416"; break;
      case "OPEN_CYBERCRIME_PORTAL":
        window.open("https://cybercrime.gov.in", "_blank");
        break;
      default: break;
    }
  };

  const hasMessages = messages.length > 0;

  // Cinematic Landing Experience
  if (showLanding && !hasMessages && !loadingHistory) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
        {/* Cinematic Background - Reference composition */}
        <div className="absolute inset-0 bg-[#020205]" />
        
        {/* Deep navy gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#0d0d1e] to-[#050508]" />
        
        {/* Crimson ambient lighting behind Sakhi */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-emergency-900/15 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emergency-800/20 rounded-full blur-2xl" />
        
        {/* Blue accent lights */}
        <div className="absolute top-32 right-32 w-48 h-48 bg-blue-900/10 rounded-full blur-2xl" />
        <div className="absolute bottom-32 left-32 w-40 h-40 bg-blue-800/10 rounded-full blur-2xl" />
        
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'linear-gradient(rgba(239, 68, 68, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(239, 68, 68, 0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />

        {/* UI Overlays from Reference */}
        {/* Header Branding */}
        <div className="absolute top-8 left-8 z-20 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emergency-700 to-emergency-950 p-0.5 shadow-lg shadow-emergency-900/40">
            <div className="w-full h-full bg-[#0d0d1e] rounded-[10px] flex items-center justify-center">
              <Bot className="w-6 h-6 text-emergency-500" />
            </div>
          </div>
          <div>
            <div className="text-xl font-black tracking-tighter text-white uppercase flex items-center gap-2">
              Cyber <span className="text-emergency-500">Sakhi</span>
            </div>
            <div className="text-[9px] tracking-[0.2em] text-slate-400 uppercase font-bold">Digital Safety for a Braver You</div>
          </div>
        </div>

        {/* User Profile Hook */}
        <div className="absolute top-8 right-8 z-20">
          <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/40 border border-white/5 backdrop-blur-md">
            <div className="w-8 h-8 rounded-full bg-emergency-700 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-emergency-900/20">
              S
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-white">Sambhav Yadav</div>
              <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">User</div>
            </div>
          </div>
        </div>

        {/* Left Dashboard Mockup */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2 z-20 hidden xl:flex flex-col gap-6 w-64">
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emergency-950/20 border border-emergency-500/30 backdrop-blur-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-emergency-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center gap-4">
                <MessageCircle className="w-5 h-5 text-emergency-500" />
                <div>
                  <div className="text-xs font-bold text-white">Sakhi AI</div>
                  <div className="text-[10px] text-slate-400">Your AI Companion</div>
                </div>
              </div>
            </div>
            {[
              { icon: LayoutDashboard, label: "Dashboard", desc: "Your safety overview" },
              { icon: Mail, label: "Email Forensics", desc: "Analyse suspicious emails" },
              { icon: FileText, label: "My Cases", desc: "Track & manage cases" },
              { icon: Lock, label: "Evidence Locker", desc: "Secure your evidence" },
            ].map((item, i) => (
              <div key={i} className="p-4 rounded-2xl bg-slate-900/20 border border-white/5 hover:border-white/10 transition-colors">
                <div className="flex items-center gap-4 opacity-60">
                  <item.icon className="w-5 h-5 text-slate-400" />
                  <div>
                    <div className="text-xs font-bold text-white">{item.label}</div>
                    <div className="text-[10px] text-slate-500">{item.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-2">
             <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest italic opacity-50">"Same Internet A Safer You"</div>
             <div className="w-8 h-1 bg-emergency-600 rounded-full" />
          </div>
        </div>

        {/* Right Dashboard Mockup */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 z-20 hidden xl:flex flex-col items-end gap-12 w-64">
           <div className="flex flex-col items-end gap-1">
              {['ANALYSE', 'PROTECT', 'GUIDE', 'EMPOWER'].map((word) => (
                <span key={word} className="text-lg font-black tracking-widest text-emergency-500/80 uppercase">{word}</span>
              ))}
           </div>

           <div className="relative p-6 rounded-3xl bg-slate-950/40 border border-white/5 backdrop-blur-md w-full">
              <div className="absolute -top-3 -left-3 w-6 h-6 border-t-2 border-l-2 border-emergency-500/40" />
              <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-2 border-r-2 border-emergency-500/40" />
              
              <div className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-4">Safer India Stronger Women</div>
              
              <div className="relative aspect-square w-full opacity-40 mix-blend-screen overflow-hidden">
                {/* Visual globe placeholder */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.2),transparent_70%)]" />
                <div className="absolute inset-0 border border-white/5 rounded-full" />
                <div className="absolute inset-4 border border-white/5 rounded-full opacity-50" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                {/* Red dot for India location approximation */}
                <div className="absolute top-[45%] left-[65%] w-2 h-2 bg-emergency-500 rounded-full blur-[2px] animate-pulse" />
              </div>

              <div className="mt-4 flex flex-col items-end gap-1 text-[8px] font-bold tracking-widest text-slate-500 uppercase">
                {['DETECT', 'ANALYSE', 'GUIDE', 'SUPPORT', 'EMPOWER'].map(t => <span key={t}>{t}</span>)}
              </div>
           </div>
        </div>

        {/* Floating Books Mockup (Left Bottom) */}
        <div className="absolute left-8 bottom-12 z-20 hidden lg:block opacity-40">
          <div className="flex flex-col -space-y-4">
            {['CYBER LAW', 'DIGITAL FORENSICS', 'ONLINE SAFETY', 'A SAFER TOMORROW'].map((title, i) => (
              <div key={i} className="px-4 py-2 bg-slate-900 border border-white/10 text-[9px] font-bold text-slate-400 w-40 skew-x-[-15deg] shadow-2xl">
                {title}
              </div>
            ))}
          </div>
        </div>

        {/* Cup Mockup (Right Bottom) */}
        <div className="absolute right-24 bottom-12 z-20 hidden lg:block opacity-30">
          <div className="w-20 h-24 bg-gradient-to-b from-slate-800 to-black rounded-b-3xl border-x border-white/5 relative">
             <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[8px] font-bold text-emergency-500 uppercase text-center leading-tight">
                <span>BRAVER</span>
                <span>SAFER</span>
                <span>TOGETHER</span>
             </div>
             <div className="absolute -right-4 top-4 w-8 h-12 border-4 border-slate-800 rounded-r-2xl" />
          </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 flex flex-col items-center justify-center min-h-screen">
          <div className="flex flex-col items-center gap-8 w-full">
            
            {/* Sakhi Presence - Centered as per reference */}
            <div className="relative group">
              {/* Extra cinematic glow */}
              <div className="absolute inset-0 bg-emergency-500/20 blur-[100px] rounded-full scale-150 animate-pulse-slow" />
              <SakhiPresence isSpeaking={isSpeaking} className="w-[300px] sm:w-[380px] lg:w-[460px] relative z-10 transition-transform duration-700 group-hover:scale-[1.02]" />
              
              {/* Introduction Panel - Positioning like the reference "Hi, I'm Sakhi" box */}
              {showIntro && (
                <div className="absolute top-[65%] left-1/2 -translate-x-1/2 w-full max-w-lg z-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                  <div className="relative p-8 rounded-2xl bg-[#05050a]/90 border border-white/10 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
                    {/* Glowing Accent */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emergency-500/50 to-transparent" />
                    
                    {/* Header with Visualizer */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-0.5 items-center">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="w-0.5 h-3 bg-emergency-500/60 rounded-full animate-sakhi-wave" style={{ animationDelay: `${i * 0.1}s` }} />
                          ))}
                        </div>
                        <span className="text-[10px] font-black tracking-[0.2em] text-emergency-500 uppercase">Sakhi Speaking...</span>
                      </div>
                    </div>

                    {/* Message content */}
                    <div className="min-h-[100px] flex flex-col gap-4">
                      <h2 className="text-3xl font-black text-white tracking-tight">Hi, I'm Sakhi.</h2>
                      <p className="text-base text-slate-300 font-medium leading-relaxed max-w-[90%]">
                        {introText}
                      </p>
                    </div>

                    {/* Voice visualizer circle (Reference style) */}
                    <div className="absolute top-8 right-8 w-16 h-16 rounded-full border border-white/5 flex items-center justify-center">
                       <div className="absolute inset-0 rounded-full border border-emergency-500/20 animate-ping-slow" />
                       <div className="flex items-center justify-center gap-0.5">
                          {[...Array(8)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-0.5 bg-emergency-500/80 rounded-full ${isSpeaking ? 'animate-sakhi-wave' : 'h-1 opacity-20'}`}
                              style={{ height: isSpeaking ? `${8 + (i % 3) * 12}px` : '4px', animationDelay: `${i * 0.1}s` }}
                            />
                          ))}
                       </div>
                    </div>

                    {/* Meta Footer */}
                    <div className="mt-8 pt-4 border-t border-white/5 flex justify-between items-center text-[9px] font-black tracking-[0.15em] text-slate-500 uppercase">
                      <span>Private</span>
                      <span>Trusted</span>
                      <span>Judgement-Free</span>
                      <span>Always with you</span>
                    </div>
                  </div>

                  {/* Speech enable prompt if needed */}
                  {speechEnabled && !canAutoPlay && introText.length > 0 && (
                    <button
                      type="button"
                      onClick={enableSpeechAndRetry}
                      className="mt-4 w-full px-6 py-3 rounded-xl bg-emergency-600/10 hover:bg-emergency-600/20 border border-emergency-500/20 text-emergency-300 text-[10px] font-black tracking-widest uppercase transition-all"
                    >
                      Tap to hear Sakhi speak
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Mode Selection - Buttons at the bottom like reference */}
            <div className="flex flex-col sm:flex-row items-center gap-6 pt-32 w-full max-w-4xl mx-auto relative z-20">
              <button
                type="button"
                onClick={enterChatMode}
                className="group relative flex-1 w-full px-10 py-6 rounded-2xl bg-gradient-to-br from-emergency-600 to-emergency-900 hover:from-emergency-500 hover:to-emergency-800 text-white transition-all duration-500 shadow-[0_20px_50px_rgba(127,29,29,0.4)] hover:shadow-[0_25px_60px_rgba(127,29,29,0.6)] hover:scale-[1.02] border border-emergency-400/30 overflow-hidden flex items-center justify-between"
              >
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10 group-hover:scale-110 transition-transform">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <span className="block text-2xl font-black tracking-tight uppercase">Try Chat Mode</span>
                    <span className="block text-[10px] font-bold text-emergency-100/70 tracking-widest uppercase mt-1">
                      Type • Ask • Get Guidance
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-6 h-6 opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>

              <button
                type="button"
                onClick={enterVoiceMode}
                className="group relative flex-1 w-full px-10 py-6 rounded-2xl bg-slate-950/40 hover:bg-slate-900/60 backdrop-blur-2xl border border-white/10 hover:border-blue-500/40 text-slate-100 transition-all duration-500 shadow-2xl hover:scale-[1.02] overflow-hidden flex items-center justify-between"
              >
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center backdrop-blur-md border border-blue-500/20 group-hover:scale-110 transition-transform">
                    <Mic className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <span className="block text-2xl font-black tracking-tight uppercase">Try Voice Mode</span>
                    <span className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-1">
                      Speak • Talk • Get Help
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-6 h-6 opacity-20 group-hover:opacity-60 group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Bottom Footer Text */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-8 text-[9px] font-black tracking-[0.25em] text-slate-600 uppercase">
          <span>Know</span>
          <span>Protect</span>
          <span>Report</span>
          <span>Empower</span>
        </div>

        {/* Brand Sign-off Right Bottom */}
        <div className="absolute bottom-8 right-8 z-20 flex flex-col items-end gap-1 text-right">
          <div className="text-2xl font-black italic text-emergency-500 tracking-tighter" style={{ fontFamily: 'cursive' }}>Sakhi</div>
          <div className="text-[8px] font-bold tracking-[0.2em] text-slate-500 uppercase">More than an AI</div>
          <div className="text-[8px] font-bold tracking-[0.2em] text-slate-500 uppercase">A Safer Tomorrow</div>
        </div>

        {/* Voice Mode Portal */}
        <VoiceModePortal
          open={voiceOpen}
          language={language}
          onClose={() => setVoiceOpen(false)}
          onSendUtterance={handleVoiceUtterance}
          onUpload={handleUploadFile}
          onOpenLocker={openLockerPicker}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl glass-panel border-emergency-900/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emergency-700 via-emergency-800 to-emergency-950 p-0.5 shadow-lg shadow-emergency-950/40">
            <div className="w-full h-full bg-[#0d0d1e] rounded-[14px] flex items-center justify-center">
              <Bot className="w-6 h-6 text-emergency-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Sakhi AI Companion</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emergency-950/70 text-emergency-300 border border-emergency-700/50 font-bold uppercase">
                Pro Build
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Confidential cyber-safety guidance, evidence, documents &amp; voice — in your language
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={startNewConversation}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-emergency-700/40 text-slate-400 hover:text-emergency-200 text-[11px] font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
          <button
            type="button"
            onClick={() => setVoiceOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emergency-950/60 border border-emergency-700/50 hover:border-emergency-500 text-emergency-200 text-[11px] font-semibold transition"
          >
            <Mic className="w-3.5 h-3.5" />
            Voice
          </button>
          <Languages className="w-4 h-4 text-emergency-400" />
          <div className="flex rounded-xl bg-slate-900 border border-slate-700 p-0.5 text-xs font-semibold">
            {(["en", "hi", "hinglish"] as SakhiLanguage[]).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`px-2.5 py-1 rounded-lg transition ${
                  language === l
                    ? "bg-emergency-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {l === "en" ? "English" : l === "hi" ? "हिंदी" : "Hinglish"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[248px_1fr] gap-5 items-start">
        {/* Conversation rail */}
        <aside className="lg:sticky lg:top-6 rounded-2xl glass-panel border-slate-800/80 p-3 hidden md:block max-h-[520px] overflow-y-auto">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
              Conversations
            </span>
            <button
              type="button"
              onClick={startNewConversation}
              className="text-[11px] px-2 py-1 rounded-lg bg-emergency-950/60 hover:bg-emergency-900 text-emergency-200 font-semibold transition"
            >
              + New
            </button>
          </div>
          {conversations.length === 0 && (
            <p className="text-[11px] text-slate-500 px-1 py-3">
              No saved conversations yet. Your general Sakhi chats are kept here, private to your account.
            </p>
          )}
          <div className="space-y-1">
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group relative rounded-xl border px-3 py-2 transition cursor-pointer ${
                  activeConvoId === c.id
                    ? "bg-emergency-950/50 border-emergency-700/50"
                    : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => openConversation(c.id)}
                >
                  {editingTitle === c.id ? (
                    <input
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameConversation(c.id, editTitleValue);
                        if (e.key === "Escape") setEditingTitle(null);
                      }}
                      autoFocus
                      className="w-full rounded-md bg-slate-900 border border-emergency-600 px-2 py-0.5 text-[11px] text-white focus:outline-none"
                    />
                  ) : (
                    <>
                      <p className="text-xs text-slate-200 font-semibold truncate leading-tight">
                        {c.title || "New conversation"}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {timeAgo(c.updatedAt)} · {c.language}
                      </p>
                    </>
                  )}
                </button>
                {editingTitle !== c.id && (
                  <div className="opacity-0 group-hover:opacity-100 absolute right-1.5 top-1.5 flex gap-1 transition">
                    <button
                      type="button"
                      aria-label="Rename conversation"
                      onClick={() => {
                        setEditingTitle(c.id);
                        setEditTitleValue(c.title || "");
                      }}
                      className="p-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      onClick={() => deleteConversation(c.id)}
                      className="p-1 rounded-md bg-slate-900 hover:bg-red-950/60 text-slate-400 hover:text-red-300 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Main column */}
        <div className="space-y-4 min-w-0">
          {/* Mobile conversation chips */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={startNewConversation}
              className={`shrink-0 text-[11px] px-3 py-1.5 rounded-xl border font-semibold transition ${
                !activeConvoId
                  ? "bg-emergency-600 border-emergency-600 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              + New
            </button>
            {conversations.slice(0, 8).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openConversation(c.id)}
                className={`shrink-0 text-[11px] px-3 py-1.5 rounded-xl border transition ${
                  activeConvoId === c.id
                    ? "bg-emergency-950/60 border-emergency-700/50 text-emergency-200"
                    : "bg-slate-900 border-slate-700 text-slate-300"
                }`}
              >
                {c.title || "New conversation"}
              </button>
            ))}
          </div>

          {/* Chat messages */}
          {hasMessages && (
            <div className="rounded-3xl glass-panel border-slate-800/80 p-4 sm:p-6 min-h-[420px] max-h-[560px] overflow-y-auto space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    msg.sender === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.sender === "user"
                        ? "bg-emergency-600 text-white"
                        : "bg-emergency-950/70 text-emergency-300 border border-emergency-700/50"
                    }`}
                  >
                    {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div
                    className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-xs leading-relaxed space-y-3 ${
                      msg.sender === "user"
                        ? "bg-emergency-600 text-white rounded-tr-none shadow-md"
                        : "bg-slate-900/90 text-slate-100 border border-slate-800 rounded-tl-none space-y-2 shadow-lg"
                    }`}
                  >
                    <div className="whitespace-pre-line prose prose-invert prose-xs">
                      {msg.text}
                    </div>
                    {msg.quickActions && msg.quickActions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
                        {msg.quickActions.map((qa, i) => (
                          <button
                            key={i}
                            onClick={() => handleActionClick(qa.actionType)}
                            className="px-3 py-1.5 rounded-lg bg-emergency-950/60 hover:bg-emergency-900 text-emergency-200 border border-emergency-700/40 text-[11px] font-semibold transition flex items-center gap-1.5"
                          >
                            <span>{qa.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div
                      className={`text-[10px] text-right ${
                        msg.sender === "user" ? "text-emergency-200/70" : "text-slate-500"
                      }`}
                    >
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emergency-950/70 text-emergency-300 border border-emergency-700/50 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-900 text-slate-400 text-xs rounded-tl-none border border-slate-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emergency-400 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-emergency-400 animate-pulse delay-75" />
                    <span className="w-1.5 h-1.5 rounded-full bg-emergency-400 animate-pulse delay-150" />
                    <span className="ml-1 text-[11px]">Sakhi is analyzing safety protocols...</span>
                  </div>
                </div>
              )}

              {loadingHistory && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading conversation…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Quick chips */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emergency-400" />
              <span>Recommended Safety Queries</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {quickChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(chip)}
                  className="text-xs px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-emergency-950/50 text-slate-300 hover:text-emergency-200 border border-slate-800 hover:border-emergency-700/40 transition"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Pending attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emergency-950/50 border border-emergency-700/40 text-[11px] text-emergency-200 font-semibold"
                >
                  {a.kind === "evidence" ? (
                    <>
                      <Lock className="w-3 h-3" />
                      <span className="font-mono">{a.evidenceCode}</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3 h-3" />
                      <span className="max-w-[180px] truncate">{a.name}</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((_, j) => j !== i))
                    }
                    aria-label="Remove attachment"
                    className="text-emergency-300/70 hover:text-white transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <span className="text-[10px] text-slate-500 self-center">
                Attachments are sent with your next message.
              </span>
            </div>
          )}

          {/* Notice */}
          {notice && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doSend();
            }}
            className="relative"
          >
            <div className="flex items-center gap-2 absolute left-3 top-1/2 -translate-y-1/2">
              <label className="cursor-pointer p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-emergency-200 transition" title="Attach a document">
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
                <input
                  ref={uploadInputRef}
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadFile(f);
                    if (uploadInputRef.current) uploadInputRef.current.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={openLockerPicker}
                title="Attach from Evidence Locker"
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-emerald-200 transition"
              >
                <Lock className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setVoiceOpen(true)}
                title="Voice mode"
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-emergency-200 transition"
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                language === "hi"
                  ? "सखी से सुरक्षा या कानूनी सलाह के बारे में पूछें..."
                  : language === "hinglish"
                    ? "Koi bhi online threat ya sawaal poochein..."
                    : "Ask Sakhi about online threats, legal options, or emergency steps..."
              }
              className="w-full rounded-2xl bg-slate-900/90 border border-slate-700/80 pl-36 pr-24 py-3.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emergency-500 focus:ring-1 focus:ring-emergency-500/40"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="absolute right-2 top-2 px-4 py-2 rounded-xl bg-emergency-600 hover:bg-emergency-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emergency-950/40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>

          {/* Provider & privacy footer */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500 px-1">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              Reasoning: {providerLabel || "Deterministic Safety Reasoning (heuristic crosswalk)"}
            </span>
            <span className="flex items-center gap-1.5">
              <PhoneCall className="w-3 h-3 text-emerald-500" />
              {voiceStatusText}
            </span>
            <span className="flex items-center gap-1.5">
              <Hash className="w-3 h-3 text-emerald-500" />
              Memory: non-sensitive preferences only
            </span>
          </div>

          {/* Disclaimer */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2.5">
            <HeartHandshake className="w-4 h-4 text-emergency-400 shrink-0 mt-0.5" />
            <span>
              <strong>Important Guidance Note:</strong> Sakhi gives guidance and helps
              preserve evidence. She does not substitute for police emergency response
              (112), professional legal counsel, or medical providers. She never files
              complaints on your behalf.
            </span>
          </div>
        </div>
      </div>

      {/* Overlays */}
      <LockerPicker
        open={lockerOpen}
        loading={lockerLoading}
        items={lockerItems}
        onClose={() => setLockerOpen(false)}
        onAttach={attachLockerItem}
      />
      <VoiceModePortal
        open={voiceOpen}
        language={language}
        onClose={() => setVoiceOpen(false)}
        onSendUtterance={handleVoiceUtterance}
        onUpload={handleUploadFile}
        onOpenLocker={openLockerPicker}
      />
    </div>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CompanionPage() {
  return (
    <Suspense fallback={<div className="text-emergency-400 py-10 text-center">Loading Sakhi Companion…</div>}>
      <CompanionContent />
    </Suspense>
  );
}