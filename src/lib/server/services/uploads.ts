import {
  UPLOAD_PURPOSES,
  uploadFileProblem,
  uploadSpec,
  type UploadPurpose,
} from "$lib/domain/uploads";
import { lookupTable } from "$lib/server/core/lookup";
import { AppError } from "$lib/server/core/errors";
import { newId, randomToken } from "$lib/server/core/id";
import {
  copyToBackups,
  createUploadUrl,
  promoteToAssets,
  readStagedHead,
  stagedInfo,
} from "$lib/server/data/storage";

/**
 * 파일 시그니처(매직 바이트) — 확장자·Content-Type은 위조 가능하므로 실제
 * 바이트로 검증한다. 각 허용 타입의 헤더가 일치하지 않으면 승격을 거부한다.
 */
const SIGNATURES: Record<string, (number | null)[][]> = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  // "RIFF" <크기 4바이트> "WEBP" — RIFF는 컨테이너라 WAV·AVI도 같은 4바이트로
  // 시작한다. 8-11바이트까지 봐야 WebP다 (감사 LB32-3). null = 아무 바이트.
  "image/webp": [
    [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  ],
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // "%PDF"
};

function matchesSignature(head: Uint8Array, contentType: string): boolean {
  const sigs = SIGNATURES[contentType];
  if (!sigs) return false; // 시그니처 미정의 타입은 통과시키지 않는다
  return sigs.some((sig) =>
    sig.every((b, i) => (b === null ? i < head.length : head[i] === b)),
  );
}

/**
 * 저장 키의 확장자는 검증된 타입에서 만든다 — 클라이언트 파일명의 확장자는
 * 정제되지 않은 채 `?`·`#`·공백·`/`를 키에 옮겨 /media URL을 깨뜨렸고,
 * 검증된 타입과 비교되지도 않았다 (감사 LB32-4).
 */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const extensionFor = (contentType: string) =>
  Object.hasOwn(EXTENSIONS, contentType) ? EXTENSIONS[contentType] : "bin";

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

/**
 * The purpose table (names, types, size caps) is shared with the route schema
 * and the editors (`$lib/domain/uploads`, audit LB32-2). What stays here is
 * where each purpose's files land. `satisfies Record<UploadPurpose, …>` makes
 * a purpose added to the table without a prefix a compile error, and
 * lookupTable keeps prototype keys ("constructor", …) from answering.
 */
const PREFIXES = lookupTable({
  "seminar-material": "seminars",
  "seminar-photo": "seminars",
  "seminar-poster": "seminars/posters",
  "study-photo": "studies",
  "gallery-photo": "gallery",
} as const satisfies Record<UploadPurpose, string>);

export type { UploadPurpose };

export function isUploadPurpose(v: string): v is UploadPurpose {
  return Object.hasOwn(UPLOAD_PURPOSES, v);
}

/** The filename without its extension, reduced to `[a-z0-9가-힣-]`. */
export function slugifyFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "file"
  );
}

export async function createPresignedUpload(input: {
  purpose: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<{ uploadUrl: string; s3Key: string }> {
  if (!isUploadPurpose(input.purpose)) throw new AppError("VALIDATION_FAILED");
  if (
    uploadFileProblem(input.purpose, {
      type: input.contentType,
      size: input.size,
    })
  ) {
    throw new AppError("VALIDATION_FAILED");
  }

  const slug = slugifyFilename(input.filename);
  // Staging-bucket path: the bucket IS the staging area, so no uploads/
  // prefix; pending/ stays as the cleanup job's listing prefix.
  const path = `pending/${input.purpose}/${newId()}-${slug}.${extensionFor(input.contentType)}`;
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
  const spec = uploadSpec(purpose);

  const info = await stagedInfo(pendingKey);
  if (!info) throw new AppError("NOT_FOUND"); // never uploaded or already reaped
  if (info.size > spec.maxBytes || !spec.types.includes(info.contentType)) {
    // Oversize/claimed-type mismatch: refuse promotion; the cleanup job reaps it.
    throw new AppError("VALIDATION_FAILED");
  }
  // 매직 바이트 검증: 확장자·Content-Type 위조를 실제 파일 헤더로 차단한다.
  const head = await readStagedHead(pendingKey, 16);
  if (!head || !matchesSignature(head, info.contentType)) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "파일 내용이 형식과 일치하지 않습니다.",
    });
  }

  // Slug from the staged name, extension from the checked type — a key
  // staged before the extension was derived may still carry the client's.
  const filename = pendingKey.slice(pendingKey.lastIndexOf("/") + 1);
  const slug = slugifyFilename(filename.slice(filename.indexOf("-") + 1));
  const finalKey = `${PREFIXES[purpose]}/${recordId}/${randomToken(8)}-${slug}.${extensionFor(info.contentType)}`;

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

/**
 * 세미나 포스터 승격 — 신청 승인·관리자 직접 생성/수정이 공유하는 단일 소스.
 * 빈 키면 자동 생성 포스터를 쓰는 것이므로 빈 문자열을 그대로 반환한다.
 * (경로·purpose 검증 + 크기/타입/매직바이트 검증은 promotePendingUpload가 담당.)
 */
export async function promoteSeminarPoster(
  pendingKey: string,
): Promise<string> {
  const key = pendingKey.trim();
  if (!key) return "";
  if (!key.startsWith("pending/seminar-poster/")) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "포스터 업로드 정보가 올바르지 않습니다.",
    });
  }
  return promotePendingUpload(key, "seminar-poster", newId());
}
