/**
 * In-memory stand-in for ./storage: the DATA_BACKEND=memory dev backend and
 * the module vitest swaps in via vi.mock (same pattern as store-memory.ts).
 * Three virtual buckets keyed as `bucket/path`.
 */

type StoredObject = { bytes: number; contentType: string; createdAt: string };

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

export async function listStaged(
  prefix: string,
): Promise<{ name: string; createdAt: string }[]> {
  const out: { name: string; createdAt: string }[] = [];
  for (const [key, obj] of objects) {
    if (!key.startsWith(`${STAGING}/`)) continue;
    const path = key.slice(STAGING.length + 1);
    if (path.startsWith(prefix)) out.push({ name: path, createdAt: obj.createdAt });
  }
  return out;
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
  const out: { name: string; createdAt: string }[] = [];
  for (const [key, obj] of objects) {
    if (!key.startsWith(`${BACKUPS}/`)) continue;
    const path = key.slice(BACKUPS.length + 1);
    if (path.startsWith(prefix)) out.push({ name: path, createdAt: obj.createdAt });
  }
  return out;
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
): void {
  objects.set(keyOf(STAGING, path), { bytes: size, contentType, createdAt });
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
