import { AppError } from "$lib/server/core/errors";
import { newId, randomToken } from "$lib/server/core/id";
import {
  assetsBucket,
  copyObject,
  deleteObject,
  headObject,
  presignPut,
} from "$lib/server/data/s3";

/**
 * Upload pipeline (API-SPEC §8-2 / BE-52).
 * presign → browser PUTs to uploads/pending/ → an editor action PROMOTES:
 * HeadObject enforces the size/type caps (a presigned PUT cannot), then
 * Copy+Delete moves the object to its final hashed key. Unpromoted pending
 * objects die by the 7-day lifecycle rule.
 * TODO(BE-52/AWS): image derivatives (thumb/display) at promotion time.
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
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : "bin";
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
  const s3Key = `uploads/pending/${input.purpose}/${newId()}-${slug}.${ext}`;
  const uploadUrl = await presignPut(assetsBucket(), s3Key, input.contentType);
  return { uploadUrl, s3Key };
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
  if (!pendingKey.startsWith(`uploads/pending/${purpose}/`)) {
    throw new AppError("VALIDATION_FAILED");
  }
  const spec = PURPOSES[purpose];
  const bucket = assetsBucket();

  const head = await headObject(bucket, pendingKey);
  if (!head) throw new AppError("NOT_FOUND"); // never uploaded or already reaped
  if (
    head.contentLength > spec.maxBytes ||
    !(spec.types as readonly string[]).includes(head.contentType)
  ) {
    // Oversize/spoofed upload: refuse promotion; the lifecycle rule reaps it.
    throw new AppError("VALIDATION_FAILED");
  }

  const filename = pendingKey.slice(pendingKey.lastIndexOf("/") + 1);
  const nameAfterId = filename.slice(filename.indexOf("-") + 1);
  const finalKey = `${spec.prefix}/${recordId}/${randomToken(8)}-${nameAfterId}`;

  await copyObject(bucket, pendingKey, finalKey);
  await deleteObject(bucket, pendingKey);
  return finalKey;
}
