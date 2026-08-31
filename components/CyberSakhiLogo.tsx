import React from "react";

interface CyberSakhiLogoProps {
  className?: string;
  size?: number;
}

export const CyberSakhiLogo: React.FC<CyberSakhiLogoProps> = ({
  className = "w-6 h-6",
  size,
}) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      aria-label="Cyber Sakhi Logo"
    >
      <defs>
        {/* Main Gradient */}
        <linearGradient id="sakhiGradPrimary" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="50%" stopColor="#9333EA" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>

        {/* Glow Accent Gradient */}
        <linearGradient id="sakhiGradAccent" x1="12" y1="8" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>

        {/* Digital Beacon Radial */}
        <radialGradient id="sakhiBeacon" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E879F9" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#9333EA" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer Companion Protective Arc (Left Wing) */}
      <path
        d="M24 6C14.0589 6 6 14.0589 6 24C6 32.2843 11.7157 39.2307 19.5 41.3V35.8C14.7 34 11.2 29.4 11.2 24C11.2 16.93 16.93 11.2 24 11.2C25.4 11.2 26.7 11.4 28 11.9V6.6C26.7 6.2 25.4 6 24 6Z"
        fill="url(#sakhiGradPrimary)"
      />

      {/* Inner Guardian Silhouette & Lotus Bloom Curve */}
      <path
        d="M24 13C20.134 13 17 16.134 17 20C17 23.866 20.134 27 24 27C27.866 27 31 23.866 31 20C31 16.134 27.866 13 24 13Z"
        fill="url(#sakhiGradAccent)"
        opacity="0.9"
      />

      {/* Cyber Safety Knot / Companion Embrace (Right Wing & Base) */}
      <path
        d="M28.5 41.3C36.2843 39.2307 42 32.2843 42 24C42 14.0589 33.9411 6 24 6V11.2C31.07 11.2 36.8 16.93 36.8 24C36.8 29.4 33.3 34 28.5 35.8V41.3Z"
        fill="url(#sakhiGradPrimary)"
      />

      {/* Digital Companion Core / Smart Beacon Node */}
      <circle cx="24" cy="20" r="3.2" fill="#FFFFFF" />
      <circle cx="24" cy="20" r="5.5" fill="url(#sakhiBeacon)" />

      {/* Safe Haven Radiance Star (Top Crest) */}
      <circle cx="24" cy="6" r="2.2" fill="#F472B6" />
      <circle cx="12" cy="18" r="1.5" fill="#C084FC" />
      <circle cx="36" cy="18" r="1.5" fill="#818CF8" />
      <circle cx="24" cy="42" r="2" fill="#A855F7" />
    </svg>
  );
};