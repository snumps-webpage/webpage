/**
 * In-memory stand-in for ./s3 used by the data-layer tests (BE-15).
 * Same surface, ETag = content hash, optional latency jitter so concurrent
 * mutate loops actually interleave the way they would against real S3.
 * Never imported by production code.
 */

export class ConditionalWriteError extends Error {
  constructor(readonly httpStatus: number) {
    super(`conditional write failed (${httpStatus})`);
    this.name = "ConditionalWriteError";
  }
}

export type GetResult =
  | { status: 200; body: Uint8Array; etag: string }
  | { status: 304 }
  | { status: 404 };

const store = new Map<string, { body: Uint8Array; etag: string }>();
let alwaysConflict = false;
let maxJitterMs = 3;

function hash(body: Uint8Array): string {
  let h = 0;
  for (const b of body) h = (h * 31 + b) | 0;
  return `"${(h >>> 0).toString(16)}-${body.length}"`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * maxJitterMs);

export function dataBucket(): string {
  return "test-bucket";
}

export function assetsBucket(): string {
  return "test-assets";
}

const contentTypes = new Map<string, string>();

export async function headObject(
  _bucket: string,
  key: string,
): Promise<{ contentLength: number; contentType: string } | null> {
  const obj = store.get(key);
  if (!obj) return null;
  return {
    contentLength: obj.body.length,
    contentType: contentTypes.get(key) ?? "application/octet-stream",
  };
}

export async function copyObject(
  _bucket: string,
  fromKey: string,
  toKey: string,
): Promise<void> {
  const obj = store.get(fromKey);
  if (!obj) throw new Error("NoSuchKey");
  store.set(toKey, obj);
  const ct = contentTypes.get(fromKey);
  if (ct) contentTypes.set(toKey, ct);
}

export async function presignPut(
  _bucket: string,
  key: string,
  contentType: string,
): Promise<string> {
  contentTypes.set(key, contentType); // remember what the upload will claim
  return `https://example.test/presigned/${encodeURIComponent(key)}`;
}

/** Simulates the browser's PUT to the presigned URL. */
export function __uploadPending(key: string, bytes: number, contentType?: string): void {
  store.set(key, { body: new Uint8Array(bytes), etag: `"up-${bytes}"` });
  if (contentType) contentTypes.set(key, contentType);
}

export async function getObjectWithEtag(
  _bucket: string,
  key: string,
  ifNoneMatch?: string,
): Promise<GetResult> {
  await jitter();
  const obj = store.get(key);
  if (!obj) return { status: 404 };
  if (ifNoneMatch && ifNoneMatch === obj.etag) return { status: 304 };
  return { status: 200, body: obj.body, etag: obj.etag };
}

export async function putObjectConditional(
  _bucket: string,
  key: string,
  body: Uint8Array,
  opts: { ifMatch?: string; ifNoneMatch?: "*" },
): Promise<{ etag: string }> {
  await jitter();
  if (alwaysConflict) throw new ConditionalWriteError(409);
  const current = store.get(key);
  if (opts.ifNoneMatch === "*" && current) throw new ConditionalWriteError(412);
  if (opts.ifMatch !== undefined) {
    if (!current) throw new ConditionalWriteError(404);
    if (current.etag !== opts.ifMatch) throw new ConditionalWriteError(412);
  }
  const etag = hash(body);
  store.set(key, { body, etag });
  return { etag };
}

export async function deleteObject(_bucket: string, key: string): Promise<void> {
  store.delete(key);
}

export async function listKeys(_bucket: string, prefix: string): Promise<string[]> {
  return [...store.keys()].filter((k) => k.startsWith(prefix));
}

export async function putObject(
  _bucket: string,
  key: string,
  body: Uint8Array,
): Promise<void> {
  store.set(key, { body, etag: hash(body) });
}

// ---- test controls ----
export function __reset(): void {
  store.clear();
  contentTypes.clear();
  alwaysConflict = false;
  maxJitterMs = 3;
}
export function __setAlwaysConflict(v: boolean): void {
  alwaysConflict = v;
}
export function __putRaw(key: string, body: Uint8Array): void {
  store.set(key, { body, etag: hash(body) });
}
export function __keys(): string[] {
  return [...store.keys()];
}
