import { GovHeader } from "@/components/gov/GovHeader";
import { GovFooter } from "@/components/gov/GovFooter";
import { GovResetPasswordForm } from "@/components/gov/GovRecoveryForms";

export const metadata = {
  title: "Set New Password",
  description: "Complete a Cyber-Sakhi Government Console password reset.",
};

export const dynamic = "force-dynamic";

export default function GovResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="flex min-h-screen flex-col">
      <GovHeader overHero={false} />
      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <GovResetPasswordForm token={token} />
      </main>
      <GovFooter />
    </div>
  );
}
