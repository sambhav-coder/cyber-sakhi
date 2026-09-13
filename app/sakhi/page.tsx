import { Suspense } from "react";
import { SakhiHub } from "@/components/companion/SakhiHub";

export const dynamic = "force-dynamic";

export default function SakhiHubPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-7rem)] min-h-[540px] rounded-3xl border border-emergency-900/25 bg-[#08080f]/80 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 mx-auto border-2 border-emergency-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500 font-bold">
              Opening Sakhi's hub…
            </p>
          </div>
        </div>
      }
    >
      <SakhiHub />
    </Suspense>
  );
}