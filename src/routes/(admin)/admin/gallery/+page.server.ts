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
      const activity = entry.activityId ? activityById.get(entry.activityId) : undefined;
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
      .map((a) => ({ id: a.id, title: a.title, date: a.date.start.slice(0, 10) })),
    generatedAt: nowKstIso(),
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
      return { operation: "galleryCreated" };
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await updateGalleryEntry(data.get("id") as string, {
        year: (data.get("year") as string)?.trim() || undefined,
        activityId: (data.get("activityId") as string) || null,
      });
      return { operation: "galleryUpdated" };
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await deleteGalleryEntry(id);
      return { operation: "galleryDeleted" };
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
      return { s3Key: finalKey, operation: "galleryPhotoAdded" };
    });
  },

  removePhoto: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await setGalleryPhotos(data.get("id") as string, {
        remove: data.get("s3Key") as string,
      });
      return { operation: "galleryPhotoRemoved" };
    });
  },
};
