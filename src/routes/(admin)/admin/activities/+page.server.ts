import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { memberPickers } from "$lib/server/data/repos";
import {
  createActivity,
  deleteActivity,
  setAttendees,
  updateActivity,
} from "$lib/server/services/records-admin";
import { AppError } from "$lib/server/core/errors";
import { kstInputToIso } from "$lib/server/core/time";
import { ACTIVITY_TYPES, type Activity } from "$lib/server/data/schemas";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [activities, members] = await Promise.all([getTable("activities"), memberPickers()]);
  return {
    activities: [...activities].reverse(),
    members,
    activityTypes: [...ACTIVITY_TYPES],
  };
};

type Ctx = { request: Request; locals: App.Locals };

function parseType(raw: string): Activity["type"] {
  if (!(ACTIVITY_TYPES as readonly string[]).includes(raw)) {
    throw new AppError("VALIDATION_FAILED");
  }
  return raw as Activity["type"];
}

export const actions = {
  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const title = (data.get("title") as string)?.trim();
      const start = data.get("start") as string;
      if (!title || !start) throw new AppError("VALIDATION_FAILED");
      const end = data.get("end") as string;
      await createActivity({
        title,
        date: { start: kstInputToIso(start), end: end ? kstInputToIso(end) : null },
        type: parseType(data.get("type") as string),
      });
      return {};
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const start = data.get("start") as string;
      const end = data.get("end") as string;
      await updateActivity(id, {
        title: (data.get("title") as string)?.trim() || undefined,
        type: data.get("type") ? parseType(data.get("type") as string) : undefined,
        date: start
          ? { start: kstInputToIso(start), end: end ? kstInputToIso(end) : null }
          : undefined,
      });
      return {};
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await deleteActivity(id);
      return {};
    });
  },

  /** §7-4: the one sanctioned wholesale overwrite — UI shows a confirm dialog. */
  setAttendees: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const attendeeIds = (data.getAll("attendeeIds") as string[]).filter(Boolean);
      await setAttendees(id, attendeeIds);
      return {};
    });
  },
};
