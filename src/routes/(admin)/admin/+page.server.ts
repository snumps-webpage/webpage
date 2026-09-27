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
  expiryOf,
  getPendingAttendance,
  rejectAttendance,
  setEventStatus,
  updateAttendanceTime,
} from "$lib/server/services/events";
import { getWithdrawnPending } from "$lib/server/services/members-admin";
import {
  adminApplicationItem,
  adminSeminarRequestItem,
  adminStudyRequestItem,
  directorySummaryIndex,
  byCreatedAtAsc,
} from "$lib/server/data/admin-queue-views";
import {
  adminAttendanceCapabilities,
  adminAttendanceTimeInputSchema,
  adminDashboardIdsSchema,
  adminEventCapabilities,
  adminEventInputSchema,
} from "$lib/domain/admin-dashboard";
import { formText, fieldIssues } from "$lib/domain/form-data";
import { fail } from "@sveltejs/kit";
import { nowKstIso } from "$lib/server/core/time";
import {
  sendApplicationRejectedEmail,
  sendSeminarStatusNotification,
  sendStudyStatusNotification,
  sendWelcomeEmail,
} from "$lib/server/mail";
import { AppError } from "$lib/server/core/errors";
import { kstInputToIso } from "$lib/server/core/time";
import { mutate } from "$lib/server/data/tables";
import type { PageServerLoad } from "./$types";

/**
 * Settles a map of in-flight queries, keeping them parallel. Load data must not
 * carry promises (W-21): Kit streams any response whose data holds one, and its
 * streaming branch builds a Response without a status, so the fourteen actions
 * on this page would report every failure as 200.
 */
async function settle<T extends Record<string, Promise<unknown>>>(
  pending: T,
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const entries = await Promise.all(
    Object.entries(pending).map(
      async ([key, value]) => [key, await value] as const,
    ),
  );
  return Object.fromEntries(entries) as { [K in keyof T]: Awaited<T[K]> };
}

