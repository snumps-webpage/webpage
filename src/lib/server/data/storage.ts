import { env } from "$env/dynamic/private";
import { getSupabase, isMemoryBackend } from "./supabase";
import * as memory from "./storage-memory";

/**
 * The asset-storage seam (SUPABASE-MIGRATION-SPEC §4): Supabase Storage with
 * three buckets — private `staging` for pending uploads, public `assets` for
 * promoted files, private `backups` for the B3 asset mirror (§7). The ONLY
 * module that touches supabase.storage for uploads; everything above goes
 * through services/uploads.ts.
 *
 * DATA_BACKEND=memory delegates every call to ./storage-memory — a runtime dev
 * backend, and the same module vitest swaps in via vi.mock (same pattern as
 * store.ts).
 */

export interface StagedObjectInfo {
  size: number;
  contentType: string;
}

function stagingBucket(): string {
  return env.SUPABASE_STAGING_BUCKET || "staging";
}

function assetsBucket(): string {
  return env.SUPABASE_ASSETS_BUCKET || "assets";
}

function backupsBucket(): string {
  return env.SUPABASE_BACKUPS_BUCKET || "backups";
}

type StorageErrorLike = {
  message: string;
  status?: number;
  statusCode?: string;
  code?: string;
};

function isNotFound(error: StorageErrorLike): boolean {
  return (
    error.status === 404 ||
    error.statusCode === "404" ||
    error.code === "NoSuchKey" ||
    error.code === "not_found" ||
    /not.?found/i.test(error.message)
  );
}

/**
 * Signed upload URL into the STAGING bucket.
 *
 * NOTE (spec §4-2): Supabase signed-upload expiry is FIXED at ~2 hours and
 * not configurable — `expiresInSeconds` is accepted for signature parity with
 * the old presigner and IGNORED. Content-Type is NOT signed either; the
 * promotion step is the enforcement point.
 */
export async function createUploadUrl(
  path: string,
  expiresInSeconds?: number,
): Promise<string> {
  if (isMemoryBackend()) return memory.createUploadUrl(path, expiresInSeconds);
  void expiresInSeconds; // fixed ~2h expiry — see note above
  const { data, error } = await getSupabase()
    .storage.from(stagingBucket())
    .createSignedUploadUrl(path);
  if (error) throw new Error(`createUploadUrl(${path}) failed: ${error.message}`);
  return data.signedUrl;
}

/** HeadObject replacement: staging `.info(path)` — null when the object is missing. */
export async function stagedInfo(path: string): Promise<StagedObjectInfo | null> {
  if (isMemoryBackend()) return memory.stagedInfo(path);
  const { data, error } = await getSupabase().storage.from(stagingBucket()).info(path);
  if (error) {
    if (isNotFound(error)) return null; // never uploaded or already reaped
    throw new Error(`stagedInfo(${path}) failed: ${error.message}`);
  }
  return {
    size: data.size ?? 0,
    contentType: data.contentType ?? "application/octet-stream",
  };
}

/**
 * 스테이징 객체의 앞부분 바이트 — 매직 바이트(파일 시그니처) 검증용.
 * Content-Type은 브라우저가 서명 없이 보내므로 신뢰 불가 → 실제 바이트로 확인.
 * Supabase JS는 range download가 없어 전체를 받아 앞부분만 취한다(포스터 ≤15MB).
 */
export async function readStagedHead(path: string, maxBytes: number): Promise<Uint8Array | null> {
  if (isMemoryBackend()) return memory.readStagedHead(path, maxBytes);
  const { data, error } = await getSupabase().storage.from(stagingBucket()).download(path);
  if (error) {
    if (isNotFound(error)) return null;
    throw new Error(`readStagedHead(${path}) failed: ${error.message}`);
  }
  const buf = new Uint8Array(await data.arrayBuffer());
  return buf.subarray(0, maxBytes);
}

/**
 * Cross-bucket move staging → assets. Supabase does not claim atomicity here
 * (spec §4-2); leftovers from a failed move are the cleanup job's problem.
 */
export async function promoteToAssets(
  stagingPath: string,
  assetPath: string,
): Promise<void> {
  if (isMemoryBackend()) return memory.promoteToAssets(stagingPath, assetPath);
  const { error } = await getSupabase()
    .storage.from(stagingBucket())
    .move(stagingPath, assetPath, { destinationBucket: assetsBucket() });
  if (error) {
    throw new Error(`promoteToAssets(${stagingPath} → ${assetPath}) failed: ${error.message}`);
  }
}

/** B3 asset mirror (spec §7): copy a promoted asset into the private backups bucket. */
export async function copyToBackups(
  sourceBucket: "assets",
  sourcePath: string,
  backupPath: string,
): Promise<void> {
  if (isMemoryBackend()) return memory.copyToBackups(sourceBucket, sourcePath, backupPath);
  const { error } = await getSupabase()
    .storage.from(assetsBucket())
    .copy(sourcePath, backupPath, { destinationBucket: backupsBucket() });
  if (error) {
    throw new Error(`copyToBackups(${sourcePath} → ${backupPath}) failed: ${error.message}`);
  }
}

export async function removeStaged(paths: string[]): Promise<void> {
  if (isMemoryBackend()) return memory.removeStaged(paths);
  if (paths.length === 0) return;
  const { error } = await getSupabase().storage.from(stagingBucket()).remove(paths);
  if (error) throw new Error(`removeStaged(${paths.length} paths) failed: ${error.message}`);
}

export async function listStaged(
  prefix: string,
): Promise<{ name: string; createdAt: string }[]> {
  if (isMemoryBackend()) return memory.listStaged(prefix);
  const { data, error } = await getSupabase()
    .storage.from(stagingBucket())
    .list(prefix, { limit: 1000 });
  if (error) throw new Error(`listStaged(${prefix}) failed: ${error.message}`);
  // created_at is null on folder placeholder rows — surface those as "".
  return (data ?? []).map((f) => ({ name: f.name, createdAt: f.created_at ?? "" }));
}

// ---- backups bucket (B1 weekly dumps, spec §7 — used by services/maintenance) --

/** B1 dump writer: upload a JSON body into the private backups bucket. */
export async function uploadToBackups(path: string, body: string): Promise<void> {
  if (isMemoryBackend()) return memory.uploadToBackups(path, body);
  const { error } = await getSupabase()
    .storage.from(backupsBucket())
    .upload(path, body, { contentType: "application/json", upsert: true });
  if (error) throw new Error(`uploadToBackups(${path}) failed: ${error.message}`);
}

/** List the backups bucket under a prefix — same shape/caveats as listStaged. */
export async function listBackups(
  prefix: string,
): Promise<{ name: string; createdAt: string }[]> {
  if (isMemoryBackend()) return memory.listBackups(prefix);
  const { data, error } = await getSupabase()
    .storage.from(backupsBucket())
    .list(prefix, { limit: 1000 });
  if (error) throw new Error(`listBackups(${prefix}) failed: ${error.message}`);
  return (data ?? []).map((f) => ({ name: f.name, createdAt: f.created_at ?? "" }));
}

/** B1 8-week rotation: remove old dump objects from the backups bucket. */
export async function removeBackups(paths: string[]): Promise<void> {
  if (isMemoryBackend()) return memory.removeBackups(paths);
  if (paths.length === 0) return;
  const { error } = await getSupabase().storage.from(backupsBucket()).remove(paths);
  if (error) throw new Error(`removeBackups(${paths.length} paths) failed: ${error.message}`);
}
