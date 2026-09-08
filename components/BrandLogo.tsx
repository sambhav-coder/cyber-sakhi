"use client";

import React from "react";
import { CyberSakhiLogo } from "./CyberSakhiLogo";

interface BrandLogoProps {
  size?: number;
  variant?: "png" | "svg";
  showText?: boolean;
  animated?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 40,
  variant = "png",
  showText = true,
  animated = true,
  className = "",
}) => {
  const img =
    variant === "png" ? (
      <img
        src="/assets/cyber-sakhi-logo.png"
        alt="Cyber Sakhi"
        draggable={false}
        style={{
          width: size,
          height: size,
          background: "transparent",
          mixBlendMode: "screen",
          objectFit: "contain",
          filter: animated
            ? "drop-shadow(0 0 14px rgba(239, 68, 68, 0.55))"
            : undefined,
        }}
      />
    ) : (
      <div
        style={{
          width: size,
          height: size,
        }}
        className="shrink-0"
      >
        <CyberSakhiLogo className="text-emergency-400" />
      </div>
    );

  if (!showText) {
    return (
      <div
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        {img}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className={`relative shrink-0 inline-flex ${
          animated ? "animate-float-slow" : ""
        }`}
      >
        {animated && (
          <div
            aria-hidden
            className="absolute inset-0 blur-2xl opacity-50 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(239, 68, 68, 0.6), transparent 65%)",
            }}
          />
        )}

        {img}
      </div>

      <div className="flex flex-col leading-tight">
        <div className="font-black tracking-tight text-white text-lg sm:text-xl">
          CYBER{" "}
          <span
            className="text-crimson-gradient"
            style={
              animated
                ? {
                    animation: "pulseGlow 4s ease-in-out infinite",
                  }
                : undefined
            }
          >
            SAKHI
          </span>
        </div>

        <div className="text-[10px] tracking-[0.2em] uppercase text-slate-500 font-bold mt-0.5">
          Digital Safety
        </div>
      </div>
    </div>
  );
};