import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import {
  createGalleryEntry,
  deleteGalleryEntry,
  setGalleryPhotos,
  updateGalleryEntry,
} from "$lib/server/services/records-admin";
import { promotePendingUpload } from "$lib/server/services/uploads";
import { fail, isActionFailure, type ActionFailure } from "@sveltejs/kit";
import { formText, fieldIssues } from "$lib/domain/form-data";
import {
  adminGalleryRecordSchema,
  type AdminRecordActionScope,
} from "$lib/domain/admin-records";
import { nowKstIso } from "$lib/server/core/time";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [entries, activities] = await Promise.all([
    getTable("gallery-dinner"),
    getTable("activities"),
  ]);
  const activityById = new Map(activities.map((a) => [a.id, a]));
  return {
    gallery: [...entries].reverse().map((entry) => {
      const activity = entry.activityId
        ? activityById.get(entry.activityId)
        : undefined;
      return {
        id: entry.id,
        year: entry.year,
        activityId: entry.activityId,
        title: activity?.title ?? `${entry.year} 회식`,
        date: activity ? activity.date.start.slice(0, 10) : entry.year,
        photos: entry.photos.map((key) => ({
          s3Key: key,
          name: key.slice(key.lastIndexOf("/") + 1),
        })),
      };
    }),
    activities: activities
      .filter((a) => a.type === "회식")
      .map((a) => ({
        id: a.id,
        title: a.title,
        date: a.date.start.slice(0, 10),
      })),
    generatedAt: nowKstIso(),
  };
};

type Ctx = { request: Request; locals: App.Locals };

function galleryValues(data: FormData) {
  return {
    year: formText(data, "year"),
    activityId: formText(data, "activityId"),
  };
}

/** Preserve the shared auth/error classification and add only editor values. */
async function recordAction<T extends Record<string, unknown>>(
  locals: App.Locals,
  scope: AdminRecordActionScope,
  id: string,
  values: Record<string, string>,
  logic: () => Promise<T | ActionFailure<Record<string, unknown>>>,
) {
  const result = await handleAdminAction(locals, logic);
  if (isActionFailure(result as unknown)) {
    const failure = result as ActionFailure<Record<string, unknown>>;
    return fail(failure.status, { ...failure.data, scope, id, values });
  }
  const successful = result as T & { success: true };
  return {
    ...successful,
    scope,
    id: typeof successful.id === "string" ? successful.id : id,
  };
}

export const actions = {
  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const values = galleryValues(data);
    return recordAction(locals, "record-create", "", values, async () => {
      const parsed = adminGalleryRecordSchema.safeParse(values);
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: fieldIssues(parsed.error),
        });
      }
      const created = await createGalleryEntry({
        year: parsed.data.year,
        activityId: parsed.data.activityId || null,
      });
      return { operation: "galleryCreated", id: created.id };
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = galleryValues(data);
    return recordAction(locals, "record-update", id, values, async () => {
      const parsed = adminGalleryRecordSchema.safeParse(values);
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: fieldIssues(parsed.error),
        });
      }
      await updateGalleryEntry(id, {
        year: parsed.data.year,
        activityId: parsed.data.activityId || null,
      });
      return { operation: "galleryUpdated" };
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = formText(await request.formData(), "id");
    return recordAction(locals, "record-delete", id, {}, async () => {
      await deleteGalleryEntry(id);
      return { operation: "galleryDeleted" };
    });
  },

  addPhoto: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = { pendingKey: formText(data, "pendingKey") };
    return recordAction(locals, "record-file", id, values, async () => {
      const finalKey = await promotePendingUpload(
        data.get("pendingKey") as string,
        "gallery-photo",
        id,
      );
      await setGalleryPhotos(id, { add: finalKey });
      return { s3Key: finalKey, operation: "galleryPhotoAdded" };
    });
  },

  removePhoto: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = { s3Key: formText(data, "s3Key") };
    return recordAction(locals, "record-file", id, values, async () => {
      await setGalleryPhotos(id, {
        remove: data.get("s3Key") as string,
      });
      return { operation: "galleryPhotoRemoved" };
    });
  },
};
