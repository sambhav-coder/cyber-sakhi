import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type {
  SakhiConversationRow,
  SakhiLanguage,
  SakhiMemoryRow,
  SakhiMessageRole,
  SakhiMessageRow,
} from "./types";

/**
 * Sakhi general-companion memory layer (Step 4).
 *
 * Owner-scoped service-role access only. Ordinary clients (anon/authenticated)
 * have no RLS policy on these tables, so every call here must run server-side
 * and always filter by the authenticated user's id.
 *
 * Deliberately never returns sensitive long-term memory (sakhi_memory rows
 * marked sensitive=true are excluded from chat context) and never persists
 * full document text or locked-evidence plaintext — only short transcripts and
 * small preview metadata.
 */

const CONVERSATION_COLS =
  "id, owner_id, title, language, case_id, evidence_codes, created_at, updated_at";
const MESSAGE_COLS =
  "id, conversation_id, role, content, attachment_meta, meta, created_at";
const MEMORY_COLS = "id, owner_id, key, value, kind, sensitive, created_at, updated_at";

export async function createSakhiConversation(input: {
  ownerId: string;
  title?: string;
  language?: SakhiLanguage;
  caseId?: string;
  evidenceCodes?: string[];
}): Promise<SakhiConversationRow> {
  const { data, error } = await getSupabaseServer()
    .from("sakhi_conversations")
    .insert({
      owner_id: input.ownerId,
      title: input.title ?? "New conversation",
      language: input.language ?? "en",
      case_id: input.caseId ?? null,
      evidence_codes: input.evidenceCodes ?? [],
    })
    .select(CONVERSATION_COLS)
    .single();

  throwIfError(error, "Failed to create conversation.");
  return data as SakhiConversationRow;
}

export async function listSakhiConversations(
  ownerId: string
): Promise<SakhiConversationRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("sakhi_conversations")
    .select(CONVERSATION_COLS)
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });

  throwIfError(error, "Failed to list conversations.");
  return (data || []) as SakhiConversationRow[];
}

export async function getSakhiConversation(
  ownerId: string,
  conversationId: string
): Promise<SakhiConversationRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("sakhi_conversations")
    .select(CONVERSATION_COLS)
    .eq("id", conversationId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve conversation.");
  return data as SakhiConversationRow | null;
}

export async function touchSakhiConversation(
  conversationId: string,
  patch: { title?: string; language?: SakhiLanguage }
): Promise<boolean> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.language !== undefined) update.language = patch.language;

  const { error } = await getSupabaseServer()
    .from("sakhi_conversations")
    .update(update)
    .eq("id", conversationId);

  if (error) return false;
  return true;
}

export async function deleteSakhiConversation(
  ownerId: string,
  conversationId: string
): Promise<boolean> {
  const { error } = await getSupabaseServer()
    .from("sakhi_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("owner_id", ownerId);
  throwIfError(error, "Failed to delete conversation.");
  return true;
}

export async function appendSakhiMessage(input: {
  ownerId: string;
  conversationId: string;
  role: SakhiMessageRole;
  content: string;
  attachmentMeta?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  titleIfFirst?: string;
}): Promise<SakhiMessageRow> {
  const { data, error } = await getSupabaseServer()
    .from("sakhi_messages")
    .insert({
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      attachment_meta: input.attachmentMeta ?? null,
      meta: input.meta ?? null,
    })
    .select(MESSAGE_COLS)
    .single();

  throwIfError(error, "Failed to save message.");

  if (input.titleIfFirst) {
    const { count } = await getSupabaseServer()
      .from("sakhi_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", input.conversationId);
    const messageCount = count ?? 1;
    if (messageCount <= 1) {
      await touchSakhiConversation(input.conversationId, {
        title: input.titleIfFirst.slice(0, 80),
      });
    }
  }

  return data as SakhiMessageRow;
}

export async function listSakhiMessages(
  ownerId: string,
  conversationId: string
): Promise<SakhiMessageRow[]> {
  const convo = await getSakhiConversation(ownerId, conversationId);
  if (!convo) return [];

  const { data, error } = await getSupabaseServer()
    .from("sakhi_messages")
    .select(MESSAGE_COLS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  throwIfError(error, "Failed to list messages.");
  return (data || []) as SakhiMessageRow[];
}

export async function saveSakhiMemory(input: {
  ownerId: string;
  key: string;
  value: string;
  kind?: string;
  sensitive?: boolean;
}): Promise<SakhiMemoryRow> {
  const existing = await getSakhiMemory(input.ownerId, input.key);
  if (existing) {
    const { data, error } = await getSupabaseServer()
      .from("sakhi_memory")
      .update({ value: input.value, kind: input.kind ?? existing.kind })
      .eq("owner_id", input.ownerId)
      .eq("key", input.key)
      .select(MEMORY_COLS)
      .single();
    throwIfError(error, "Failed to update memory.");
    return data as SakhiMemoryRow;
  }

  const { data, error } = await getSupabaseServer()
    .from("sakhi_memory")
    .insert({
      owner_id: input.ownerId,
      key: input.key,
      value: input.value,
      kind: input.kind ?? "preference",
      sensitive: input.sensitive ?? false,
    })
    .select(MEMORY_COLS)
    .single();

  throwIfError(error, "Failed to save memory.");
  return data as SakhiMemoryRow;
}

export async function getSakhiMemory(
  ownerId: string,
  key: string
): Promise<SakhiMemoryRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("sakhi_memory")
    .select(MEMORY_COLS)
    .eq("owner_id", ownerId)
    .eq("key", key)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve memory.");
  return data as SakhiMemoryRow | null;
}

export async function listSakhiMemory(
  ownerId: string,
  opts: { includeSensitive?: boolean } = {}
): Promise<SakhiMemoryRow[]> {
  let query = getSupabaseServer()
    .from("sakhi_memory")
    .select(MEMORY_COLS)
    .eq("owner_id", ownerId);
  if (!opts.includeSensitive) {
    query = query.eq("sensitive", false);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });
  throwIfError(error, "Failed to list memory.");
  return (data || []) as SakhiMemoryRow[];
}

