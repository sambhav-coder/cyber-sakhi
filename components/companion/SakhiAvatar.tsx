"use client";

import React from "react";

interface SakhiAvatarProps {
  isSpeaking?: boolean;
  size?: number;
}

export function SakhiAvatar({ isSpeaking = false, size = 280 }: SakhiAvatarProps) {
  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <style>{SAKHI_AVATAR_CSS}</style>

      {/* Ambient glow */}
      <div className="absolute inset-0 bg-emergency-900/20 rounded-full blur-3xl scale-150" />
      {isSpeaking && (
        <>
          <div className="absolute inset-0 bg-emergency-500/25 rounded-full blur-3xl scale-125 animate-pulse" />
          <div className="absolute inset-0 bg-emergency-400/15 rounded-full blur-2xl scale-110 animate-pulse delay-300" />
        </>
      )}

      {/* Avatar container */}
      <div className="relative z-10 w-full h-full rounded-full bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border-2 border-emergency-500/30 shadow-2xl shadow-emergency-950/50 overflow-hidden">
        
        {/* Digital face representation */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Face silhouette */}
          <div className="relative w-3/4 h-3/4">
            {/* Head */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-24 bg-gradient-to-b from-slate-300 to-slate-400 rounded-t-full rounded-b-3xl opacity-90" />
            
            {/* Hair */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-28 bg-gradient-to-b from-slate-900 to-slate-800 rounded-t-full opacity-80" />
            
            {/* Eyes */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 flex gap-4">
              <div className={`w-3 h-3 bg-emerald-400 rounded-full ${isSpeaking ? 'animate-pulse' : ''}`} />
              <div className={`w-3 h-3 bg-emerald-400 rounded-full ${isSpeaking ? 'animate-pulse' : ''}`} />
            </div>
            
            {/* Mouth */}
            {isSpeaking && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 w-4 h-2 bg-emerald-300 rounded-full animate-pulse" />
            )}
            
            {/* Neural network lines */}
            <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 100 100">
              <line x1="20" y1="30" x2="10" y2="20" stroke="rgb(239, 68, 68)" strokeWidth="0.5" />
              <line x1="80" y1="30" x2="90" y2="20" stroke="rgb(239, 68, 68)" strokeWidth="0.5" />
              <line x1="30" y1="50" x2="15" y2="45" stroke="rgb(239, 68, 68)" strokeWidth="0.5" />
              <line x1="70" y1="50" x2="85" y2="45" stroke="rgb(239, 68, 68)" strokeWidth="0.5" />
              <line x1="25" y1="70" x2="10" y2="75" stroke="rgb(239, 68, 68)" strokeWidth="0.5" />
              <line x1="75" y1="70" x2="90" y2="75" stroke="rgb(239, 68, 68)" strokeWidth="0.5" />
            </svg>
          </div>
        </div>

        {/* Digital scan lines */}
        <div className="absolute inset-0 opacity-10 bg-gradient-to-b from-transparent via-emergency-500 to-transparent animate-scan" />
      </div>
    </div>
  );
}

const SAKHI_AVATAR_CSS = `
@keyframes scan {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}
.animate-scan {
  animation: scan 3s linear infinite;
}
.delay-300 {
  animation-delay: 300ms;
}
`;