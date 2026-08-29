/**
 * In-memory stand-in for ./store — used by the data-layer tests AND as the
 * DATA_BACKEND=memory dev backend (SUPABASE-MIGRATION-SPEC §2-4, S4).
 * Same surface, version-CAS over Maps, optional latency jitter so concurrent
 * mutate loops actually interleave the way they would against Postgres.
 */

import type { AuditRow, DocKind, StoredDoc } from "./store";

const tableDocs = new Map<string, { doc: unknown; version: number }>();
const queueDocs = new Map<string, { doc: unknown; version: number }>();
const auditRows: AuditRow[] = [];
let alwaysConflict = false;
let maxJitterMs = 3;

const docsOf = (kind: DocKind) => (kind === "table" ? tableDocs : queueDocs);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * maxJitterMs);

export async function readDoc(kind: DocKind, key: string): Promise<StoredDoc | null> {
  await jitter();
  const entry = docsOf(kind).get(key);
  if (!entry) return null;
  return { doc: structuredClone(entry.doc), version: entry.version };
}

export async function readVersion(kind: DocKind, key: string): Promise<number | null> {
  await jitter();
  return docsOf(kind).get(key)?.version ?? null;
}

export async function writeDocIf(
  kind: DocKind,
  key: string,
  doc: unknown,
  expectedVersion: number | null,
): Promise<boolean> {
  await jitter();
  if (alwaysConflict) return false;
  const docs = docsOf(kind);
  const current = docs.get(key);
  if (expectedVersion === null) {
    if (current) return false; // create lost: someone inserted first
    docs.set(key, { doc: structuredClone(doc), version: 1 });
    return true;
  }
  if (!current || current.version !== expectedVersion) return false; // CAS lost
  docs.set(key, { doc: structuredClone(doc), version: expectedVersion + 1 });
  return true;
}

export async function listQueueIds(): Promise<string[]> {
  return [...queueDocs.keys()];
}

export async function deleteQueueDoc(eventId: string): Promise<void> {
  queueDocs.delete(eventId);
}

export async function insertAuditRow(row: AuditRow): Promise<void> {
  auditRows.push(structuredClone(row));
}

// ---- test controls ----
export function __reset(): void {
  tableDocs.clear();
  queueDocs.clear();
  auditRows.length = 0;
  alwaysConflict = false;
  maxJitterMs = 3;
}
export function __setAlwaysConflict(v: boolean): void {
  alwaysConflict = v;
}
export function __putRawDoc(kind: DocKind, key: string, doc: unknown): void {
  const docs = docsOf(kind);
  const current = docs.get(key);
  docs.set(key, { doc: structuredClone(doc), version: (current?.version ?? 0) + 1 });
}
export function __auditRows(): AuditRow[] {
  return [...auditRows];
}
export function __docs(kind: DocKind): Map<string, { doc: unknown; version: number }> {
  return docsOf(kind);
}
