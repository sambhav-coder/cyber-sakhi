import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { GovHeader } from "@/components/gov/GovHeader";
import { GovFooter } from "@/components/gov/GovFooter";
import { GovForgotIdForm } from "@/components/gov/GovRecoveryForms";
import { GOV_SESSION_COOKIE_NAME } from "@/lib/gov/govCookie";
import { validateGovSessionToken } from "@/lib/gov/govSession";

export const metadata = {
  title: "Recover Officer ID",
  description: "Recover a Cyber-Sakhi Government Console Officer ID.",
};

export const dynamic = "force-dynamic";

export default async function GovForgotIdPage() {
  const token = cookies().get(GOV_SESSION_COOKIE_NAME)?.value ?? null;
  const evaluation = await validateGovSessionToken(token ?? "");
  if (evaluation.valid) redirect("/gov/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <GovHeader overHero={false} />
      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <GovForgotIdForm />
      </main>
      <GovFooter />
    </div>
  );
}
