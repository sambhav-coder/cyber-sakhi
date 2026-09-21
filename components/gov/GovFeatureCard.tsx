import React from "react";
import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

interface GovFeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tag?: string;
  tagTone?: "planned" | "preview" | "restricted" | "secure";
}

export const GovFeatureCard: React.FC<GovFeatureCardProps> = ({
  icon: Icon,
  title,
  description,
  tag,
  tagTone = "planned",
}) => {
  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl border border-slate-700/50 bg-slate-900/40 p-5 backdrop-blur-sm transition hover:border-teal-400/40 hover:bg-slate-900/60">
      <div className="flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-600/50 bg-slate-800/70 text-teal-300 transition group-hover:text-teal-200">
          <Icon className="h-5 w-5" />
        </div>
        {tag && (
          <span className={clsx("gov-tag", `gov-tag--${tagTone}`)}>{tag}</span>
        )}
      </div>
      <h3 className="text-base font-bold tracking-tight text-slate-100">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-slate-400">{description}</p>
    </div>
  );
};