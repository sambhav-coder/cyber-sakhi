import React from "react";

interface SectionHeaderProps {
  title: string;
  icon: React.ElementType;
}

export function SectionHeader({ title, icon: Icon }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-slate-800 mb-4">
      <Icon className="w-4 h-4 text-emergency-400 shrink-0" />
      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
        {title}
      </h3>
    </div>
  );
}