import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import {
  createGalleryEntry,
  deleteGalleryEntry,
  setGalleryPhotos,
  updateGalleryEntry,
} from "$lib/server/services/records-admin";
import { promotePendingUpload } from "$lib/server/services/uploads";
import { AppError } from "$lib/server/core/errors";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [entries, activities] = await Promise.all([
    getTable("gallery-dinner"),
    getTable("activities"),
  ]);
  return {
    entries: [...entries].reverse(),
    activities: activities
      .filter((a) => a.type === "회식")
      .map((a) => ({ id: a.id, title: a.title, date: a.date.start })),
  };
};

type Ctx = { request: Request; locals: App.Locals };

export const actions = {
  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const year = (data.get("year") as string)?.trim();
      if (!year) throw new AppError("VALIDATION_FAILED");
      await createGalleryEntry({
        year,
        activityId: (data.get("activityId") as string) || null,
      });
      return {};
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await updateGalleryEntry(data.get("id") as string, {
        year: (data.get("year") as string)?.trim() || undefined,
        activityId: (data.get("activityId") as string) || null,
      });
      return {};
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await deleteGalleryEntry(id);
      return {};
    });
  },

  addPhoto: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const finalKey = await promotePendingUpload(
        data.get("pendingKey") as string,
        "gallery-photo",
        id,
      );
      await setGalleryPhotos(id, { add: finalKey });
      return { s3Key: finalKey };
    });
  },

  removePhoto: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await setGalleryPhotos(data.get("id") as string, {
        remove: data.get("s3Key") as string,
      });
      return {};
    });
  },
};
