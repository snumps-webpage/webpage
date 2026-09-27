import { z } from "zod/v4";

/**
 * The upload purposes and what each accepts — one table for the presign
 * route's schema, the server's checks and the editors' `accept` lists and
 * pre-checks. They were four hand copies that a change to one limit would
 * silently split (audit LB32-2). Where a purpose's files are stored (the key
 * prefix) is the server's business and stays in services/uploads.ts.
 */

export interface UploadPurposeSpec {
  /** The content types the purpose accepts. */
  types: readonly string[];
  /** The largest accepted size, in bytes (decimal MB: 10 MB = 10_000_000). */
  maxBytes: number;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const UPLOAD_PURPOSES = {
  "seminar-material": { types: ["application/pdf"], maxBytes: 50_000_000 },
  "seminar-photo": { types: IMAGE_TYPES, maxBytes: 10_000_000 },
  // 직접 업로드 포스터 — PNG/JPEG만 (자동 생성 포스터의 대안)
  "seminar-poster": {
    types: ["image/png", "image/jpeg"],
    maxBytes: 15_000_000,
  },
  "study-photo": { types: IMAGE_TYPES, maxBytes: 10_000_000 },
  "gallery-photo": { types: IMAGE_TYPES, maxBytes: 10_000_000 },
} as const satisfies Record<string, UploadPurposeSpec>;

export type UploadPurpose = keyof typeof UPLOAD_PURPOSES;

const PURPOSE_NAMES = Object.keys(UPLOAD_PURPOSES) as [
  UploadPurpose,
  ...UploadPurpose[],
];

export const uploadPurposeSchema = z.enum(PURPOSE_NAMES);

/** The spec of a purpose, typed as the general shape. */
export function uploadSpec(purpose: UploadPurpose): UploadPurposeSpec {
  return UPLOAD_PURPOSES[purpose];
}

/** An `<input type="file" accept>` value covering every given purpose. */
export function uploadAccept(...purposes: UploadPurpose[]): string {
  return [...new Set(purposes.flatMap((p) => uploadSpec(p).types))].join(",");
}

/** A purpose's size cap in whole MB, for labels and messages. */
export function uploadLimitMb(purpose: UploadPurpose): number {
  return Math.floor(uploadSpec(purpose).maxBytes / 1_000_000);
}

/**
 * Why a file does not fit a purpose, or null when it does. The same test the
 * server repeats at presign and at promotion; a client pre-check is a
 * convenience, never the gate.
 */
export function uploadFileProblem(
  purpose: UploadPurpose,
  file: { type: string; size: number },
): "type" | "empty" | "size" | null {
  const spec = uploadSpec(purpose);
  if (!spec.types.includes(file.type)) return "type";
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty";
  if (file.size > spec.maxBytes) return "size";
  return null;
}
