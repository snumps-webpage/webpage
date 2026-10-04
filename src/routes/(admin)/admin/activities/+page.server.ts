import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { memberPickers } from "$lib/server/data/repos";
import {
  createActivity,
  deleteActivity,
  setAttendees,
  updateActivity,
} from "$lib/server/services/records-admin";
import { fail, isActionFailure, type ActionFailure } from "@sveltejs/kit";
import { kstInputToIso, nowKstIso } from "$lib/server/core/time";
import { ACTIVITY_TYPES } from "$lib/server/data/schemas";
import { formText, fieldIssues } from "$lib/domain/form-data";
import {
  adminActivityRecordSchema,
  adminActivityRecordUpdateSchema,
  type AdminRecordActionScope,
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
    date: formText(data, "date"),
  };
}

/** Preserve the shared auth/error classification and add only editor values. */
async function recordAction<T extends Record<string, unknown>>(
  locals: App.Locals,
  scope: AdminRecordActionScope,
  id: string,
  values: Record<string, string>,
  logic: () => Promise<T | ActionFailure<Record<string, unknown>>>,
  arrays: Record<string, string[]> = {},
) {
  const result = await handleAdminAction(locals, logic);
  if (isActionFailure(result as unknown)) {
    const failure = result as ActionFailure<Record<string, unknown>>;
    return fail(failure.status, {
      ...failure.data,
      scope,
      id,
      values,
      ...arrays,
    });
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
    const values = activityValues(data);
    return recordAction(locals, "record-create", "", values, async () => {
      const parsed = adminActivityRecordSchema.safeParse(values);
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: fieldIssues(parsed.error),
        });
      }
      const { title, type, start, end, date } = parsed.data;
      const created = await createActivity({
        title,
        date: {
          start: kstInputToIso(start || `${date}T00:00`),
          end: end ? kstInputToIso(end) : null,
        },
        type,
      });
      return { operation: "activityCreated", id: created.id };
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = activityValues(data);
    return recordAction(locals, "record-update", id, values, async () => {
      const parsed = adminActivityRecordUpdateSchema.safeParse(values);
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: fieldIssues(parsed.error),
        });
      }
      const { title, type, start, end, date } = parsed.data;
      await updateActivity(
        id,
        {
          title,
          type,
          date: start
            ? {
                start: kstInputToIso(start),
                end: end ? kstInputToIso(end) : null,
              }
            : undefined,
        },
        !start && date ? date : undefined,
      );
      return { operation: "activityUpdated" };
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = formText(await request.formData(), "id");
    return recordAction(locals, "record-delete", id, {}, async () => {
      await deleteActivity(id);
      return { operation: "activityDeleted" };
    });
  },

  /** §7-4: the one sanctioned wholesale overwrite — UI shows a confirm dialog. */
  setAttendees: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const attendeeIds = (data.getAll("attendeeIds") as string[]).filter(
      Boolean,
    );
    const submittedIds = attendeeIds.filter(
      (value) => typeof value === "string",
    );
    return recordAction(
      locals,
      "record-attendees",
      id,
      {},
      async () => {
        await setAttendees(id, attendeeIds);
        return { operation: "attendeesReplaced" };
      },
      { attendeeIds: submittedIds },
    );
  },
};
