import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { fail, isActionFailure, type ActionFailure } from "@sveltejs/kit";
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
import { currentTerm } from "$lib/server/core/semester";
import { kstInputToIso, nowKstIso } from "$lib/server/core/time";
import {
  adminSeminarRequestItem,
  contentFileFromKey,
  directorySummaryIndex,
  byCreatedAtAsc,
} from "$lib/server/data/admin-queue-views";
import { validateSeminarScheduleForm } from "$lib/domain/admin-seminars";
import {
  adminSeminarRecordSchema,
  type AdminRecordActionScope,
} from "$lib/domain/admin-records";
import { formText, fieldIssues } from "$lib/domain/form-data";
import {
  cancelSeminar,
  publishSeminar,
  scheduleSeminar,
  updateSeminarSchedule,
} from "$lib/server/services/seminars";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  // members(=memberPickers)는 발표자 지정용 운영 명단, summaries는 표시용
  // 통합 디렉터리 — 이주된 세미나의 presenterIds는 legacy id다.
  const [seminars, members, requests, events, summaries] = await Promise.all([
    getTable("seminars"),
    memberPickers(),
    getTable("seminar-requests"),
    getTable("events"),
    directorySummaryIndex(),
  ]);
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const rows = [...seminars].reverse().map((s) => {
    const request = s.sourceRequestId
      ? requestById.get(s.sourceRequestId)
      : undefined;
    const event =
      events.find(
        (e) => s.sourceRequestId && e.sourceRequestId === s.sourceRequestId,
      ) ??
      (s.activityId
        ? events.find((e) => e.activityId === s.activityId)
        : undefined);
    return { s, request, event };
  });
  const presenterOf = (id: string) =>
    summaries.get(id) ?? { id, name: "알 수 없음", department: "" };
  // 구분·소요 시간·선수지식은 세미나에 저장된 값이다 (#7, #12). 예전에는 구분을
  // sourceRequestId 유무로 추측했고(신청 → 비정기), 소요 시간은 신청서의 자유
  // 서술을 숫자로 읽다 실패하면 60분을 지어냈다.
  const durationLabel = (
    minutes: number | null,
    requestText: string | undefined,
  ) => (minutes !== null ? `${minutes}분` : (requestText ?? ""));

  return {
    dashboard: {
      requests: requests
        .filter((r) => r.status === "pending")
        .sort(byCreatedAtAsc)
        .map((r) => adminSeminarRequestItem(r, summaries)),
      seminars: rows.map(({ s, request, event }) => ({
        id: s.id,
        sourceRequestId: s.sourceRequestId ?? "",
        kind: s.kind,
        title: s.title,
        description: s.note,
        prerequisites: s.prerequisites,
        duration: durationLabel(s.durationMinutes, request?.duration),
        attachmentUrl: request?.attachment || null,
        presenters: s.presenterIds.map(presenterOf),
        // 저장된 상태가 권위다. 예전에는 `activityId` 유무로 추측해서, 승인만
        // 된 세미나와 이주된 기록이 모두 "공개됨"으로 보였다.
        publicationStatus: s.publicationStatus,
        // 일정도 마찬가지 — 장소는 event에 없으므로 세미나 행에만 있다.
        schedule: s.schedule,
        activityId: s.activityId,
        eventId: event?.id ?? null,
        canSchedule:
          s.publicationStatus === "unscheduled" ||
          s.publicationStatus === "scheduled" ||
          s.publicationStatus === "published",
        canPublish: s.publicationStatus === "scheduled" && s.schedule !== null,
        // 공개됐는데 공지가 나가지 않았고 아직 열리지 않았다 = 보낼 공지가 남았다
        // (메일 실패로 되돌려졌거나, 이주분처럼 알린 적이 없다). 이미 시작된
        // 세미나에는 공지가 없다 — 버튼을 띄우면 이주 세미나 전부에 뜬다.
        // 공지 대상이 아닌 직접 기록에는 보낼 공지가 없다 (#21).
        canResendNotice:
          s.announce &&
          s.publicationStatus === "published" &&
          s.announcedAt === null &&
          s.schedule !== null &&
          Date.parse(s.schedule.startsAt) > Date.now(),
        // 이미 시작됐는지는 화면이 **누르는 시각**으로 판단한다. 로드 시점의
        // 계산을 실어 보내면 그 사이에 시작 시각이 지난 세미나가 두 번째 확인
        // 없이 전송되고, 서버가 거절하는데 화면은 이유를 모른다.
        canCancel: s.publicationStatus !== "cancelled",
        canReapplyCancel: s.publicationStatus === "cancelled",
      })),
      generatedAt: nowKstIso(),
    },
    records: rows.map(({ s, event }) => ({
      id: s.id,
      sourceRequestId: s.sourceRequestId,
      kind: s.kind,
      title: s.title,
      term: s.semester,
      description: s.description,
      note: s.note,
      prerequisites: s.prerequisites,
      durationMinutes: s.durationMinutes,
      preferredTiming: s.preferredTiming,
      presenterIds: s.presenterIds,
      presenterNames: s.presenterIds.map((id) => presenterOf(id).name),
      scheduledAt: s.schedule?.startsAt ?? event?.date.start ?? null,
      endsAt: s.schedule?.endsAt ?? event?.date.end ?? null,
      location: s.schedule?.location ?? null,
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

const parseIds = (data: FormData) => [
  ...new Set(
    data
      .getAll("presenterIds")
      .filter((value): value is string => typeof value === "string")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  ),
];

/**
 * The editor's semester is rendered as term; description and note remain
 * independent, including explicit empty values.
 */
function seminarValues(data: FormData) {
  return {
    title: formText(data, "title"),
    term: formText(data, "semester"),
    description: formText(data, "description"),
    note: formText(data, "note"),
    externalPresenters: formText(data, "externalPresenters"),
    kind: formText(data, "kind"),
    durationMinutes: formText(data, "durationMinutes"),
    prerequisites: formText(data, "prerequisites"),
  };
}

/** Enrich failures after the unchanged auth/error wrapper has classified them. */
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

/** A field the editor did not send is left as stored — never cleared. */
const sent = <T>(data: FormData, field: string, value: T) =>
  data.has(field) ? value : undefined;

export const actions = {
  /** 일정 확정 — UI(SeminarScheduleDialog)가 보내는 필드를 도메인 검증에 그대로 태운다. */
  scheduleSeminar: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const seminarId = data.get("seminarId") as string;
      if (!seminarId) throw new AppError("VALIDATION_FAILED");
      const parsed = validateSeminarScheduleForm(data);
      // fail()로 감싸지 않으면 runAction이 `status`가 없는 객체를 성공으로
      // 포장한다 — 다이얼로그가 저장된 것처럼 닫히고 오류 문구는 화면에
      // 도달하지 못한다(실측).
      if (!parsed.success) return fail(400, parsed.failure);

      // 이주된 세미나는 원본에 시각이 없어 `startTime: null`이다. 장소만 고치려고
      // 일정 수정을 열었을 때 다이얼로그가 채워 보낸 자정이 **시각으로 굳으면**
      // 공개 화면이 "오전 12:00"이라는 없던 사실을 말한다. 그래서 화면이 "시각
      // 미정"을 명시적으로 보낼 수 있고, 그때는 날짜만 남긴다.
      const timeUnknown = data.get("startTimeUnknown") === "yes";
      const dateOnly = `${parsed.data.startsAtLocal.slice(0, 10)}T00:00`;
      const schedule = {
        startsAt: kstInputToIso(
          timeUnknown ? dateOnly : parsed.data.startsAtLocal,
        ),
        startTime: timeUnknown ? null : parsed.data.startsAtLocal.slice(11, 16),
        // 시작 시각을 모르는데 종료 시각만 있는 일정은 앞뒤가 맞지 않는다.
        endsAt:
          !timeUnknown && parsed.data.endsAtLocal
            ? kstInputToIso(parsed.data.endsAtLocal)
            : null,
        location: parsed.data.location,
      };
      // 공개된 세미나의 일정 변경은 활동·이벤트까지 함께 맞춰야 한다 —
      // 이주로 일정을 잃은 레거시 행을 고치는 입구이기도 하다.
      const seminar = (await getTable("seminars")).find(
        (s) => s.id === seminarId,
      );
      if (!seminar) throw new AppError("NOT_FOUND");
      let mailFailed = false;
      if (seminar.publicationStatus === "published") {
        ({ mailFailed } = await updateSeminarSchedule(seminarId, schedule));
      } else {
        await scheduleSeminar(seminarId, schedule);
      }
      return { operation: "scheduled", seminarId, schedule, mailFailed };
    });
  },

  /** 공개 — 활동·출석 이벤트를 만들고 전 회원에게 알린다. */
  publishSeminar: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const seminarId = data.get("seminarId") as string;
      if (!seminarId) throw new AppError("VALIDATION_FAILED");
      const { activityId, eventId, mailFailed } =
        await publishSeminar(seminarId);
      return {
        operation: "published",
        seminarId,
        activityId,
        eventId,
        mailFailed,
      };
    });
  },

  /** 취소 — 기록은 남기고 회원·공개 면에서만 사라진다. */
  cancelSeminar: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const seminarId = data.get("seminarId") as string;
      if (!seminarId) throw new AppError("VALIDATION_FAILED");
      // 이미 시작된 세미나를 지우는 것은 되돌릴 수 없다 — 두 번째 확인을
      // 폼에서 받아 서버가 검사한다(대화상자만으로는 보장이 되지 않는다).
      const { mailFailed } = await cancelSeminar(seminarId, {
        memberId: locals.member?.memberId ?? "",
        isAdmin: true,
        acknowledgeStarted: data.get("acknowledgeStarted") === "yes",
      });
      return { operation: "cancelled", seminarId, mailFailed };
    });
  },

  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const values = seminarValues(data);
    const presenterIds = parseIds(data);
    return recordAction(
      locals,
      "record-create",
      "",
      values,
      async () => {
        const parsed = adminSeminarRecordSchema.safeParse(values);
        if (!parsed.success)
          return fail(400, {
            error: "VALIDATION_FAILED",
            issues: fieldIssues(parsed.error),
          });
        const {
          title,
          term,
          description,
          note,
          externalPresenters,
          ...fields
        } = parsed.data;
        const created = await createSeminar(
          {
            title,
            semester: term,
            description,
            note,
            presenterIds,
            externalPresenters,
            kind: fields.kind,
            durationMinutes: fields.durationMinutes,
            prerequisites: fields.prerequisites,
          },
          (data.get("posterPendingKey") as string) || "",
        );
        return { operation: "seminarRecordCreated", id: created.id };
      },
      { presenterIds },
    );
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = seminarValues(data);
    const presenterIds = parseIds(data);
    return recordAction(
      locals,
      "record-update",
      id,
      values,
      async () => {
        const parsed = adminSeminarRecordSchema.safeParse(values);
        if (!parsed.success)
          return fail(400, {
            error: "VALIDATION_FAILED",
            issues: fieldIssues(parsed.error),
          });
        const {
          title,
          term,
          description,
          note,
          externalPresenters,
          ...fields
        } = parsed.data;
        await updateSeminar(
          id,
          {
            title,
            semester: term,
            // 편집기가 보내지 않는 칸은 그대로 둔다 — 빈 값으로 지우지 않는다.
            description: sent(data, "description", description),
            note: sent(data, "note", note),
            presenterIds: sent(data, "presenterIds", presenterIds),
            externalPresenters: sent(
              data,
              "externalPresenters",
              externalPresenters,
            ),
            kind: sent(data, "kind", fields.kind),
            durationMinutes: sent(
              data,
              "durationMinutes",
              fields.durationMinutes,
            ),
            prerequisites: sent(data, "prerequisites", fields.prerequisites),
          },
          (data.get("posterPendingKey") as string) || "",
        );
        return { operation: "seminarRecordUpdated" };
      },
      { presenterIds },
    );
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = formText(await request.formData(), "id");
    return recordAction(locals, "record-delete", id, {}, async () => {
      await deleteSeminar(id);
      return { operation: "seminarRecordDeleted" };
    });
  },

  /** Registers a pending upload: promote (size/type enforced there) then attach. */
  addFile: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = {
      field: formText(data, "field"),
      pendingKey: formText(data, "pendingKey"),
    };
    return recordAction(locals, "record-file", id, values, async () => {
      const field = data.get("field") as "materials" | "photos";
      if (field !== "materials" && field !== "photos")
        throw new AppError("VALIDATION_FAILED");
      const purpose =
        field === "materials" ? "seminar-material" : "seminar-photo";
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
    const id = formText(data, "id");
    const values = {
      field: formText(data, "field"),
      s3Key: formText(data, "s3Key"),
    };
    return recordAction(locals, "record-file", id, values, async () => {
      const field = data.get("field") as "materials" | "photos";
      if (field !== "materials" && field !== "photos")
        throw new AppError("VALIDATION_FAILED");
      await setSeminarFiles(id, field, {
        remove: data.get("s3Key") as string,
      });
      return { operation: "seminarFileRemoved" };
    });
  },
};