export const load: PageServerLoad = async (event) => {
  await ensureAdmin(event.locals, { silent: true });

  return {
    generatedAt: nowKstIso(),
    streamed: await settle({
      applications: (async () => {
        const apps = await getTable("applications");
        return [...apps].sort(byCreatedAtAsc).map(adminApplicationItem);
      })(),
      events: (async () => {
        const [events, pending] = await Promise.all([
          getTable("events"),
          getPendingAttendance(),
        ]);
        const pendingCount = new Map<string, number>();
        for (const row of pending) {
          pendingCount.set(
            row.eventId,
            (pendingCount.get(row.eventId) ?? 0) + 1,
          );
        }
        const now = new Date();
        return [...events].reverse().map((e) => {
          const status = effectiveStatus(e, now);
          const count = pendingCount.get(e.id) ?? 0;
          return {
            id: e.id,
            activityId: e.activityId,
            title: e.title,
            type: e.type,
            startsAt: e.date.start,
            endsAt: e.date.end,
            status,
            attendancePath: `/events/${e.pathId}/${e.attendCode}`,
            pendingAttendanceCount: count,
            ...adminEventCapabilities(status, count, expiryOf(e) < now),
          };
        });
      })(),
      attendanceQueue: (async () => {
        const [rows, events, privateInfos] = await Promise.all([
          getPendingAttendance(),
          getTable("events"),
          getTable("private-info"),
        ]);
        const eventById = new Map(events.map((e) => [e.id, e]));
        const emailByMember = new Map(
          privateInfos.map((p) => [p.memberId, p.email]),
        );
        return rows.map((r) => ({
          id: r.id,
          eventId: r.eventId,
          eventTitle: r.eventTitle,
          activityId: eventById.get(r.eventId)?.activityId ?? "",
          member: {
            id: r.memberId,
            name: r.userName,
            department: r.userDept,
            email: emailByMember.get(r.memberId) ?? "",
          },
          startTime: r.startTime,
          endTime: r.endTime ?? r.startTime,
          status: r.status,
          createdAt: r.startTime,
          ...adminAttendanceCapabilities(r.status),
        }));
      })(),
      withdrawnPending: (async () => {
        const [pending, members] = await Promise.all([
          getWithdrawnPending(),
          getTable("members"),
        ]);
        const byId = new Map(members.map((m) => [m.id, m]));
        return pending.map((w) => ({
          memberId: w.id,
          name: w.name,
          requestedAt: w.requestedAt,
          graceEndsAt: w.deleteAfter,
          holdBy: byId.get(w.id)?.withdrawal?.holdBy ?? null,
        }));
      })(),
      seminarRequests: (async () => {
        const [requests, summaries] = await Promise.all([
          getTable("seminar-requests"),
          directorySummaryIndex(),
        ]);
        return requests
          .filter((r) => r.status === "pending")
          .sort(byCreatedAtAsc)
          .map((r) => adminSeminarRequestItem(r, summaries));
      })(),
      studyRequests: (async () => {
        const [requests, summaries] = await Promise.all([
          getTable("study-requests"),
          directorySummaryIndex(),
        ]);
        return requests
          .filter((r) => r.status === "pending")
          .sort(byCreatedAtAsc)
          .map((r) => adminStudyRequestItem(r, summaries));
      })(),
    }),
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
    kind === "seminar"
      ? sendSeminarStatusNotification
      : sendStudyStatusNotification;
  await send(info.email, member.name, title, status);
}

type Ctx = { request: Request; locals: App.Locals };

/**
 * Reads the ids an action names; each must be present, or the action answers
 * VALIDATION_FAILED before any read. Returns the ids or the failure.
 */
function readIds<K extends string>(data: FormData, ...keys: K[]) {
  const parsed = adminDashboardIdsSchema(...keys).safeParse(
    Object.fromEntries(keys.map((key) => [key, formText(data, key)])),
  );
  return parsed.success
    ? { ids: parsed.data as Record<K, string>, failure: null }
    : {
        ids: null,
        failure: fail(400, {
          error: "VALIDATION_FAILED",
          issues: fieldIssues(parsed.error),
        }),
      };
}

export const actions = {
  approve: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "id");
      if (failure) return failure;
      const { name, email } = await approveApplication(ids.id);
      await sendWelcomeEmail(email, name);
      return {};
    });
  },

  reject: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "id");
      if (failure) return failure;
      // The removed row is the only copy of the address — mail with the return
      // value or never (review M4).
      const { email, name } = await rejectApplication(ids.id);
      await sendApplicationRejectedEmail(email, name);
      return {};
    });
  },

  activateEvent: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "id");
      if (failure) return failure;
      await setEventStatus(ids.id, "active");
      return {};
    });
  },

  expireEvent: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "id");
      if (failure) return failure;
      await setEventStatus(ids.id, "expired");
      return {};
    });
  },

  deleteEvent: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "id");
      if (failure) return failure;
      await deleteEventChecked(ids.id);
      return {};
    });
  },

  /** BE-55: correct a mistyped event without touching its lifecycle. */
  updateEvent: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      // The ledger posts start/end; the schema (and its issue keys, which the
      // ledger renders) names them startsAtLocal/endsAtLocal.
      const values = {
        title: formText(data, "title"),
        type: formText(data, "type"),
        startsAtLocal: formText(data, "start"),
        endsAtLocal: formText(data, "end"),
      };
      const { ids, failure } = readIds(data, "id");
      const parsed = adminEventInputSchema.safeParse(values);
      if (failure || !parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: {
            ...(parsed.success ? {} : fieldIssues(parsed.error)),
            ...(failure ? failure.data.issues : {}),
          },
          values,
        });
      }
      const { id } = ids;
      const { title, type, startsAtLocal, endsAtLocal } = parsed.data;
      await mutate("events", (rows) => {
        const idx = rows.findIndex((e) => e.id === id);
        if (idx === -1) throw new AppError("NOT_FOUND");
        rows[idx] = {
          ...rows[idx],
          title,
          type,
          date: {
            start: kstInputToIso(startsAtLocal),
            end: endsAtLocal ? kstInputToIso(endsAtLocal) : null,
          },
        };
        return rows;
      });
      return {};
    });
  },

  approveAttendance: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "eventId", "id");
      if (failure) return failure;
      await approveAttendance(ids.eventId, ids.id);
      return {};
    });
  },

  rejectAttendance: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "eventId", "id");
      if (failure) return failure;
      await rejectAttendance(ids.eventId, ids.id);
      return {};
    });
  },

  updateAttendanceTime: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      // The queue posts startTime/endTime; the schema (and the issue keys the
      // queue renders) names them startTimeLocal/endTimeLocal.
      const values = {
        startTimeLocal: formText(data, "startTime"),
        endTimeLocal: formText(data, "endTime"),
      };
      const { ids, failure } = readIds(data, "eventId", "id");
      const parsed = adminAttendanceTimeInputSchema.safeParse(values);
      if (failure || !parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: {
            ...(parsed.success ? {} : fieldIssues(parsed.error)),
            ...(failure ? failure.data.issues : {}),
          },
          values,
        });
      }
      await updateAttendanceTime(ids.eventId, ids.id, {
        startTime: kstInputToIso(parsed.data.startTimeLocal),
        endTime: kstInputToIso(parsed.data.endTimeLocal),
      });
      return {};
    });
  },

  deleteAttendanceRecord: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "eventId", "id");
      if (failure) return failure;
      await deleteAttendanceRecord(ids.eventId, ids.id);
      return {};
    });
  },

  approveSeminar: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "id");
      if (failure) return failure;
      // 승인은 이제 일정 미정 세미나만 만든다 — 전 회원 공지는 공개 시점이다.
      const req = await approveSeminar(ids.id);
      await notifyMember(req.presenterIds[0], "seminar", req.title, "approved");
      return {};
    });
  },

  rejectSeminar: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "id");
      if (failure) return failure;
      const req = await rejectSeminar(ids.id);
      await notifyMember(req.presenterIds[0], "seminar", req.title, "rejected");
      return {};
    });
  },

  /** ADM-16: study proposal approval — the requester becomes the organizer. */
  approveStudy: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "id");
      if (failure) return failure;
      const req = await approveStudy(ids.id);
      await notifyMember(req.requesterId, "study", req.title, "approved");
      return {};
    });
  },

  rejectStudy: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const { ids, failure } = readIds(data, "id");
      if (failure) return failure;
      const req = await rejectStudy(ids.id);
      await notifyMember(req.requesterId, "study", req.title, "rejected");
      return {};
    });
  },
};
