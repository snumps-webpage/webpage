import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import { z } from "zod";
import {
  adminSeminarRecordSchema,
  zodFieldIssues,
} from "$lib/domain/admin-records";
import {
  seminarSchedulesEqual,
  validateSeminarScheduleForm,
  type AdminSeminarDashboardData,
  type AdminSeminarItem,
  type SeminarSchedule,
} from "$lib/domain/admin-seminars";
import { SEMINAR_KINDS } from "$lib/domain/seminars";
import { ensureAdmin } from "$lib/server/auth-guards";
import {
  getDevAdminSeminarRequest,
  getDevAdminSeminarRequests,
  resolveDevAdminSeminarRequest,
} from "$lib/server/dev-admin-seminar-fixtures";
import {
  publishDevEvent,
  updateDevPublishedEvent,
} from "$lib/server/dev-admin-dashboard-fixtures";
import {
  addDevAdminSeminarFile,
  createDevAdminSeminarRecord,
  deleteDevAdminSeminarRecord,
  getDevAdminSeminarRecords,
  publishDevAdminSeminarRecord,
  removeDevAdminSeminarFile,
  scheduleDevAdminSeminarRecord,
  updateDevAdminSeminarRecord,
} from "$lib/server/dev-admin-record-fixtures";
import { getDevAdminMembers } from "$lib/server/dev-member-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import { validateContentFile } from "$lib/server/upload-validation";
import { getSemesterInfo } from "$lib/utils";
import type { Actions, PageServerLoad } from "./$types";

let seminarFixtures: AdminSeminarItem[] = [
  {
    id: "seminar-unscheduled-1",
    sourceRequestId: "request-approved-1",
    kind: "regular",
    title: "대수위상수학의 기본군과 피복공간",
    description:
      "기본군의 계산과 피복공간의 분류 정리를 구체적인 예제와 함께 살펴봅니다.",
    prerequisites: "점집합 위상수학",
    duration: "90분",
    attachmentUrl: "https://drive.google.com/example-topology",
    presenters: [
      { id: "member-president", name: "김회장", department: "수리과학부" },
    ],
    publicationStatus: "unscheduled",
    schedule: null,
    activityId: null,
    eventId: null,
    canSchedule: true,
    canPublish: false,
  },
  {
    id: "seminar-scheduled-1",
    sourceRequestId: "request-approved-2",
    kind: "irregular",
    title: "수론적 함수와 푸리에 해석",
    description: "산술적 함수의 예와 푸리에 해석을 연결합니다.",
    prerequisites: "복소해석학",
    duration: "75분",
    attachmentUrl: null,
    presenters: [
      { id: "member-editor", name: "이편집", department: "수리과학부" },
    ],
    publicationStatus: "scheduled",
    schedule: {
      startsAt: "2026-09-12T16:00:00+09:00",
      endsAt: "2026-09-12T17:15:00+09:00",
      location: "129동 101호",
    },
    activityId: null,
    eventId: null,
    canSchedule: true,
    canPublish: true,
  },
  {
    id: "seminar-published-1",
    sourceRequestId: "request-approved-3",
    kind: "regular",
    title: "그래프 스펙트럼 입문",
    description: "라플라시안 행렬과 그래프의 구조를 연결합니다.",
    prerequisites: "선형대수",
    duration: "60분",
    attachmentUrl: null,
    presenters: [
      { id: "dev-member", name: "Dev Member", department: "수리과학부" },
    ],
    publicationStatus: "published",
    schedule: {
      startsAt: "2026-09-03T18:30:00+09:00",
      endsAt: "2026-09-03T19:30:00+09:00",
      location: "27동 220호",
    },
    activityId: "activity-seminar-graph",
    eventId: "event-seminar-graph",
    canSchedule: true,
    canPublish: false,
  },
];

const idSchema = z.string().trim().min(1);
const approvalSchema = z.object({
  requestId: idSchema,
  kind: z.enum(SEMINAR_KINDS),
});

