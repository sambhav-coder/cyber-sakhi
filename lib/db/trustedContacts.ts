import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type { TrustedContactRow } from "./types";

export async function listTrustedContactsForUser(
  userId: string
): Promise<TrustedContactRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("trusted_contacts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  throwIfError(error, "Failed to list trusted contacts.");
  return (data || []) as TrustedContactRow[];
}

export async function replaceTrustedContactsForUser(
  userId: string,
  contacts: Array<{
    name: string;
    relationship: string;
    phone: string;
    email: string;
    isVerified: boolean;
    isPrimary: boolean;
    notifyWhatsApp: boolean;
    notifySms: boolean;
  }>
): Promise<TrustedContactRow[]> {
  const client = getSupabaseServer();
  const { error: deleteError } = await client
    .from("trusted_contacts")
    .delete()
    .eq("user_id", userId);

  throwIfError(deleteError, "Failed to replace trusted contacts.");

  if (contacts.length === 0) return [];

  const { data, error } = await client
    .from("trusted_contacts")
    .insert(
      contacts.map((contact) => ({
        user_id: userId,
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        email: contact.email,
        is_verified: contact.isVerified,
        is_primary: contact.isPrimary,
        notify_whatsapp: contact.notifyWhatsApp,
        notify_sms: contact.notifySms,
      }))
    )
    .select("*");

  throwIfError(error, "Failed to save trusted contacts.");
  return (data || []) as TrustedContactRow[];
}
