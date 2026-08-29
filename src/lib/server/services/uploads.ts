import { AppError } from "$lib/server/core/errors";
import { newId, randomToken } from "$lib/server/core/id";
import {
  copyToBackups,
  createUploadUrl,
  promoteToAssets,
  stagedInfo,
} from "$lib/server/data/storage";

/**
 * Upload pipeline (API-SPEC §8-2 / SUPABASE-MIGRATION-SPEC §4-2).
 * signed upload URL → browser PUTs to the private staging bucket under
 * pending/ → an editor action PROMOTES: stagedInfo() enforces the size/type
 * caps (a signed upload URL cannot — Supabase does not sign Content-Type),
 * then a cross-bucket move lands the object at its final hashed key in the
 * public assets bucket, plus a B3 mirror copy into backups (§7). Unpromoted
 * staged objects die by the maintenance job's 7-day cleanup.
 * TODO(BE-52): image derivatives (thumb/display) at promotion time.
 */

const IMG = ["image/jpeg", "image/png", "image/webp"];

export const PURPOSES = {
  "seminar-material": { prefix: "seminars", types: ["application/pdf"], maxBytes: 50_000_000 },
  "seminar-photo": { prefix: "seminars", types: IMG, maxBytes: 10_000_000 },
  "study-photo": { prefix: "studies", types: IMG, maxBytes: 10_000_000 },
  "gallery-photo": { prefix: "gallery", types: IMG, maxBytes: 10_000_000 },
} as const;

export type UploadPurpose = keyof typeof PURPOSES;

export function isUploadPurpose(v: string): v is UploadPurpose {
  return v in PURPOSES;
}

export function slugifyFilename(filename: string): { slug: string; ext: string } {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = (dot > 0 ? filename.slice(dot + 1).toLowerCase() : "") || "bin";
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "file";
  return { slug, ext };
}

export async function createPresignedUpload(input: {
  purpose: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<{ uploadUrl: string; s3Key: string }> {
  if (!isUploadPurpose(input.purpose)) throw new AppError("VALIDATION_FAILED");
  const spec = PURPOSES[input.purpose];
  if (!(spec.types as readonly string[]).includes(input.contentType)) {
    throw new AppError("VALIDATION_FAILED");
  }
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > spec.maxBytes) {
    throw new AppError("VALIDATION_FAILED");
  }

  const { slug, ext } = slugifyFilename(input.filename);
  // Staging-bucket path: the bucket IS the staging area, so no uploads/
  // prefix; pending/ stays as the cleanup job's listing prefix.
  const path = `pending/${input.purpose}/${newId()}-${slug}.${ext}`;
  const uploadUrl = await createUploadUrl(path);
  // Field name s3Key is the frozen API surface (SYS-03), path semantics only.
  return { uploadUrl, s3Key: path };
}

/**
 * The promotion step editors call when registering a pending s3Key.
 * Returns the FINAL key to store on the record.
 */
export async function promotePendingUpload(
  pendingKey: string,
  purpose: UploadPurpose,
  recordId: string,
): Promise<string> {
  if (!pendingKey.startsWith(`pending/${purpose}/`)) {
    throw new AppError("VALIDATION_FAILED");
  }
  const spec = PURPOSES[purpose];

  const info = await stagedInfo(pendingKey);
  if (!info) throw new AppError("NOT_FOUND"); // never uploaded or already reaped
  if (info.size > spec.maxBytes || !(spec.types as readonly string[]).includes(info.contentType)) {
    // Oversize/spoofed upload: refuse promotion; the cleanup job reaps it.
    throw new AppError("VALIDATION_FAILED");
  }

  const filename = pendingKey.slice(pendingKey.lastIndexOf("/") + 1);
  const nameAfterId = filename.slice(filename.indexOf("-") + 1);
  const finalKey = `${spec.prefix}/${recordId}/${randomToken(8)}-${nameAfterId}`;

  await promoteToAssets(pendingKey, finalKey);
  try {
    // B3 asset mirror (SUPABASE-MIGRATION-SPEC §7): one copy into the private
    // backups bucket at promotion time — the replacement for S3 versioning.
    await copyToBackups("assets", finalKey, `assets-mirror/${finalKey}`);
  } catch (e) {
    // The mirror is a recovery layer, not a gate: the asset IS promoted, so
    // log and keep going rather than failing the editor's action.
    console.error(`B3 mirror failed for ${finalKey}:`, e);
  }
  return finalKey;
}