function formValue(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function activeMembers() {
  return getDevAdminMembers().filter((member) => member.status !== "withdrawn");
}

function parseRecordInput(formData: FormData) {
  const record = adminSeminarRecordSchema.safeParse({
    title: formValue(formData, "title"),
    term: formValue(formData, "term"),
    kind: formValue(formData, "kind"),
    description: formValue(formData, "description"),
    prerequisites: formValue(formData, "prerequisites"),
    durationMinutes: formValue(formData, "durationMinutes"),
  });
  const memberById = new Map(
    activeMembers().map((member) => [member.id, member]),
  );
  const presenterIds = formData
    .getAll("presenterIds")
    .filter((entry): entry is string => typeof entry === "string");
  const invalidPresenter = presenterIds.some((id) => !memberById.has(id));
  if (!record.success || presenterIds.length === 0 || invalidPresenter) {
    return {
      success: false as const,
      issues: {
        ...(record.success ? {} : zodFieldIssues(record.error)),
        ...(presenterIds.length === 0 || invalidPresenter
          ? { presenterIds: "현재 회원 중 발표자를 한 명 이상 선택해 주세요." }
          : {}),
      },
    };
  }
  return {
    success: true as const,
    data: {
      ...record.data,
      presenterIds: [...new Set(presenterIds)],
      presenterNames: [...new Set(presenterIds)].map(
        (id) => memberById.get(id)?.name ?? id,
      ),
    },
  };
}

function workflowItemFromRecord(
  record: ReturnType<typeof createDevAdminSeminarRecord>,
): AdminSeminarItem {
  const members = new Map(activeMembers().map((member) => [member.id, member]));
  return {
    id: record.id,
    sourceRequestId: record.sourceRequestId ?? `manual-${record.id}`,
    kind: record.kind,
    title: record.title,
    description: record.description,
    prerequisites: record.prerequisites,
    duration: `${record.durationMinutes}분`,
    attachmentUrl: null,
    presenters: record.presenterIds.map((id, index) => ({
      id,
      name: members.get(id)?.name ?? record.presenterNames[index] ?? id,
      department: members.get(id)?.department ?? "학과 기록 없음",
    })),
    publicationStatus: record.eventId
      ? "published"
      : record.scheduledAt
        ? "scheduled"
        : "unscheduled",
    schedule: record.scheduledAt
      ? {
          startsAt: record.scheduledAt,
          endsAt: record.endsAt,
          location: record.location ?? "장소 미정",
        }
      : null,
    activityId: record.activityId,
    eventId: record.eventId,
    canSchedule: true,
    canPublish: !!record.scheduledAt && !record.eventId,
  };
}

function requirePreview(
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    throw error(503, "새 세미나 관리 API 연결이 필요합니다.");
  }
}

function localKstToIso(value: string) {
  return `${value}:00+09:00`;
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await ensureAdmin(locals, { silent: true });
  requirePreview(url, cookies);

  return {
    dashboard: {
      requests: getDevAdminSeminarRequests(),
      seminars: seminarFixtures,
      generatedAt: new Date().toISOString(),
    } satisfies AdminSeminarDashboardData,
    records: getDevAdminSeminarRecords(),
    members: activeMembers().map(({ id, name, department }) => ({
      id,
      name,
      department,
    })),
    currentTerm: getSemesterInfo().key,
  };
};

