import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { memberPickers } from "$lib/server/data/repos";
import {
  createSeminar,
  deleteSeminar,
  setSeminarFiles,
  updateSeminar,
} from "$lib/server/services/records-admin";
import { promotePendingUpload } from "$lib/server/services/uploads";
import { AppError } from "$lib/server/core/errors";
import { TERM_PATTERN } from "$lib/server/core/semester";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [seminars, members] = await Promise.all([getTable("seminars"), memberPickers()]);
  return { seminars: [...seminars].reverse(), members };
};

type Ctx = { request: Request; locals: App.Locals };

const parseIds = (raw: string | null) =>
  raw ? [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))] : [];

function requireTerm(raw: string): string {
  if (!TERM_PATTERN.test(raw)) throw new AppError("VALIDATION_FAILED");
  return raw;
}

export const actions = {
  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const title = (data.get("title") as string)?.trim();
      if (!title) throw new AppError("VALIDATION_FAILED");
      await createSeminar({
        title,
        semester: requireTerm(data.get("semester") as string),
        note: (data.get("note") as string) ?? "",
        presenterIds: parseIds(data.get("presenterIds") as string),
        externalPresenters: (data.get("externalPresenters") as string) ?? "",
      });
      return {};
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await updateSeminar(data.get("id") as string, {
        title: (data.get("title") as string)?.trim() || undefined,
        semester: data.get("semester") ? requireTerm(data.get("semester") as string) : undefined,
        note: (data.get("note") as string) ?? undefined,
        presenterIds: data.get("presenterIds")
          ? parseIds(data.get("presenterIds") as string)
          : undefined,
        externalPresenters: (data.get("externalPresenters") as string) ?? undefined,
      });
      return {};
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await deleteSeminar(id);
      return {};
    });
  },

  /** Registers a pending upload: promote (size/type enforced there) then attach. */
  addFile: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const field = data.get("field") as "materials" | "photos";
      if (field !== "materials" && field !== "photos") throw new AppError("VALIDATION_FAILED");
      const purpose = field === "materials" ? "seminar-material" : "seminar-photo";
      const finalKey = await promotePendingUpload(
        data.get("pendingKey") as string,
        purpose,
        id,
      );
      await setSeminarFiles(id, field, { add: finalKey });
      return { s3Key: finalKey };
    });
  },

  removeFile: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const field = data.get("field") as "materials" | "photos";
      if (field !== "materials" && field !== "photos") throw new AppError("VALIDATION_FAILED");
      await setSeminarFiles(data.get("id") as string, field, {
        remove: data.get("s3Key") as string,
      });
      return {};
    });
  },
};
