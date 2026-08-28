import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { getMemberById, getPrivateInfoOf } from "$lib/server/data/repos";
import {
  approveApplication,
  rejectApplication,
} from "$lib/server/services/membership";
import {
  approveSeminar,
  rejectSeminar,
} from "$lib/server/services/seminar-requests";
import {
  approveAttendance,
  deleteAttendanceRecord,
  deleteEventChecked,
  effectiveStatus,
  getPendingAttendance,
  rejectAttendance,
  setEventStatus,
  updateAttendanceTime,
} from "$lib/server/services/events";
import { getWithdrawnPending } from "$lib/server/services/members-admin";
import {
  sendSeminarStatusNotification,
  sendWelcomeEmail,
} from "$lib/server/mail";
import { AppError } from "$lib/server/core/errors";
import { kstInputToIso } from "$lib/server/core/time";
import { ACTIVITY_TYPES, type Event } from "$lib/server/data/schemas";
import { mutate } from "$lib/server/data/tables";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await ensureAdmin(event.locals, { silent: true });

  return {
    streamed: {
      applications: (async () => {
        const apps = await getTable("applications");
        return apps
          .map((a) => ({ ...a, accepted: false, submittedAt: a.createdAt }))
          .sort(
            (a, b) =>
              new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
          );
      })(),
      events: (async () => {
        const events = await getTable("events");
        return [...events]
          .map((e) => ({
            ...e,
            date: e.date.start,
            status: effectiveStatus(e),
            notionPageId: e.activityId, // legacy UI field name
          }))
          .reverse();
      })(),
      attendanceQueue: getPendingAttendance(),
      withdrawnPending: getWithdrawnPending(),
      seminarRequests: (async () => {
        const requests = await getTable("seminar-requests");
        return requests
          .filter((r) => r.status === "pending")
          .map((r) => ({ ...r, speakerIds: r.presenterIds, submittedAt: r.createdAt }));
      })(),
    },
  };
};

/** Legacy per-presenter status mail — the first presenter gets notified. */
async function notifyFirstPresenter(
  presenterIds: string[],
  title: string,
  status: "approved" | "rejected",
) {
  if (presenterIds.length === 0) return;
  const member = await getMemberById(presenterIds[0]);
  if (!member) return;
  const info = await getPrivateInfoOf(member.id);
  if (info?.email) {
    await sendSeminarStatusNotification(info.email, member.name, title, status);
  }
}

export const actions = {
  approve: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      const { name, email } = await approveApplication(id);
      await sendWelcomeEmail(email, name);
      return {};
    });
  },

  reject: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await rejectApplication(id);
      return {};
    });
  },

  activateEvent: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await setEventStatus(id, "active");
      return {};
    });
  },

  expireEvent: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await setEventStatus(id, "expired");
      return {};
    });
  },

  deleteEvent: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await deleteEventChecked(id);
      return {};
    });
  },

  /** BE-55: correct a mistyped event without touching its lifecycle. */
  updateEvent: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const title = (data.get("title") as string)?.trim();
      const start = data.get("start") as string;
      const end = data.get("end") as string;
      const typeRaw = data.get("type") as string | null;
      if (typeRaw && !(ACTIVITY_TYPES as readonly string[]).includes(typeRaw)) {
        throw new AppError("VALIDATION_FAILED");
      }
      await mutate("events", (rows) => {
        const idx = rows.findIndex((e) => e.id === id);
        if (idx === -1) throw new AppError("NOT_FOUND");
        rows[idx] = {
          ...rows[idx],
          title: title || rows[idx].title,
          type: (typeRaw as Event["type"]) || rows[idx].type,
          date: start
            ? { start: kstInputToIso(start), end: end ? kstInputToIso(end) : null }
            : rows[idx].date,
        };
        return rows;
      });
      return {};
    });
  },

  approveAttendance: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await approveAttendance(data.get("eventId") as string, data.get("id") as string);
      return {};
    });
  },

  rejectAttendance: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await rejectAttendance(data.get("eventId") as string, data.get("id") as string);
      return {};
    });
  },

  updateAttendanceTime: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    const patch: { startTime?: string; endTime?: string } = {};
    const start = data.get("startTime") as string;
    const end = data.get("endTime") as string;
    if (start) patch.startTime = kstInputToIso(start);
    if (end) patch.endTime = kstInputToIso(end);
    return handleAdminAction(locals, async () => {
      await updateAttendanceTime(
        data.get("eventId") as string,
        data.get("id") as string,
        patch,
      );
      return {};
    });
  },

  deleteAttendanceRecord: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await deleteAttendanceRecord(
        data.get("eventId") as string,
        data.get("id") as string,
      );
      return {};
    });
  },

  approveSeminar: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      const { request: req, mailFailed } = await approveSeminar(id);
      await notifyFirstPresenter(req.presenterIds, req.title, "approved");
      return { mailFailed };
    });
  },

  rejectSeminar: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      const req = await rejectSeminar(id);
      await notifyFirstPresenter(req.presenterIds, req.title, "rejected");
      return {};
    });
  },
};
