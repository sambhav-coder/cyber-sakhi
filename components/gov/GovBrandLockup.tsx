import React from "react";

interface GovBrandLockupProps {
  size?: number;
  subtitle?: boolean;
  textClassName?: string;
}

/**
 * The "Cyber-Sakhi Government Portal" brand lockup: the uploaded brand logo
 * (public/assets/cyber-sakhi-logo.png) + wordmark + subtitle. Used by the
 * header and footer so every instance of the brand looks identical.
 */
export const GovBrandLockup: React.FC<GovBrandLockupProps> = ({
  size = 40,
  subtitle = true,
  textClassName = "",
}) => {
  return (
    <span className="inline-flex items-center gap-3">
      <img
        src="/assets/cyber-sakhi-logo.png"
        alt=""
        aria-hidden
        draggable={false}
        className="shrink-0"
        style={{
          width: size,
          height: size,
          background: "transparent",
          objectFit: "contain",
        }}
      />
      <span className="flex flex-col leading-tight">
        <span className={`text-[15px] font-extrabold tracking-tight text-slate-100 ${textClassName}`}>
          Cyber-Sakhi
        </span>
        {subtitle && (
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-teal-300">
            Government Portal
          </span>
        )}
      </span>
    </span>
  );
};