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
import { approveStudy, rejectStudy } from "$lib/server/services/studies";
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
  adminEventView,
  applicationView,
  seminarRequestView,
  studyRequestView,
} from "$lib/server/data/views";
import {
  sendApplicationRejectedEmail,
  sendSeminarStatusNotification,
  sendStudyStatusNotification,
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
          .map(applicationView)
          .sort(
            (a, b) =>
              new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
          );
      })(),
      events: (async () => {
        const events = await getTable("events");
        return [...events].map((e) => adminEventView(e, effectiveStatus(e))).reverse();
      })(),
      attendanceQueue: getPendingAttendance(),
      withdrawnPending: getWithdrawnPending(),
      seminarRequests: (async () => {
        const requests = await getTable("seminar-requests");
        return requests.filter((r) => r.status === "pending").map(seminarRequestView);
      })(),
      studyRequests: (async () => {
        const requests = await getTable("study-requests");
        return requests.filter((r) => r.status === "pending").map(studyRequestView);
      })(),
    },
  };
};

/** One notifier for both request kinds — the right letter each time (review C2). */
async function notifyMember(
  memberId: string | undefined,
  kind: "seminar" | "study",
  title: string,
  status: "approved" | "rejected",
) {
  if (!memberId) return;
  const member = await getMemberById(memberId);
  if (!member) return;
  const info = await getPrivateInfoOf(member.id);
  if (!info?.email) return;
  const send =
    kind === "seminar" ? sendSeminarStatusNotification : sendStudyStatusNotification;
  await send(info.email, member.name, title, status);
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
      // The removed row is the only copy of the address — mail with the return
      // value or never (review M4).
      const { email, name } = await rejectApplication(id);
      await sendApplicationRejectedEmail(email, name);
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
      await notifyMember(req.presenterIds[0], "seminar", req.title, "approved");
      return { mailFailed };
    });
  },

  rejectSeminar: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      const req = await rejectSeminar(id);
      await notifyMember(req.presenterIds[0], "seminar", req.title, "rejected");
      return {};
    });
  },

  /** ADM-16: study proposal approval — the requester becomes the organizer. */
  approveStudy: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      const req = await approveStudy(id);
      await notifyMember(req.requesterId, "study", req.title, "approved");
      return {};
    });
  },

  rejectStudy: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      const req = await rejectStudy(id);
      await notifyMember(req.requesterId, "study", req.title, "rejected");
      return {};
    });
  },
};