export const actions: Actions = {
  approveSeminar: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);

    const formData = await request.formData();
    const result = approvalSchema.safeParse({
      requestId: formValue(formData, "requestId"),
      kind: formValue(formData, "kind"),
    });

    if (!result.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: { kind: "세미나 구분을 선택해 주세요." },
      });
    }

    const source = getDevAdminSeminarRequest(result.data.requestId);
    if (!source) return fail(404, { error: "NOT_FOUND" });

    const record = createDevAdminSeminarRecord({
      sourceRequestId: source.id,
      kind: result.data.kind,
      title: source.title,
      term: getSemesterInfo().key,
      description: source.description,
      prerequisites: source.prerequisites || "없음",
      durationMinutes: Number.parseInt(source.duration, 10) || 60,
      presenterIds: source.presenters.map((presenter) => presenter.id),
      presenterNames: source.presenters.map((presenter) => presenter.name),
    });
    const seminar: AdminSeminarItem = {
      id: record.id,
      sourceRequestId: source.id,
      kind: result.data.kind,
      title: source.title,
      description: source.description,
      prerequisites: source.prerequisites,
      duration: source.duration,
      attachmentUrl: source.attachmentUrl,
      presenters: source.presenters,
      publicationStatus: "unscheduled",
      schedule: null,
      activityId: null,
      eventId: null,
      canSchedule: true,
      canPublish: false,
    };
    resolveDevAdminSeminarRequest(source.id, "approved");
    if (!seminarFixtures.some((item) => item.id === seminar.id)) {
      seminarFixtures = [seminar, ...seminarFixtures];
    }

    return {
      success: true,
      operation: "approved" as const,
      requestId: source.id,
      seminar,
      record,
      mailEvent: "approval" as const,
      mailFailed: false,
    };
  },

  rejectSeminar: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);

    const requestId = formValue(await request.formData(), "requestId");
    if (!idSchema.safeParse(requestId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }

    if (!resolveDevAdminSeminarRequest(requestId, "rejected")) {
      return fail(404, { error: "NOT_FOUND" });
    }
    return {
      success: true,
      operation: "rejected" as const,
      requestId,
    };
  },

  scheduleSeminar: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);

    const formData = await request.formData();
    const seminarId = formValue(formData, "seminarId");
    if (!idSchema.safeParse(seminarId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }

    const result = validateSeminarScheduleForm(formData);
    if (!result.success) {
      return fail(400, { ...result.failure, seminarId });
    }

    const schedule: SeminarSchedule = {
      startsAt: localKstToIso(result.data.startsAtLocal),
      endsAt: result.data.endsAtLocal
        ? localKstToIso(result.data.endsAtLocal)
        : null,
      location: result.data.location,
    };
    const existing = seminarFixtures.find((item) => item.id === seminarId);
    if (!existing) return fail(404, { error: "NOT_FOUND" });
    const scheduleChanged = !seminarSchedulesEqual(existing.schedule, schedule);
    const record = scheduleDevAdminSeminarRecord(seminarId, schedule);
    if (!record) return fail(404, { error: "NOT_FOUND" });
    if (existing.eventId) {
      updateDevPublishedEvent(existing.eventId, {
        title: existing.title,
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
      });
    }
    seminarFixtures = seminarFixtures.map((item) =>
      item.id === seminarId
        ? {
            ...item,
            schedule,
            publicationStatus:
              item.publicationStatus === "published"
                ? "published"
                : "scheduled",
            canPublish: item.publicationStatus !== "published",
          }
        : item,
    );

    return {
      success: true,
      operation: "scheduled" as const,
      seminarId,
      schedule,
      mailEvent:
        existing.eventId && scheduleChanged
          ? ("schedule-changed" as const)
          : ("none" as const),
      mailFailed: false,
    };
  },

  publishSeminar: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);

    const seminarId = formValue(await request.formData(), "seminarId");
    if (!idSchema.safeParse(seminarId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }

    const existing = seminarFixtures.find((item) => item.id === seminarId);
    if (!existing?.schedule) return fail(409, { error: "CONFLICT" });
    const activityId = existing.activityId ?? `activity-${seminarId}`;
    const eventId = existing.eventId ?? `event-${seminarId}`;
    publishDevAdminSeminarRecord(seminarId, activityId, eventId);
    publishDevEvent({
      id: eventId,
      activityId,
      title: existing.title,
      type: "세미나",
      startsAt: existing.schedule.startsAt,
      endsAt: existing.schedule.endsAt,
    });
    seminarFixtures = seminarFixtures.map((item) =>
      item.id === seminarId
        ? {
            ...item,
            publicationStatus: "published",
            activityId,
            eventId,
            canPublish: false,
          }
        : item,
    );

    return {
      success: true,
      operation: "published" as const,
      seminarId,
      activityId,
      eventId,
      mailEvent: "schedule-confirmed" as const,
      mailFailed: false,
    };
  },

  create: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);
    const formData = await request.formData();
    const result = parseRecordInput(formData);
    if (!result.success) {
      return fail(400, {
        scope: "record-create" as const,
        issues: result.issues,
        values: Object.fromEntries(
          [
            "title",
            "term",
            "kind",
            "description",
            "prerequisites",
            "durationMinutes",
          ].map((key) => [key, formValue(formData, key)]),
        ),
        presenterIds: formData
          .getAll("presenterIds")
          .filter((entry): entry is string => typeof entry === "string"),
      });
    }
    const record = createDevAdminSeminarRecord(result.data);
    seminarFixtures = [workflowItemFromRecord(record), ...seminarFixtures];
    return {
      success: true,
      operation: "seminarRecordCreated" as const,
      record,
    };
  },

  update: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);
    const formData = await request.formData();
    const id = formValue(formData, "id");
    const result = parseRecordInput(formData);
    if (!idSchema.safeParse(id).success || !result.success) {
      return fail(400, {
        scope: "record-update" as const,
        id,
        issues: result.success
          ? { _form: "세미나 식별자를 확인해 주세요." }
          : result.issues,
      });
    }
    const record = updateDevAdminSeminarRecord(id, result.data);
    if (!record)
      return fail(404, {
        scope: "record-update" as const,
        id,
        error: "NOT_FOUND",
      });
    seminarFixtures = seminarFixtures.map((item) =>
      item.id === id ? workflowItemFromRecord(record) : item,
    );
    return {
      success: true,
      operation: "seminarRecordUpdated" as const,
      record,
    };
  },

  addFile: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);
    const formData = await request.formData();
    const id = formValue(formData, "id");
    const result = validateContentFile(formData.get("file"));
    if (!idSchema.safeParse(id).success || !result.success) {
      return fail(result.success ? 400 : result.status, {
        scope: "record-file" as const,
        id,
        issues: {
          file: result.success
            ? "세미나 식별자를 확인해 주세요."
            : result.message,
        },
      });
    }
    const record = addDevAdminSeminarFile(id, result.file);
    if (!record)
      return fail(404, {
        scope: "record-file" as const,
        id,
        error: "NOT_FOUND",
      });
    return {
      success: true,
      operation: "seminarFileAdded" as const,
      record,
      uploadMode: "dev-metadata-only" as const,
    };
  },

  removeFile: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);
    const formData = await request.formData();
    const id = formValue(formData, "id");
    const fileId = formValue(formData, "fileId");
    const record = removeDevAdminSeminarFile(id, fileId);
    if (!record) return fail(404, { error: "NOT_FOUND" });
    return { success: true, operation: "seminarFileRemoved" as const, record };
  },

  delete: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requirePreview(url, cookies);
    const id = formValue(await request.formData(), "id");
    const result = deleteDevAdminSeminarRecord(id);
    if (result === "conflict")
      return fail(409, {
        scope: "record-delete" as const,
        id,
        error: "CONFLICT",
      });
    if (result === "not_found")
      return fail(404, {
        scope: "record-delete" as const,
        id,
        error: "NOT_FOUND",
      });
    seminarFixtures = seminarFixtures.filter((item) => item.id !== id);
    return { success: true, operation: "seminarRecordDeleted" as const, id };
  },
};
