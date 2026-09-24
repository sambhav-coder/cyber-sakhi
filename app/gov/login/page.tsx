import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { GovHeader } from "@/components/gov/GovHeader";
import { GovFooter } from "@/components/gov/GovFooter";
import { GovLoginForm } from "@/components/gov/GovLoginForm";
import { GOV_SESSION_COOKIE_NAME } from "@/lib/gov/govCookie";
import { validateGovSessionToken } from "@/lib/gov/govSession";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const metadata = {
  title: "Officer Sign-In",
  description: "Secure sign-in to the Cyber-Sakhi Government Console.",
};

// Reads the session cookie and the officer roster on every request.
export const dynamic = "force-dynamic";

export interface GovRosterOfficer {
  officer_code: string;
  full_name: string;
  role: string;
  department: string | null;
  scope: string;
  state_code: string | null;
  district_code: string | null;
}

async function loadRoster(): Promise<GovRosterOfficer[]> {
  try {
    // Officer codes only: official emails are never exposed to
    // unauthenticated visitors.
    const { data, error } = await getSupabaseServer()
      .from("gov_officers")
      .select(
        "officer_code, full_name, role, department, scope, state_code, district_code",
      )
      .eq("status", "ACTIVE")
      .order("officer_code", { ascending: true });
    if (error) return [];
    return (data as GovRosterOfficer[]) ?? [];
  } catch {
    // A roster outage must never block the sign-in form itself.
    return [];
  }
}

export default async function GovLoginPage() {
  // Already-authenticated officers never see the sign-in form.
  const token = cookies().get(GOV_SESSION_COOKIE_NAME)?.value ?? null;
  const evaluation = await validateGovSessionToken(token ?? "");
  if (evaluation.valid) redirect("/gov/dashboard");

  const officers = await loadRoster();

  return (
    <div className="flex min-h-screen flex-col">
      <GovHeader overHero={false} />
      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <GovLoginForm officers={officers} />
      </main>
      <GovFooter />
    </div>
  );
}