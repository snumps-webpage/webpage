/**
 * In-process Postgres (PGlite) stand-in for ./store — used by the data-layer
 * tests AND as the DATA_BACKEND=memory backend (local dev, scripts/measure).
 *
 * It runs the SAME migration files as Supabase (supabase/migrations/*.sql),
 * so the multi-document flow functions (docs/spec/ATOMIC-FLOWS.md) execute
 * here exactly as they do in production — one implementation, tested.
 * Data lives in memory and vanishes with the process.
 *
 * Test controls keep their old synchronous signatures: `__reset()` and
 * `__putRawDoc()` queue their work, and every store call waits for the queue
 * first, so `beforeEach(() => { __reset(); … })` still orders correctly.
 */

import type { PGlite } from "@electric-sql/pglite";
import type { AuditRow, DocKind, StoredDoc } from "./store";
import { freshDatabase } from "./pglite-bootstrap";
import { TABLE_NAMES } from "./schemas";

const MIGRATIONS = import.meta.glob("/supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

let db: PGlite | null = null;
/** Every store call awaits this first — init, resets and raw puts queue on it. */
let pending: Promise<unknown> = Promise.resolve();
let alwaysConflict = false;
/** Simulates an unreachable data layer — the failure mode the app must survive. */
let readsFail = false;
/** The same, for conditional writes (an outage that starts mid-request). */
let writesFail = false;
let maxJitterMs = 3;

let opening: Promise<PGlite> | null = null;

/**
 * Tests start from the snapshot pglite-snapshot.setup.ts built once per run
 * (initdb is the slow part); everything else — the dev server, the
 * measurement harness — builds a fresh database from the migrations.
 */
function database(): Promise<PGlite> {
  if (db) return Promise.resolve(db);
  opening ??= (async () => {
    const snapshot = process.env.PGLITE_SNAPSHOT;
    if (snapshot) {
      const [{ PGlite }, { readFile }] = await Promise.all([
        import("@electric-sql/pglite"),
        import("node:fs/promises"),
      ]);
      const instance = new PGlite({
        loadDataDir: new Blob([await readFile(snapshot)]),
      });
      await instance.waitReady;
      return instance;
    }
    return freshDatabase((f) => MIGRATIONS[f], Object.keys(MIGRATIONS));
  })().then((instance) => (db = instance));
  return opening;
}

/** Waits for queued controls, then hands out the database. */
async function ready(): Promise<PGlite> {
  await pending;
  return database();
}

function enqueue(work: (db: PGlite) => Promise<unknown>): Promise<void> {
  const next = pending.then(async () => work(await database()));
  // A failing control must not poison every later call.
  pending = next.catch(() => undefined);
  return next.then(() => undefined);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * maxJitterMs);

const TABLE_OF = { table: "app_tables", queue: "app_queues" } as const;
const PK_OF = { table: "name", queue: "event_id" } as const;

export async function readDoc(
  kind: DocKind,
  key: string,
): Promise<StoredDoc | null> {
  const pg = await ready();
  await jitter();
  if (readsFail) throw new Error("memory store: reads disabled for this test");
  const { rows } = await pg.query<{ doc: unknown; version: number }>(
    `select doc, version::int as version from ${TABLE_OF[kind]} where ${PK_OF[kind]} = $1`,
    [key],
  );
  return rows[0] ? { doc: rows[0].doc, version: rows[0].version } : null;
}

export async function readVersion(
  kind: DocKind,
  key: string,
): Promise<number | null> {
  const pg = await ready();
  await jitter();
  if (readsFail) throw new Error("memory store: reads disabled for this test");
  const { rows } = await pg.query<{ version: number }>(
    `select version::int as version from ${TABLE_OF[kind]} where ${PK_OF[kind]} = $1`,
    [key],
  );
  return rows[0]?.version ?? null;
}

export async function writeDocIf(
  kind: DocKind,
  key: string,
  doc: unknown,
  expectedVersion: number | null,
): Promise<boolean> {
  const pg = await ready();
  await jitter();
  if (writesFail)
    throw new Error("memory store: writes disabled for this test");
  if (alwaysConflict) return false;
  const json = JSON.stringify(doc);
  if (expectedVersion === null) {
    // CREATE: someone inserting first means we lost the race.
    const res = await pg.query(
      `insert into ${TABLE_OF[kind]} (${PK_OF[kind]}, version, doc)
         values ($1, 1, $2::jsonb) on conflict do nothing`,
      [key, json],
    );
    return (res.affectedRows ?? 0) > 0;
  }
  const res = await pg.query(
    `update ${TABLE_OF[kind]} set doc = $2::jsonb, version = version + 1
      where ${PK_OF[kind]} = $1 and version = $3`,
    [key, json, expectedVersion],
  );
  return (res.affectedRows ?? 0) > 0; // 0 rows → CAS lost
}

export async function listQueueIds(): Promise<string[]> {
  const pg = await ready();
  if (readsFail) throw new Error("memory store: reads disabled for this test");
  const { rows } = await pg.query<{ event_id: string }>(
    `select event_id from app_queues order by event_id`,
  );
  return rows.map((r) => r.event_id);
}

export async function insertAuditRow(row: AuditRow): Promise<void> {
  const pg = await ready();
  await pg.query(
    `insert into audit_log (id, at, actor, action, target_tb, target_id, detail)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      row.id,
      row.at,
      row.actor,
      row.action,
      row.target_tb,
      row.target_id,
      row.detail === null ? null : JSON.stringify(row.detail),
    ],
  );
}

// ---- flow write check (tests) -----------------------------------------------
//
// callFlow invalidates the caches of what a flow REPORTS writing, and each
// flow builds that list by hand (audit LA32-2). With the check on, a trigger
// records every document the flow's transaction changes, and the call fails
// — rolled back — when one is missing from `touched`/`touchedQueues`, or when
// `touched` names a table that does not exist. Over-reporting is allowed: it
// only drops a cache that was still good.

let checkFlowWrites = false;
let flowWriteLog: Promise<unknown> | null = null;

const FLOW_WRITE_LOG_SQL = `
  create table if not exists _flow_writes (kind text not null, key text not null);
  create or replace function _flow_write_logged() returns trigger
  language plpgsql as $$
  begin
    if current_setting('app.flow_write_log', true) is distinct from 'on' then
      return null;
    end if;
    -- app_lock's empty placeholder for a missing document: readers see "no
    -- document" and "no rows" alike, so it changes nothing a cache holds
    if tg_op = 'INSERT' and new.doc -> 'rows' = '[]'::jsonb then
      return null;
    end if;
    insert into _flow_writes
      values (tg_argv[0], coalesce(to_jsonb(new), to_jsonb(old)) ->> tg_argv[1]);
    return null;
  end $$;
  drop trigger if exists _flow_write_logged on app_tables;
  create trigger _flow_write_logged after insert or update or delete on app_tables
    for each row execute function _flow_write_logged('table', 'name');
  drop trigger if exists _flow_write_logged on app_queues;
  create trigger _flow_write_logged after insert or update or delete on app_queues
    for each row execute function _flow_write_logged('queue', 'event_id');`;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function unreportedWrites(
  fn: string,
  out: unknown,
  wrote: { kind: string; key: string }[],
): string | null {
  const result = (out ?? {}) as { touched?: unknown; touchedQueues?: unknown };
  const touched = new Set(strings(result.touched));
  const touchedQueues = new Set(strings(result.touchedQueues));
  const known = new Set<string>(TABLE_NAMES);
  const problems = new Set<string>();
  for (const name of touched)
    if (!known.has(name)) problems.add(`reports unknown table "${name}"`);
  for (const { kind, key } of wrote) {
    if (kind === "table" && !touched.has(key))
      problems.add(`wrote table "${key}" but left it out of touched`);
    if (kind === "queue" && !touchedQueues.has(key))
      problems.add(`wrote queue "${key}" but left it out of touchedQueues`);
  }
  return problems.size ? `${fn}: ${[...problems].join("; ")}` : null;
}

async function callChecked<T>(pg: PGlite, fn: string, json: string) {
  flowWriteLog ??= pg.exec(FLOW_WRITE_LOG_SQL);
  await flowWriteLog;
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('app.flow_write_log', 'on', true)`);
    const { rows } = await tx.query<{ out: T }>(
      `select ${fn}($1::jsonb) as out`,
      [json],
    );
    const { rows: wrote } = await tx.query<{ kind: string; key: string }>(
      `delete from _flow_writes returning kind, key`,
    );
    const problem = unreportedWrites(fn, rows[0].out, wrote);
    if (problem) throw new Error(problem); // rolls the flow back
    return rows[0].out;
  });
}

