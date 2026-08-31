"use client";

import React, { useState } from "react";
import {
  Code,
  Terminal,
  Copy,
  CheckCircle2,
  Play,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export default function DeveloperPage() {
  const [testPayload, setTestPayload] = useState(
    '{\n  "text": "Send me your OTP or I will leak your photos."\n}'
  );
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const handleTestApi = async () => {
    setIsLoading(true);
    setApiResponse(null);

    try {
      const parsed = JSON.parse(testPayload);
      const res = await fetch("/api/analyze-threat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setApiResponse(JSON.stringify({ error: "Invalid JSON payload or network error", details: String(err) }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const curlSnippet = `curl -X POST http://localhost:3000/api/analyze-threat \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Send me your OTP or I will leak your photos."}'`;

  const jsSnippet = `import { CyberSakhiClient } from '@cybersakhi/sdk';

const sakhi = new CyberSakhiClient({ apiKey: 'sk_live_demo_992' });

const threatAssessment = await sakhi.detectThreat({
  text: "Send me your OTP or I will leak your photos."
});

console.log(threatAssessment.threatLevel); // "CRITICAL"
console.log(threatAssessment.legalSections); // IT Act 66E, BNS 351`;

  const copyCurl = () => {
    navigator.clipboard.writeText(curlSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 text-xs font-semibold">
          <Code className="w-3.5 h-3.5" />
          <span>SheShield & Cyber Sakhi Integration Engine</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Platform REST API & SDK Documentation
        </h1>
        <p className="text-sm text-slate-300">
          Embed Cyber Sakhi's real-time threat detection and evidence locking into dating apps, social platforms, gaming chats, and university portals.
        </p>
      </div>

      {/* Interactive Playground Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Request Runner */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-6 rounded-2xl glass-panel border-purple-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-purple-400" />
                <span>Live Endpoint Tester: POST /api/analyze-threat</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono">
                200 LIVE
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-semibold">
                Request JSON Body
              </label>
              <textarea
                rows={4}
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-700/80 p-3 font-mono text-xs text-purple-300 focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              onClick={handleTestApi}
              disabled={isLoading}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isLoading ? "Executing Request..." : "Send Live API Request"}</span>
            </button>

            {/* Response Area */}
            {apiResponse && (
              <div className="space-y-2 pt-2 animate-in zoom-in-95">
                <span className="text-xs text-slate-400 font-semibold">
                  JSON Response Payload
                </span>
                <pre className="p-4 rounded-xl bg-slate-950/90 border border-purple-900/60 font-mono text-xs text-emerald-400 overflow-x-auto max-h-64">
                  {apiResponse}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right: Code Examples */}
        <div className="lg:col-span-6 space-y-4">
          {/* cURL Snippet */}
          <div className="p-6 rounded-2xl glass-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                cURL CLI Example
              </span>
              <button
                onClick={copyCurl}
                className="text-xs text-purple-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-slate-800"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedSnippet ? "Copied!" : "Copy"}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto">
              {curlSnippet}
            </pre>
          </div>

          {/* JavaScript / TypeScript SDK */}
          <div className="p-6 rounded-2xl glass-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                TypeScript / Node.js SDK
              </span>
              <span className="text-[10px] text-indigo-400 font-mono">@cybersakhi/sdk</span>
            </div>
            <pre className="p-3.5 rounded-xl bg-slate-950 font-mono text-xs text-indigo-300 overflow-x-auto leading-relaxed">
              {jsSnippet}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
