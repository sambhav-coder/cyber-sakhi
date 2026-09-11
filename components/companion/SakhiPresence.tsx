"use client";

import React from "react";

interface SakhiPresenceProps {
  isSpeaking?: boolean;
  className?: string;
}

const EMBERS = [
  { left: "14%", bottom: "8%", size: 5, delay: 0, duration: 6 },
  { left: "22%", bottom: "14%", size: 3, delay: 1.8, duration: 8 },
  { left: "30%", bottom: "6%", size: 4, delay: 0.9, duration: 7 },
  { left: "44%", bottom: "16%", size: 3, delay: 2.6, duration: 6.5 },
  { left: "58%", bottom: "10%", size: 4, delay: 1.2, duration: 7.5 },
  { left: "70%", bottom: "6%", size: 5, delay: 3.2, duration: 8.5 },
  { left: "80%", bottom: "14%", size: 3, delay: 0.4, duration: 6.8 },
  { left: "86%", bottom: "8%", size: 4, delay: 2.2, duration: 7.2 },
];

/** Feminine AI companion presence — a human-like silhouette (NOT an orb/robot/circle). */
export function SakhiPresence({ isSpeaking = false, className = "" }: SakhiPresenceProps) {
  return (
    <div className={`relative ${className}`} aria-hidden={!isSpeaking}>
      {/* Ambient particles */}
      <div className="absolute inset-0 -z-10 overflow-visible pointer-events-none" aria-hidden>
        {EMBERS.map((e, i) => (
          <span
            key={i}
            className="sakhi-ember"
            style={{
              left: e.left,
              bottom: e.bottom,
              width: e.size,
              height: e.size,
              animationDelay: `${e.delay}s`,
              animationDuration: `${e.duration}s`,
            }}
          />
        ))}
      </div>

      <svg
        viewBox="0 0 260 340"
        role="img"
        aria-label="Sakhi — your AI companion"
        className="w-full h-auto select-none"
      >
        <defs>
          <radialGradient id="sp-halo" cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="#ff5a4e" stopOpacity="0.34" />
            <stop offset="45%" stopColor="#dc2626" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sp-haloBoost" cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="#ff6b5e" stopOpacity="0.5" />
            <stop offset="45%" stopColor="#ef4444" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#b91c1c" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sp-hair" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#251a20" />
            <stop offset="50%" stopColor="#140c14" />
            <stop offset="100%" stopColor="#0d0a12" />
          </linearGradient>
          <linearGradient id="sp-skin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f6cdac" />
            <stop offset="55%" stopColor="#eba87f" />
            <stop offset="100%" stopColor="#d98d68" />
          </linearGradient>
          <linearGradient id="sp-garment" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#3a1516" />
            <stop offset="55%" stopColor="#241014" />
            <stop offset="100%" stopColor="#14090d" />
          </linearGradient>
          <filter id="sp-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Warm halo behind the figure */}
        <ellipse
          cx="130"
          cy="150"
          rx="118"
          ry="118"
          fill={isSpeaking ? "url(#sp-haloBoost)" : "url(#sp-halo)"}
          filter="blur(6px)"
          className="transition-all duration-700"
        />

        {/* Back hair mass */}
        <path
          d="M130 50 C152 50 176 58 190 76 C204 94 210 118 210 144 C210 180 204 214 192 240 C186 254 178 266 168 276 C162 284 154 290 144 292 C116 297 82 292 68 276 C56 264 48 246 44 222 C38 188 38 148 46 118 C52 94 68 70 92 58 C104 53 118 50 130 50 Z"
          fill="url(#sp-hair)"
        />

        {/* Shoulders / garment */}
        <path
          d="M114 190 C96 198 78 208 68 226 C58 244 54 262 60 276 C98 270 118 264 130 264 C142 264 162 270 200 276 C206 262 204 244 194 226 C184 208 164 198 146 190 Z"
          fill="url(#sp-garment)"
        />
        {/* Garment neckline thread */}
        <path
          d="M117 202 C128 210 132 210 143 202"
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.55"
        />
        {/* Collarbone hints */}
        <path
          d="M104 224 C112 228 120 228 128 224"
          fill="none"
          stroke="#7c1f1f"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M132 224 C140 228 148 228 156 224"
          fill="none"
          stroke="#7c1f1f"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* Neck */}
        <path
          d="M119 154 C118 174 116 184 113 196 L147 196 C144 184 142 174 141 154 Z"
          fill="url(#sp-skin)"
        />
        {/* Neck shadows */}
        <path
          d="M114 160 C115 178 115 188 114 196"
          fill="none"
          stroke="#a35a3e"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.35"
          filter="url(#sp-glow)"
        />
        <path
          d="M146 160 C145 178 145 188 146 196"
          fill="none"
          stroke="#c66a45"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.4"
          filter="url(#sp-glow)"
        />

        {/* Face */}
        <path
          d="M130 58 C112 58 98 72 96 96 C94 126 100 148 116 160 C124 166 136 166 144 160 C160 148 166 126 164 96 C162 72 148 58 130 58 Z"
          fill="url(#sp-skin)"
        />

        {/* Forehead fringe */}
        <path
          d="M100 82 C106 68 120 58 132 58 C146 58 154 64 160 72 C150 68 140 70 134 74 C126 80 120 88 116 98 C110 92 104 88 100 82 Z"
          fill="url(#sp-hair)"
        />

        {/* Side hair curtains (in front of face edges) */}
        <path
          d="M98 72 C90 90 88 110 88 128 C88 152 92 166 96 178 C98 168 100 154 100 142 C98 118 98 98 104 84 C102 80 100 76 98 72 Z"
          fill="url(#sp-hair)"
          opacity="0.96"
        />
        <path
          d="M162 72 C170 90 172 110 172 128 C172 152 168 166 164 178 C162 168 160 154 160 142 C162 118 162 98 156 84 C158 80 160 76 162 72 Z"
          fill="url(#sp-hair)"
          opacity="0.96"
        />

        {/* Blush + lower face warmth */}
        <ellipse cx="101" cy="128" rx="10" ry="7" fill="#ff7a66" opacity="0.16" filter="url(#sp-glow)" />
        <ellipse cx="159" cy="128" rx="10" ry="7" fill="#ff7a66" opacity="0.16" filter="url(#sp-glow)" />

        {/* Brows */}
        <path d="M104 106 Q112 101 120 105" fill="none" stroke="#5f2b26" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        <path d="M140 105 Q148 101 156 106" fill="none" stroke="#5f2b26" strokeWidth="2" strokeLinecap="round" opacity="0.8" />

        {/* Eyes — calm, closed */}
        <path d="M106 121 Q113 127 120 122" fill="none" stroke="#3d1d1a" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
        <path d="M140 122 Q147 127 154 121" fill="none" stroke="#3d1d1a" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
        {/* Lash hints */}
        <path d="M104 123 L101 127" stroke="#3d1d1a" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
        <path d="M156 123 L159 127" stroke="#3d1d1a" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />

        {/* Nose */}
        <path d="M129 122 L130 134 M128 133 Q130 136 132 133" fill="none" stroke="#a0513a" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />

        {/* Lips — gentle smile */}
        <path d="M121 148 Q130 154 139 148" fill="none" stroke="#9c4438" strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
        <path d="M124 151 Q130 156 136 151" fill="none" stroke="#a8513f" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />

        {/* Crimson rim light — right side of face */}
        <path
          d="M164 102 C168 124 168 144 158 156 M162 92 C166 96 168 98 170 98"
          fill="none"
          stroke="#ff6b5e"
          strokeWidth="2.6"
          strokeLinecap="round"
          opacity={isSpeaking ? "0.95" : "0.6"}
          filter="url(#sp-glow)"
        />
        {/* Crimson rim light — right side of hair */}
        <path
          d="M206 128 C214 168 206 208 188 244 C182 258 174 268 164 276"
          fill="none"
          stroke="#ff5a4e"
          strokeWidth="3"
          strokeLinecap="round"
          opacity={isSpeaking ? "0.8" : "0.45"}
          filter="url(#sp-glow)"
        />
        {/* Cool navy rim light — left edge of hair/shoulder */}
        <path
          d="M50 140 C42 168 44 200 52 226 C58 244 64 256 72 266"
          fill="none"
          stroke="#7fb2ff"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.3"
          filter="url(#sp-glow)"
        />

        {/* Subtle skin sheen on cheek — warm key light */}
        <ellipse cx="124" cy="132" rx="16" ry="10" fill="#ffd9c0" opacity="0.2" filter="url(#sp-glow)" />
      </svg>
    </div>
  );
}