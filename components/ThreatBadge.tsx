import React from "react";
import { ThreatSeverity } from "@/lib/types";
import { ShieldCheck, AlertTriangle, AlertOctagon, ShieldAlert, CheckCircle2 } from "lucide-react";

interface ThreatBadgeProps {
  severity: ThreatSeverity;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

export const ThreatBadge: React.FC<ThreatBadgeProps> = ({
  severity,
  size = "md",
  showIcon = true,
}) => {
  let colorClasses = "";
  let label: string = severity;
  let Icon = ShieldCheck;

  switch (severity) {
    case "SAFE":
      colorClasses = "bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-emerald-900/20";
      label = "SAFE";
      Icon = CheckCircle2;
      break;
    case "LOW":
      colorClasses = "bg-cyan-950/80 text-cyan-300 border-cyan-500/40 shadow-cyan-900/20";
      label = "LOW RISK";
      Icon = ShieldCheck;
      break;
    case "MEDIUM":
      colorClasses = "bg-amber-950/80 text-amber-300 border-amber-500/40 shadow-amber-900/20";
      label = "MEDIUM RISK";
      Icon = AlertTriangle;
      break;
    case "HIGH":
      colorClasses = "bg-orange-950/80 text-orange-300 border-orange-500/50 shadow-orange-900/30";
      label = "HIGH RISK";
      Icon = ShieldAlert;
      break;
    case "CRITICAL":
      colorClasses = "bg-red-950/90 text-red-300 border-red-500/60 shadow-red-900/40 animate-pulse";
      label = "CRITICAL THREAT";
      Icon = AlertOctagon;
      break;
  }

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5 font-medium tracking-wide",
    lg: "text-sm px-3.5 py-1.5 gap-2 font-semibold tracking-wider",
  }[size];

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full border shadow-sm ${colorClasses} ${sizeClasses}`}
    >
      {showIcon && <Icon className={iconSizes} />}
      <span>{label}</span>
    </span>
  );
};