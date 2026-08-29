import type { z } from "zod";
import { AppError } from "$lib/server/core/errors";
import { withCache, invalidateCache } from "$lib/server/cache";
import {
  TABLES,
  envelope,
  SCHEMA_VERSION,
  AttendanceRecordSchema,
  type AttendanceRecord,
  type RowOf,
  type TableName,
} from "./schemas";
import {
  readDoc,
  readVersion,
  writeDocIf,
  listQueueIds,
  deleteQueueDoc,
  type DocKind,
} from "./store";

/**
 * The data-layer contract (API-SPEC §1-3, storage format revised by
 * SUPABASE-MIGRATION-SPEC): every table read goes through getTable(), every
 * table write through mutate(). One JSONB envelope document per table,
 * version-CAS conditional writes. The attendance queue is split per event
 * (getQueue/mutateQueue).
 */

const TTL_TABLE_MS = 300_000;
const TABLE_ATTEMPTS = 5;
const QUEUE_ATTEMPTS = 10; // check-in bursts contend on one document

let backoffBaseMs = 50;

const tableKey = (name: TableName) => name;
const queueKey = (eventId: string) => eventId;

// Conditional-GET memory: last known version + parsed rows per document.
const versionCache = new Map<string, { version: number; rows: unknown[] }>();
const versionCacheKey = (kind: DocKind, key: string) => `${kind}:${key}`;

function decode<S extends z.ZodTypeAny>(schema: S, doc: unknown): z.infer<S>[] {
  const parsed = envelope(schema).safeParse(doc);
  if (!parsed.success) {
    // A silent fallback here would corrupt data on the next write — fail loudly.
    throw new Error(`table envelope validation failed: ${parsed.error.message}`);
  }
  return parsed.data.rows;
}

async function fetchRows<S extends z.ZodTypeAny>(
  kind: DocKind,
  key: string,
  schema: S,
): Promise<z.infer<S>[]> {
  const cacheKey = versionCacheKey(kind, key);
  const known = versionCache.get(cacheKey);
  const version = await readVersion(kind, key);
  if (version === null) {
    // Deleted (or never created) — distinct from "unchanged" (review R1-4).
    versionCache.delete(cacheKey);
    return [];
  }
  if (known && version === known.version) return known.rows as z.infer<S>[];
  const stored = await readDoc(kind, key);
  if (!stored) {
    versionCache.delete(cacheKey);
    return [];
  }
  const rows = decode(schema, stored.doc);
  versionCache.set(cacheKey, { version: stored.version, rows });
  return rows;
}

async function mutateObject<S extends z.ZodTypeAny>(
  kind: DocKind,
  key: string,
  schema: S,
  fn: (rows: z.infer<S>[]) => z.infer<S>[] | Promise<z.infer<S>[]>,
  maxAttempts: number,
  cacheKeyToInvalidate: string,
): Promise<z.infer<S>[]> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Always read the store directly (never the cache) so the version matches the doc.
    const stored = await readDoc(kind, key);
    const rows = stored ? decode(schema, stored.doc) : ([] as z.infer<S>[]);
    const next = await fn(structuredClone(rows));
    if (JSON.stringify(next) === JSON.stringify(rows)) return next; // no-op: skip the write

    // Write-side schema gate (review C1): reads validate strictly, so an
    // invalid write would BRICK the table for every future read AND repair
    // attempt. Refuse it here instead — the caller gets VALIDATION_FAILED.
    const checked = envelope(schema).safeParse(
      JSON.parse(JSON.stringify({ schemaVersion: SCHEMA_VERSION, rows: next })),
    );
    if (!checked.success) {
      console.error(`[data] refusing invalid write to ${kind}/${key}:`, checked.error.message);
      throw new AppError("VALIDATION_FAILED");
    }

    const written = await writeDocIf(
      kind,
      key,
      { schemaVersion: SCHEMA_VERSION, rows: next },
      stored ? stored.version : null,
    );
    if (written) {
      versionCache.set(versionCacheKey(kind, key), {
        version: stored ? stored.version + 1 : 1,
        rows: next,
      });
      await invalidateCache(cacheKeyToInvalidate);
      return next;
    }
    // CAS lost — back off and retry against a fresh read.
    const backoff = backoffBaseMs * 2 ** attempt + Math.random() * backoffBaseMs;
    await new Promise((r) => setTimeout(r, backoff));
  }
  throw new AppError("WRITE_CONFLICT");
}

// ---- tables ----------------------------------------------------------------

export async function getTable<N extends TableName>(name: N): Promise<RowOf<N>[]> {
  return withCache(`table_${name}`, TTL_TABLE_MS, () =>
    fetchRows("table", tableKey(name), TABLES[name]),
  ) as Promise<RowOf<N>[]>;
}

export async function mutate<N extends TableName>(
  name: N,
  fn: (rows: RowOf<N>[]) => RowOf<N>[] | Promise<RowOf<N>[]>,
): Promise<RowOf<N>[]> {
  return mutateObject(
    "table",
    tableKey(name),
    TABLES[name],
    fn as (rows: unknown[]) => unknown[],
    TABLE_ATTEMPTS,
    `table_${name}`,
  ) as Promise<RowOf<N>[]>;
}

// ---- attendance queue (per-event documents) ---------------------------------

const queueCacheKey = (eventId: string) => `table_attendance-queue_${eventId}`;

export async function getQueue(eventId: string): Promise<AttendanceRecord[]> {
  return withCache(queueCacheKey(eventId), TTL_TABLE_MS, () =>
    fetchRows("queue", queueKey(eventId), AttendanceRecordSchema),
  );
}

export async function mutateQueue(
  eventId: string,
  fn: (rows: AttendanceRecord[]) => AttendanceRecord[] | Promise<AttendanceRecord[]>,
): Promise<AttendanceRecord[]> {
  return mutateObject(
    "queue",
    queueKey(eventId),
    AttendanceRecordSchema,
    fn,
    QUEUE_ATTEMPTS,
    queueCacheKey(eventId),
  );
}

/** deleteEvent only — refuse elsewhere. */
export async function deleteQueue(eventId: string): Promise<void> {
  await deleteQueueDoc(eventId);
  versionCache.delete(versionCacheKey("queue", queueKey(eventId)));
  await invalidateCache(queueCacheKey(eventId));
}

export async function listQueues(): Promise<{ eventId: string; rows: AttendanceRecord[] }[]> {
  const eventIds = await listQueueIds();
  return Promise.all(
    eventIds.map(async (eventId) => ({ eventId, rows: await getQueue(eventId) })),
  );
}

export async function listPendingQueues(): Promise<
  { eventId: string; rows: AttendanceRecord[] }[]
> {
  const all = await listQueues();
  return all
    .map(({ eventId, rows }) => ({
      eventId,
      rows: rows.filter((r) => r.status === "pending"),
    }))
    .filter(({ rows }) => rows.length > 0);
}

// ---- test hooks (no production callers) ------------------------------------

export function _resetDataLayerForTests(opts?: { backoffBaseMs?: number }): void {
  versionCache.clear();
  backoffBaseMs = opts?.backoffBaseMs ?? 50;
}
