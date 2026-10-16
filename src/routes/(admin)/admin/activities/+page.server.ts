import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { recordPickers } from "$lib/server/data/repos";
import {
  directorySummaryIndex,
  formerPeople,
} from "$lib/server/data/admin-queue-views";
import {
  createActivity,
  deleteActivity,
  sessionStudyOf,
  setActivityStudy,
  setAttendees,
  updateActivity,
} from "$lib/server/services/records-admin";
import { compareSemesters } from "$lib/domain/semester-order";
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
  const [activities, members, events, summaries, studies] = await Promise.all([
    getTable("activities"),
    recordPickers(),
    getTable("events"),
    directorySummaryIndex(),
    getTable("studies"),
  ]);
  return {
    activities: [...activities].reverse().map((a) => ({
      ...a,
      // Referential-integrity hint for the delete row (deleteActivity CONFLICTs).
      linkedEventIds: events
        .filter((e) => e.activityId === a.id)
        .map((e) => e.id),
      // 스터디 회차 활동은 그 회차의 스터디에 고정 — 연결 선택 칸을 숨긴다(D-000088).
      sessionStudyId: sessionStudyOf(a.id, events),
      // 이주된 출석(legacy id)·탈퇴 회원 — 명단에 없어도 체크된 채 보존한다.
      formerAttendees: formerPeople(a.attendeeIds, members, summaries),
    })),
    members,
    // 스터디 연결 선택지(D-000053) — 최근 학기 먼저, 학기 안에서는 제목순.
    studies: studies
      .map((s) => ({ id: s.id, title: s.title, semester: s.semester }))
      .sort(
        (a, b) =>
          compareSemesters(b.semester, a.semester) ||
          a.title.localeCompare(b.title, "ko"),
      ),
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
        // 비활성화된 종류 칸(스터디 연결 활동)은 보내지지 않는다 — 변경 아님(D-000107)
        type: type || undefined,
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

  /** Links a study-type activity to a study; an empty studyId unlinks it. */
  setStudy: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await setActivityStudy(
        data.get("id") as string,
        formText(data, "studyId") || null,
      );
      return { operation: "studyLinked" };
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