export async function deleteSakhiMemory(
  ownerId: string,
  key: string
): Promise<boolean> {
  const { error } = await getSupabaseServer()
    .from("sakhi_memory")
    .delete()
    .eq("owner_id", ownerId)
    .eq("key", key);
  if (error) return false;
  return true;
}

/** Server-internal lookup by key (owner resolved from the stored row). */
export async function getSakhiMemoryByKey(
  key: string
): Promise<SakhiMemoryRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("sakhi_memory")
    .select(MEMORY_COLS)
    .eq("key", key)
    .maybeSingle();
  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to retrieve memory.");
  return data as SakhiMemoryRow | null;
}

// ---------------------------------------------------------------------------
// Conversation pinning + controlled sharing (no schema migration required;
// state lives in the owner-scoped sakhi_memory table).
// ---------------------------------------------------------------------------

const PIN_PREFIX = "convo.pinned.";
const SHARE_PREFIX = "convo.share.";

export async function setConversationPinned(
  ownerId: string,
  conversationId: string,
  pinned: boolean
): Promise<boolean> {
  const key = PIN_PREFIX + conversationId;
  if (pinned) {
    await saveSakhiMemory({
      ownerId,
      key,
      value: "1",
      kind: "preference",
      sensitive: false,
    });
    return true;
  }
  return deleteSakhiMemory(ownerId, key);
}

export async function listConversationPins(
  ownerId: string
): Promise<Record<string, boolean>> {
  const rows = await listSakhiMemory(ownerId);
  const out: Record<string, boolean> = {};
  for (const row of rows) {
    if (row.key.startsWith(PIN_PREFIX)) {
      out[row.key.slice(PIN_PREFIX.length)] = row.value === "1";
    }
  }
  return out;
}

export async function createConversationShare(input: {
  ownerId: string;
  conversationId: string;
  token: string;
  expiresAt: string;
}): Promise<boolean> {
  await saveSakhiMemory({
    ownerId: input.ownerId,
    key: SHARE_PREFIX + input.token,
    value: JSON.stringify({
      conversationId: input.conversationId,
      expiresAt: input.expiresAt,
    }),
    kind: "share",
    sensitive: true,
  });
  return true;
}

/** Resolve a share token to (ownerId, conversationId, expiresAt). */
export async function resolveConversationShare(
  token: string
): Promise<{
  ownerId: string;
  conversationId: string;
  expiresAt: string;
} | null> {
  const row = await getSakhiMemoryByKey(SHARE_PREFIX + token);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value || "{}") as {
      conversationId?: string;
      expiresAt?: string;
    };
    if (!parsed.conversationId || !parsed.expiresAt) return null;
    return {
      ownerId: row.owner_id,
      conversationId: parsed.conversationId,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function revokeConversationShares(
  ownerId: string,
  conversationId: string
): Promise<boolean> {
  const rows = await listSakhiMemory(ownerId, { includeSensitive: true });
  let ok = true;
  for (const row of rows) {
    if (!row.key.startsWith(SHARE_PREFIX)) continue;
    try {
      const parsed = JSON.parse(row.value || "{}") as { conversationId?: string };
      if (parsed.conversationId === conversationId) {
        if (!(await deleteSakhiMemory(ownerId, row.key))) ok = false;
      }
    } catch { /* skip malformed */ }
  }
  return ok;
}