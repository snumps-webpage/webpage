import { gzipSync, gunzipSync } from "node:zlib";
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
  ConditionalWriteError,
  dataBucket,
  deleteObject,
  getObjectWithEtag,
  listKeys,
  putObjectConditional,
} from "./s3";

/**
 * The data-layer contract (API-SPEC §1-3): every table read goes through
 * getTable(), every table write through mutate(). One JSON envelope per
 * table, gzip, versioned bucket, ETag conditional writes.
 * The attendance queue is split per event (getQueue/mutateQueue).
 */

const TTL_TABLE_MS = 300_000;
const TABLE_ATTEMPTS = 5;
const QUEUE_ATTEMPTS = 10; // check-in bursts contend on one object

let backoffBaseMs = 50;

const tableKey = (name: TableName) => `tables/${name}.json.gz`;
const queueKey = (eventId: string) => `tables/attendance-queue/${eventId}.json.gz`;
const QUEUE_PREFIX = "tables/attendance-queue/";

// Conditional-GET memory: last known ETag + parsed rows per object key.
const etagCache = new Map<string, { etag: string; rows: unknown[] }>();

function encode(rows: unknown[]): Uint8Array {
  return gzipSync(JSON.stringify({ schemaVersion: SCHEMA_VERSION, rows }));
}

function decode<S extends z.ZodTypeAny>(schema: S, body: Uint8Array): z.infer<S>[] {
  const parsed = envelope(schema).safeParse(JSON.parse(gunzipSync(body).toString("utf8")));
  if (!parsed.success) {
    // A silent fallback here would corrupt data on the next write — fail loudly.
    throw new Error(`table envelope validation failed: ${parsed.error.message}`);
  }
  return parsed.data.rows;
}

async function fetchRows<S extends z.ZodTypeAny>(key: string, schema: S): Promise<z.infer<S>[]> {
  const known = etagCache.get(key);
  const res = await getObjectWithEtag(dataBucket(), key, known?.etag);
  if (res.status === 304 && known) return known.rows as z.infer<S>[];
  if (res.status === 404) return [];
  if (res.status !== 200) return [];
  const rows = decode(schema, res.body);
  etagCache.set(key, { etag: res.etag, rows });
  return rows;
}

async function mutateObject<S extends z.ZodTypeAny>(
  key: string,
  schema: S,
  fn: (rows: z.infer<S>[]) => z.infer<S>[] | Promise<z.infer<S>[]>,
  maxAttempts: number,
  cacheKeyToInvalidate: string,
): Promise<z.infer<S>[]> {
  const bucket = dataBucket();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Always read S3 directly (never the cache) so the ETag matches the body.
    const res = await getObjectWithEtag(bucket, key);
    const exists = res.status === 200;
    const rows = exists ? decode(schema, res.body) : ([] as z.infer<S>[]);
    const next = await fn(structuredClone(rows));
    if (JSON.stringify(next) === JSON.stringify(rows)) return next; // no-op: skip the write

    try {
      const put = await putObjectConditional(bucket, key, encode(next), {
        ...(exists ? { ifMatch: res.etag } : { ifNoneMatch: "*" as const }),
        contentType: "application/json",
        contentEncoding: "gzip",
      });
      etagCache.set(key, { etag: put.etag, rows: next });
      await invalidateCache(cacheKeyToInvalidate);
      return next;
    } catch (e) {
      if (!(e instanceof ConditionalWriteError)) throw e;
      const backoff = backoffBaseMs * 2 ** attempt + Math.random() * backoffBaseMs;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new AppError("WRITE_CONFLICT");
}

// ---- tables ----------------------------------------------------------------

export async function getTable<N extends TableName>(name: N): Promise<RowOf<N>[]> {
  return withCache(`table_${name}`, TTL_TABLE_MS, () =>
    fetchRows(tableKey(name), TABLES[name]),
  ) as Promise<RowOf<N>[]>;
}

export async function mutate<N extends TableName>(
  name: N,
  fn: (rows: RowOf<N>[]) => RowOf<N>[] | Promise<RowOf<N>[]>,
): Promise<RowOf<N>[]> {
  return mutateObject(
    tableKey(name),
    TABLES[name],
    fn as (rows: unknown[]) => unknown[],
    TABLE_ATTEMPTS,
    `table_${name}`,
  ) as Promise<RowOf<N>[]>;
}

// ---- attendance queue (per-event objects) ----------------------------------

const queueCacheKey = (eventId: string) => `table_attendance-queue_${eventId}`;

export async function getQueue(eventId: string): Promise<AttendanceRecord[]> {
  return withCache(queueCacheKey(eventId), TTL_TABLE_MS, () =>
    fetchRows(queueKey(eventId), AttendanceRecordSchema),
  );
}

export async function mutateQueue(
  eventId: string,
  fn: (rows: AttendanceRecord[]) => AttendanceRecord[] | Promise<AttendanceRecord[]>,
): Promise<AttendanceRecord[]> {
  return mutateObject(
    queueKey(eventId),
    AttendanceRecordSchema,
    fn,
    QUEUE_ATTEMPTS,
    queueCacheKey(eventId),
  );
}

/** deleteEvent only — refuse elsewhere. */
export async function deleteQueue(eventId: string): Promise<void> {
  await deleteObject(dataBucket(), queueKey(eventId));
  etagCache.delete(queueKey(eventId));
  await invalidateCache(queueCacheKey(eventId));
}

export async function listQueues(): Promise<{ eventId: string; rows: AttendanceRecord[] }[]> {
  const keys = await listKeys(dataBucket(), QUEUE_PREFIX);
  const eventIds = keys
    .filter((k) => k.endsWith(".json.gz"))
    .map((k) => k.slice(QUEUE_PREFIX.length, -".json.gz".length));
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
  etagCache.clear();
  backoffBaseMs = opts?.backoffBaseMs ?? 50;
}
