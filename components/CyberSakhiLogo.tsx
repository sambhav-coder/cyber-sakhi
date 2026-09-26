import React from "react";

interface CyberSakhiLogoProps {
  className?: string;
  size?: number;
}

export const CyberSakhiLogo: React.FC<CyberSakhiLogoProps> = ({
  className = "w-6 h-6",
  size,
}) => {
  const hasDimensionClass = Boolean(className && /\b(w-|h-|size-)/.test(className));
  const dimensionStyle: React.CSSProperties | undefined = size
    ? { width: size, height: size }
    : hasDimensionClass
    ? undefined
    : { width: "100%", height: "100%" };

  return (
    <img
      src="/assets/cyber-sakhi-logo.png"
      alt="Cyber Sakhi"
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
      style={{
        ...dimensionStyle,
        background: "transparent",
      }}
    />
  );
};