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
import { currentTerm, SEMESTER_PATTERN } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import {
  adminSeminarRequestItem,
  contentFileFromKey,
  memberSummaryById,
} from "$lib/server/data/admin-queue-views";
import type { SeminarPublicationStatus } from "$lib/domain/admin-seminars";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [seminars, members, requests, events, allMembers] = await Promise.all([
    getTable("seminars"),
    memberPickers(),
    getTable("seminar-requests"),
    getTable("events"),
    getTable("members"),
  ]);
  const summaries = memberSummaryById(allMembers);
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const rows = [...seminars].reverse().map((s) => {
    const request = s.sourceRequestId ? requestById.get(s.sourceRequestId) : undefined;
    const event =
      events.find((e) => s.sourceRequestId && e.sourceRequestId === s.sourceRequestId) ??
      (s.activityId ? events.find((e) => e.activityId === s.activityId) : undefined);
    return { s, request, event };
  });
  const presenterOf = (id: string) =>
    summaries.get(id) ?? { id, name: "알 수 없음", department: "" };
  // Approval creates activity+event in one chain (§7-2), so a linked seminar
  // is already published; there is no separate schedule/publish step here.
  const kindOf = (sourceRequestId: string | null) =>
    (sourceRequestId ? "irregular" : "regular") as "regular" | "irregular";

  return {
    dashboard: {
      requests: requests
        .filter((r) => r.status === "pending")
        .map((r) => adminSeminarRequestItem(r, summaries)),
      seminars: rows.map(({ s, request, event }) => ({
        id: s.id,
        sourceRequestId: s.sourceRequestId ?? "",
        kind: kindOf(s.sourceRequestId),
        title: s.title,
        description: s.note,
        prerequisites: request?.prerequisites ?? "",
        duration: request?.duration ?? "",
        attachmentUrl: request?.attachment || null,
        presenters: s.presenterIds.map(presenterOf),
        publicationStatus: (s.activityId
          ? "published"
          : "unscheduled") as SeminarPublicationStatus,
        schedule: event
          ? { startsAt: event.date.start, endsAt: event.date.end, location: "" }
          : null,
        activityId: s.activityId,
        eventId: event?.id ?? null,
        canSchedule: false,
        canPublish: false,
      })),
      generatedAt: nowKstIso(),
    },
    records: rows.map(({ s, request, event }) => ({
      id: s.id,
      sourceRequestId: s.sourceRequestId,
      kind: kindOf(s.sourceRequestId),
      title: s.title,
      term: s.semester,
      description: s.note,
      prerequisites: request?.prerequisites ?? "",
      durationMinutes: Number.parseInt(request?.duration ?? "", 10) || 60,
      presenterIds: s.presenterIds,
      presenterNames: s.presenterIds.map((id) => presenterOf(id).name),
      scheduledAt: event?.date.start ?? null,
      endsAt: event?.date.end ?? null,
      location: null,
      activityId: s.activityId,
      eventId: event?.id ?? null,
      files: [
        ...s.materials.map((key) => contentFileFromKey(key, "pdf")),
        ...s.photos.map((key) => contentFileFromKey(key, "image")),
      ],
    })),
    members,
    currentTerm: currentTerm(),
  };
};

type Ctx = { request: Request; locals: App.Locals };

const parseIds = (raw: string | null) =>
  raw ? [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))] : [];

function requireTerm(raw: string): string {
  if (!SEMESTER_PATTERN.test(raw)) throw new AppError("VALIDATION_FAILED");
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
      return { operation: "seminarRecordCreated" };
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
      return { operation: "seminarRecordUpdated" };
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await deleteSeminar(id);
      return { operation: "seminarRecordDeleted" };
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
      return { s3Key: finalKey, operation: "seminarFileAdded" };
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
      return { operation: "seminarFileRemoved" };
    });
  },
};
