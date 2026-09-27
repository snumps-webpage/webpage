import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { memberPickers } from "$lib/server/data/repos";
import {
  createActivity,
  deleteActivity,
  setAttendees,
  updateActivity,
} from "$lib/server/services/records-admin";
import { fail } from "@sveltejs/kit";
import { kstInputToIso, nowKstIso } from "$lib/server/core/time";
import { ACTIVITY_TYPES } from "$lib/server/data/schemas";
import { formText, fieldIssues } from "$lib/domain/form-data";
import {
  adminActivityRecordSchema,
  adminActivityRecordUpdateSchema,
} from "$lib/domain/admin-records";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [activities, members, events] = await Promise.all([
    getTable("activities"),
    memberPickers(),
    getTable("events"),
  ]);
  return {
    activities: [...activities].reverse().map((a) => ({
      ...a,
      // Referential-integrity hint for the delete row (deleteActivity CONFLICTs).
      linkedEventIds: events
        .filter((e) => e.activityId === a.id)
        .map((e) => e.id),
    })),
    members,
    activityTypes: [...ACTIVITY_TYPES],
    generatedAt: nowKstIso(),
  };
};

type Ctx = { request: Request; locals: App.Locals };

/** The editor's fields, read once for the schema and for re-rendering. */
function activityValues(data: FormData) {
  return {
    title: formText(data, "title"),
    type: formText(data, "type"),
    start: formText(data, "start"),
    end: formText(data, "end"),
  };
}

export const actions = {
  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const values = activityValues(data);
      const parsed = adminActivityRecordSchema.safeParse(values);
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: fieldIssues(parsed.error),
          values,
        });
      }
      const { title, type, start, end } = parsed.data;
      await createActivity({
        title,
        date: {
          start: kstInputToIso(start),
          end: end ? kstInputToIso(end) : null,
        },
        type,
      });
      return { operation: "activityCreated" };
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const values = activityValues(data);
      const parsed = adminActivityRecordUpdateSchema.safeParse(values);
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          id,
          issues: fieldIssues(parsed.error),
          values,
        });
      }
      const { title, type, start, end } = parsed.data;
      await updateActivity(id, {
        title,
        type,
        date: start
          ? {
              start: kstInputToIso(start),
              end: end ? kstInputToIso(end) : null,
            }
          : undefined,
      });
      return { operation: "activityUpdated" };
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await deleteActivity(id);
      return { operation: "activityDeleted" };
    });
  },

  /** §7-4: the one sanctioned wholesale overwrite — UI shows a confirm dialog. */
  setAttendees: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const attendeeIds = (data.getAll("attendeeIds") as string[]).filter(
        Boolean,
      );
      await setAttendees(id, attendeeIds);
      return { operation: "attendeesReplaced" };
    });
  },
};
