import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type { CaseChatMessageRow } from "./types";

export async function appendCaseChatMessage(input: {
  caseId: string;
  userId: string;
  role: "user" | "sakhi";
  content: string;
}): Promise<CaseChatMessageRow> {
  const { data, error } = await getSupabaseServer()
    .from("case_chat_messages")
    .insert({
      case_id: input.caseId,
      author_id: input.userId,
      role: input.role,
      content: input.content,
    })
    .select("*")
    .single();

  throwIfError(error, "Failed to save case conversation message.");
  return data as CaseChatMessageRow;
}