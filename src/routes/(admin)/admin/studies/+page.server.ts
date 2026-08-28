import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { memberPickers } from "$lib/server/data/repos";
import {
  createStudy,
  deleteStudy,
  setOrganizer,
  setStudyPhotos,
  updateStudy,
} from "$lib/server/services/records-admin";
import { promotePendingUpload } from "$lib/server/services/uploads";
import { AppError } from "$lib/server/core/errors";
import { TERM_PATTERN } from "$lib/server/core/semester";
import { StudyStatus } from "$lib/server/data/schemas";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [studies, members] = await Promise.all([getTable("studies"), memberPickers()]);
  return { studies: [...studies].reverse(), members };
};

type Ctx = { request: Request; locals: App.Locals };

export const actions = {
  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const title = (data.get("title") as string)?.trim();
      const semester = data.get("semester") as string;
      const organizerId = data.get("organizerId") as string;
      if (!title || !TERM_PATTERN.test(semester) || !organizerId) {
        throw new AppError("VALIDATION_FAILED");
      }
      await createStudy({
        title,
        semester,
        textbook: (data.get("textbook") as string) ?? "",
        description: (data.get("description") as string) ?? "",
        note: (data.get("note") as string) ?? "",
        organizerIds: [organizerId],
      });
      return {};
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const statusRaw = data.get("status") as string | null;
      const status = statusRaw ? StudyStatus.parse(statusRaw) : undefined;
      await updateStudy(data.get("id") as string, {
        title: (data.get("title") as string)?.trim() || undefined,
        semester: data.get("semester") ? (data.get("semester") as string) : undefined,
        textbook: (data.get("textbook") as string) ?? undefined,
        description: (data.get("description") as string) ?? undefined,
        note: (data.get("note") as string) ?? undefined,
        status,
      });
      return {};
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await deleteStudy(id);
      return {};
    });
  },

  /** Admin plenary transfer — clears any pending two-phase proposal, audited. */
  setOrganizer: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await setOrganizer(
        data.get("id") as string,
        data.get("organizerId") as string,
        locals.member!.memberId,
      );
      return {};
    });
  },

  addFile: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const finalKey = await promotePendingUpload(
        data.get("pendingKey") as string,
        "study-photo",
        id,
      );
      await setStudyPhotos(id, { add: finalKey });
      return { s3Key: finalKey };
    });
  },

  removeFile: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await setStudyPhotos(data.get("id") as string, { remove: data.get("s3Key") as string });
      return {};
    });
  },
};