/** Calls a flow function `fn(p jsonb) returns jsonb` (ATOMIC-FLOWS.md). */
export async function rpc<T>(fn: string, args: unknown): Promise<T> {
  if (!/^flow_[a-z0-9_]+$/.test(fn)) throw new Error(`rpc: bad name ${fn}`);
  const pg = await ready();
  await jitter();
  const json = JSON.stringify(args ?? {});
  try {
    if (checkFlowWrites) return await callChecked<T>(pg, fn, json);
    const { rows } = await pg.query<{ out: T }>(
      `select ${fn}($1::jsonb) as out`,
      [json],
    );
    return rows[0].out;
  } catch (e) {
    // the same shape store.ts gives a PostgREST error: message + DETAIL
    const detail = (e as { detail?: string }).detail;
    throw Object.assign(new Error(e instanceof Error ? e.message : String(e)), {
      detail: detail || undefined,
    });
  }
}

// ---- test controls ----------------------------------------------------------

export function __reset(): Promise<void> {
  alwaysConflict = false;
  readsFail = false;
  writesFail = false;
  maxJitterMs = 3;
  return enqueue(async (pg) => {
    // audit_log is append-only by trigger — clear it underneath the trigger.
    await pg.exec(`
      truncate app_tables, app_queues;
      alter table audit_log disable trigger audit_log_immutable;
      delete from audit_log;
      alter table audit_log enable trigger audit_log_immutable;`);
  });
}

