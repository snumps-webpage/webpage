/**
 * In-memory stand-in for ./storage: the DATA_BACKEND=memory dev backend and
 * the module vitest swaps in via vi.mock (same pattern as store-memory.ts).
 * Three virtual buckets keyed as `bucket/path`.
 */

type StoredObject = { bytes: number; contentType: string; createdAt: string; head?: Uint8Array };

const objects = new Map<string, StoredObject>();
const issuedUrls = new Set<string>();

const STAGING = "staging";
const ASSETS = "assets";
const BACKUPS = "backups";

const keyOf = (bucket: string, path: string) => `${bucket}/${path}`;

export interface StagedObjectInfo {
  size: number;
  contentType: string;
}

/** Records the path as url-issued; a later __stage simulates the browser PUT. */
export async function createUploadUrl(
  path: string,
  expiresInSeconds?: number,
): Promise<string> {
  void expiresInSeconds; // ignored — parity with the real seam's fixed expiry
  issuedUrls.add(path);
  return `https://memory.test/upload/${path}`;
}

export async function stagedInfo(path: string): Promise<StagedObjectInfo | null> {
  const obj = objects.get(keyOf(STAGING, path));
  if (!obj) return null;
  return { size: obj.bytes, contentType: obj.contentType };
}

export async function promoteToAssets(
  stagingPath: string,
  assetPath: string,
): Promise<void> {
  const from = keyOf(STAGING, stagingPath);
  const obj = objects.get(from);
  if (!obj) throw new Error("NoSuchKey");
  objects.set(keyOf(ASSETS, assetPath), obj);
  objects.delete(from);
}

export async function copyToBackups(
  _sourceBucket: "assets",
  sourcePath: string,
  backupPath: string,
): Promise<void> {
  const obj = objects.get(keyOf(ASSETS, sourcePath));
  if (!obj) throw new Error("NoSuchKey");
  objects.set(keyOf(BACKUPS, backupPath), obj);
}

export async function removeStaged(paths: string[]): Promise<void> {
  for (const path of paths) objects.delete(keyOf(STAGING, path));
}

/**
 * Mirrors Supabase `.list(prefix)`: direct children only, names relative to
 * the prefix, sub-folders as rows with an empty timestamp (the real API gives
 * `created_at: null`), sorted by name. Service tests run against this, so it
 * must not be more capable than the real listing.
 */
function listLevel(bucket: string, prefix: string): { name: string; createdAt: string }[] {
  const base = prefix === "" ? "" : `${prefix.replace(/\/$/, "")}/`;
  const files: { name: string; createdAt: string }[] = [];
  const folders = new Set<string>();
  for (const [key, obj] of objects) {
    if (!key.startsWith(`${bucket}/`)) continue;
    const path = key.slice(bucket.length + 1);
    if (!path.startsWith(base)) continue;
    const rest = path.slice(base.length);
    const slash = rest.indexOf("/");
    if (slash === -1) files.push({ name: rest, createdAt: obj.createdAt });
    else folders.add(rest.slice(0, slash));
  }
  return [...[...folders].map((name) => ({ name, createdAt: "" })), ...files].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function listStaged(
  prefix: string,
): Promise<{ name: string; createdAt: string }[]> {
  return listLevel(STAGING, prefix);
}

export async function uploadToBackups(path: string, body: string): Promise<void> {
  objects.set(keyOf(BACKUPS, path), {
    bytes: body.length,
    contentType: "application/json",
    createdAt: new Date().toISOString(),
  });
}

export async function listBackups(
  prefix: string,
): Promise<{ name: string; createdAt: string }[]> {
  return listLevel(BACKUPS, prefix);
}

export async function removeBackups(paths: string[]): Promise<void> {
  for (const path of paths) objects.delete(keyOf(BACKUPS, path));
}

// ---- test controls ----
export function __reset(): void {
  objects.clear();
  issuedUrls.clear();
}

/** Simulates the browser's PUT to the signed upload URL. */
export function __stage(
  path: string,
  size: number,
  contentType: string,
  createdAt = new Date().toISOString(),
  head?: Uint8Array,
): void {
  objects.set(keyOf(STAGING, path), { bytes: size, contentType, createdAt, head });
}

/** Head bytes of a staged object (magic-byte verification in tests). */
export async function readStagedHead(path: string, _max: number): Promise<Uint8Array | null> {
  const obj = objects.get(keyOf(STAGING, path));
  if (!obj) return null;
  return obj.head ?? new Uint8Array();
}

export function __exists(bucket: string, path: string): boolean {
  return objects.has(keyOf(bucket, path));
}

/** Backdates an object (e.g. a seeded dump) for retention tests. */
export function __setCreatedAt(bucket: string, path: string, iso: string): void {
  const obj = objects.get(keyOf(bucket, path));
  if (obj) obj.createdAt = iso;
}

export function __list(bucket: string): string[] {
  const prefix = `${bucket}/`;
  return [...objects.keys()]
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}
