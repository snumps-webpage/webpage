import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { fail } from "@sveltejs/kit";
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
  zodFieldIssues,
} from "$lib/domain/admin-records";
import { formText } from "$lib/domain/form-data";
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
  const kindOf = (sourceRequestId: string | null) =>
    (sourceRequestId ? "irregular" : "regular") as "regular" | "irregular";

  return {
    dashboard: {
      requests: requests
        .filter((r) => r.status === "pending")
        .sort(byCreatedAtAsc)
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
        // 공개됐는데 공지 앵커가 비어 있다 = 메일이 실패하고 되돌려진 상태.
        canResendNotice:
          s.publicationStatus === "published" && s.announcedAt === null,
        // 이미 시작됐는지는 화면이 **누르는 시각**으로 판단한다. 로드 시점의
        // 계산을 실어 보내면 그 사이에 시작 시각이 지난 세미나가 두 번째 확인
        // 없이 전송되고, 서버가 거절하는데 화면은 이유를 모른다.
        canCancel: s.publicationStatus !== "cancelled",
        canReapplyCancel: s.publicationStatus === "cancelled",
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

const parseIds = (raw: string | null) =>
  raw
    ? [
        ...new Set(
          raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ]
    : [];

/**
 * The record editor posts `semester`/`note`; the schema names them
 * term/description — the keys the editor renders issues and values under.
 */
function parseSeminarRecord(data: FormData) {
  const values = {
    title: formText(data, "title"),
    term: formText(data, "semester"),
    description: formText(data, "note"),
    externalPresenters: formText(data, "externalPresenters"),
  };
  const parsed = adminSeminarRecordSchema.safeParse(values);
  if (parsed.success) return { success: true as const, data: parsed.data };
  return {
    success: false as const,
    fail: (scope: "record-create" | "record-update", id?: string) =>
      fail(400, {
        error: "VALIDATION_FAILED",
        scope,
        id,
        issues: zodFieldIssues(parsed.error),
        values: {
          ...values,
          kind: formText(data, "kind"),
          durationMinutes: formText(data, "durationMinutes"),
          prerequisites: formText(data, "prerequisites"),
        },
        presenterIds: parseIds(data.get("presenterIds") as string),
      }),
  };
}

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
      const { activityId, eventId, mailFailed, cancelledDuringPublish } =
        await publishSeminar(seminarId);
      // 공개 도중 취소가 이겼다면 공개는 성립하지 않았다 — 성공 문구를 띄우면
      // 보드는 "취소"로 새로 그려지는데 알림만 "공개했습니다"라고 말한다.
      if (cancelledDuringPublish) {
        return { operation: "cancelled", seminarId, mailFailed: false };
      }
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
    return handleAdminAction(locals, async () => {
      const parsed = parseSeminarRecord(data);
      if (!parsed.success) return parsed.fail("record-create");
      const { title, term, description, externalPresenters } = parsed.data;
      await createSeminar(
        {
          title,
          semester: term,
          note: description,
          presenterIds: parseIds(data.get("presenterIds") as string),
          externalPresenters,
        },
        (data.get("posterPendingKey") as string) || "",
      );
      return { operation: "seminarRecordCreated" };
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const parsed = parseSeminarRecord(data);
      if (!parsed.success) return parsed.fail("record-update", id);
      const { title, term, description, externalPresenters } = parsed.data;
      await updateSeminar(
        id,
        {
          title,
          semester: term,
          // 편집기가 보내지 않는 칸은 그대로 둔다 — 빈 값으로 지우지 않는다.
          note: data.has("note") ? description : undefined,
          presenterIds: data.get("presenterIds")
            ? parseIds(data.get("presenterIds") as string)
            : undefined,
          externalPresenters: data.has("externalPresenters")
            ? externalPresenters
            : undefined,
        },
        (data.get("posterPendingKey") as string) || "",
      );
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
    return handleAdminAction(locals, async () => {
      const field = data.get("field") as "materials" | "photos";
      if (field !== "materials" && field !== "photos")
        throw new AppError("VALIDATION_FAILED");
      await setSeminarFiles(data.get("id") as string, field, {
        remove: data.get("s3Key") as string,
      });
      return { operation: "seminarFileRemoved" };
    });
  },
};