export function __setReadsFail(v: boolean): void {
  readsFail = v;
}

/**
 * Checks every flow's reported writes against its real ones (see above).
 * Not cleared by __reset: pglite-warmup.setup.ts turns it on for all tests.
 */
export function __checkFlowWrites(on: boolean): void {
  checkFlowWrites = on;
}

export function __setWritesFail(v: boolean): void {
  writesFail = v;
}

export function __setAlwaysConflict(v: boolean): void {
  alwaysConflict = v;
}

/** Puts a document as-is (no validation) and bumps its version. */
export function __putRawDoc(
  kind: DocKind,
  key: string,
  doc: unknown,
): Promise<void> {
  return enqueue((pg) =>
    pg.query(
      `insert into ${TABLE_OF[kind]} (${PK_OF[kind]}, version, doc)
         values ($1, 1, $2::jsonb)
       on conflict (${PK_OF[kind]}) do update
         set doc = excluded.doc, version = ${TABLE_OF[kind]}.version + 1`,
      [key, JSON.stringify(doc)],
    ),
  );
}

/** Opens the database now — a test setup warms it before any test's clock starts. */
export async function __ready(): Promise<void> {
  await ready();
}

/** Runs one query — for tests of the SQL helpers the flows are built on. */
export async function __sql<T>(text: string, params: unknown[] = []) {
  const pg = await ready();
  return (await pg.query<T>(text, params)).rows;
}

export async function __auditRows(): Promise<AuditRow[]> {
  const pg = await ready();
  const { rows } = await pg.query<AuditRow>(
    `select id, at::text as at, actor, action, target_tb, target_id, detail
       from audit_log order by at, id`,
  );
  return rows;
}

export async function __docs(
  kind: DocKind,
): Promise<Map<string, { doc: unknown; version: number }>> {
  const pg = await ready();
  const { rows } = await pg.query<{
    key: string;
    doc: unknown;
    version: number;
  }>(
    `select ${PK_OF[kind]} as key, doc, version::int as version from ${TABLE_OF[kind]}`,
  );
  return new Map(rows.map((r) => [r.key, { doc: r.doc, version: r.version }]));
}
