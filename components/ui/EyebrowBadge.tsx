import React from "react";

interface EyebrowBadgeProps {
  icon: React.ElementType;
  children: React.ReactNode;
}

export function EyebrowBadge({ icon: Icon, children }: EyebrowBadgeProps) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emergency-950/70 border border-emergency-500/40 text-emergency-300 text-xs font-semibold">
      <Icon className="w-3.5 h-3.5" />
      <span>{children}</span>
    </div>
  );
}