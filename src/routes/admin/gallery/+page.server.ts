import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import { z } from "zod";
import {
  adminGalleryRecordSchema,
  zodFieldIssues,
} from "$lib/domain/admin-records";
import { ensureAdmin } from "$lib/server/auth-guards";
import {
  createDevAdminGalleryRecord,
  deleteDevAdminGalleryRecord,
  getDevAdminGallery,
  removeDevAdminGalleryPhoto,
  setDevAdminGalleryPhoto,
  updateDevAdminGalleryRecord,
} from "$lib/server/dev-admin-record-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

const idSchema = z.string().trim().min(1);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function requireAdminPreview(
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    throw error(503, "새 갤러리 레코드 API 연결이 필요합니다.");
  }
}

function parseRecord(formData: FormData) {
  return adminGalleryRecordSchema.safeParse({
    title: value(formData, "title"),
    category: value(formData, "category"),
    date: value(formData, "date"),
    alt: value(formData, "alt"),
  });
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await ensureAdmin(locals, { silent: true });
  requireAdminPreview(url, cookies);
  return {
    gallery: getDevAdminGallery(),
    generatedAt: new Date().toISOString(),
  };
};

export const actions: Actions = {
  create: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const result = parseRecord(formData);
    if (!result.success) {
      return fail(400, {
        scope: "create" as const,
        issues: zodFieldIssues(result.error),
        values: Object.fromEntries(
          ["title", "category", "date", "alt"].map((key) => [
            key,
            value(formData, key),
          ]),
        ),
      });
    }
    return {
      success: true,
      operation: "galleryCreated" as const,
      record: createDevAdminGalleryRecord(result.data),
    };
  },
  update: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const id = value(formData, "id");
    const result = parseRecord(formData);
    if (!idSchema.safeParse(id).success || !result.success) {
      return fail(400, {
        scope: "update" as const,
        id,
        issues: result.success
          ? { _form: "기록 식별자를 확인해 주세요." }
          : zodFieldIssues(result.error),
      });
    }
    const record = updateDevAdminGalleryRecord(id, result.data);
    if (!record)
      return fail(404, { scope: "update" as const, id, error: "NOT_FOUND" });
    return { success: true, operation: "galleryUpdated" as const, record };
  },
  addPhoto: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const id = value(formData, "id");
    const photo = formData.get("photo");
    if (
      !idSchema.safeParse(id).success ||
      !(photo instanceof File) ||
      photo.size === 0
    ) {
      return fail(400, {
        scope: "photo" as const,
        id,
        issues: { photo: "사진 파일을 선택해 주세요." },
      });
    }
    if (!IMAGE_TYPES.has(photo.type)) {
      return fail(400, {
        scope: "photo" as const,
        id,
        issues: { photo: "JPEG, PNG 또는 WebP 이미지만 업로드할 수 있습니다." },
      });
    }
    if (photo.size > MAX_IMAGE_BYTES) {
      return fail(413, {
        scope: "photo" as const,
        id,
        issues: { photo: "이미지는 10MB 이하여야 합니다." },
      });
    }
    const record = setDevAdminGalleryPhoto(id, {
      name: photo.name,
      contentType: photo.type,
      size: photo.size,
      thumbnailUrl: null,
      displayUrl: null,
    });
    if (!record)
      return fail(404, { scope: "photo" as const, id, error: "NOT_FOUND" });
    return {
      success: true,
      operation: "galleryPhotoAdded" as const,
      record,
      uploadMode: "dev-metadata-only" as const,
    };
  },
  removePhoto: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const id = value(await request.formData(), "id");
    const record = removeDevAdminGalleryPhoto(id);
    if (!record) return fail(404, { error: "NOT_FOUND" });
    return { success: true, operation: "galleryPhotoRemoved" as const, record };
  },
  delete: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const id = value(await request.formData(), "id");
    if (!idSchema.safeParse(id).success)
      return fail(400, { error: "VALIDATION_FAILED" });
    if (!deleteDevAdminGalleryRecord(id))
      return fail(404, { error: "NOT_FOUND" });
    return { success: true, operation: "galleryDeleted" as const, id };
  },
};
