import { getSupabase, isMemoryBackend } from "./supabase";
import * as memory from "./store-memory";

/**
 * The document seam (SUPABASE-MIGRATION-SPEC §2-3): Postgres as a version-CAS
 * JSONB document store — a deliberate choice for this ~605-row scale; the
 * relational normalization is a separate milestone. One row per table
 * envelope (app_tables) / per-event attendance queue (app_queues), plus the
 * append-only audit_log. Everything above goes through tables.ts / audit.ts.
 *
 * DATA_BACKEND=memory delegates every call to ./store-memory — a runtime dev
 * backend, and the same module vitest swaps in via vi.mock.
 */

export type DocKind = "table" | "queue";

export interface StoredDoc {
  doc: unknown;
  version: number;
}

export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  target_tb: string;
  target_id: string;
  detail: Record<string, unknown> | null;
}

const TABLE_OF: Record<DocKind, "app_tables" | "app_queues"> = {
  table: "app_tables",
  queue: "app_queues",
};
const PK_OF: Record<DocKind, "name" | "event_id"> = {
  table: "name",
  queue: "event_id",
};

export async function readDoc(kind: DocKind, key: string): Promise<StoredDoc | null> {
  if (isMemoryBackend()) return memory.readDoc(kind, key);
  const { data, error } = await getSupabase()
    .from(TABLE_OF[kind])
    .select("doc, version")
    .eq(PK_OF[kind], key)
    .maybeSingle();
  if (error) throw new Error(`readDoc(${kind}, ${key}) failed: ${error.message}`);
  if (!data) return null;
  return { doc: data.doc, version: Number(data.version) };
}

export async function readVersion(kind: DocKind, key: string): Promise<number | null> {
  if (isMemoryBackend()) return memory.readVersion(kind, key);
  const { data, error } = await getSupabase()
    .from(TABLE_OF[kind])
    .select("version")
    .eq(PK_OF[kind], key)
    .maybeSingle();
  if (error) throw new Error(`readVersion(${kind}, ${key}) failed: ${error.message}`);
  return data ? Number(data.version) : null;
}

export async function writeDocIf(
  kind: DocKind,
  key: string,
  doc: unknown,
  expectedVersion: number | null,
): Promise<boolean> {
  if (isMemoryBackend()) return memory.writeDocIf(kind, key, doc, expectedVersion);
  const table = getSupabase().from(TABLE_OF[kind]);
  if (expectedVersion === null) {
    // CREATE: insert; a primary-key conflict (23505) means someone won the race.
    const { data, error } = await table
      .insert({ [PK_OF[kind]]: key, version: 1, doc })
      .select();
    if (error) {
      if (error.code === "23505") return false;
      throw new Error(`writeDocIf create(${kind}, ${key}) failed: ${error.message}`);
    }
    return (data?.length ?? 0) > 0;
  }
  // UPDATE with version CAS. PostgREST cannot express version=version+1, so the
  // client writes expectedVersion+1 — identical semantics under the WHERE guard.
  const { data, error } = await table
    .update({ doc, version: expectedVersion + 1 })
    .eq(PK_OF[kind], key)
    .eq("version", expectedVersion)
    .select();
  if (error) throw new Error(`writeDocIf update(${kind}, ${key}) failed: ${error.message}`);
  return (data?.length ?? 0) > 0; // 0 rows → CAS lost
}

export async function listQueueIds(): Promise<string[]> {
  if (isMemoryBackend()) return memory.listQueueIds();
  const { data, error } = await getSupabase().from("app_queues").select("event_id");
  if (error) throw new Error(`listQueueIds failed: ${error.message}`);
  return (data ?? []).map((r: { event_id: string }) => r.event_id);
}

export async function deleteQueueDoc(eventId: string): Promise<void> {
  if (isMemoryBackend()) return memory.deleteQueueDoc(eventId);
  const { error } = await getSupabase().from("app_queues").delete().eq("event_id", eventId);
  if (error) throw new Error(`deleteQueueDoc(${eventId}) failed: ${error.message}`);
}

export async function insertAuditRow(row: AuditRow): Promise<void> {
  if (isMemoryBackend()) return memory.insertAuditRow(row);
  const { error } = await getSupabase().from("audit_log").insert(row);
  if (error) throw new Error(`insertAuditRow(${row.action}) failed: ${error.message}`);
}
