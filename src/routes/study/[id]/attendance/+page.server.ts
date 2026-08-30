import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import { mergeStudyAttendance, studyIdSchema } from "$lib/domain/studies";
import { ensureSession } from "$lib/server/auth-guards";
import {
  getDevStudyAttendanceData,
  getDevStudyAttendeeIds,
  getDevStudyDetail,
  saveDevStudyAttendance,
} from "$lib/server/dev-study-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

async function requireOrganizerPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
  studyId: string,
) {
  await ensureSession(locals, url);
  if (!dev) throw error(503, "새 스터디 출석 API 연결이 필요합니다.");
  if (resolveDevPreviewRole(url, cookies) !== "member") {
    throw error(404, "Not Found");
  }
  if (!getDevStudyDetail(studyId)?.canManage) {
    throw error(404, "스터디를 찾을 수 없습니다.");
  }
}

function stringEntries(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .filter((entry): entry is string => typeof entry === "string");
}

export const load: PageServerLoad = async ({
  locals,
  url,
  cookies,
  params,
}) => {
  await requireOrganizerPreview(locals, url, cookies, params.id);
  const attendance = getDevStudyAttendanceData(
    url.searchParams.get("event"),
    params.id,
  );
  if (!attendance) throw error(404, "출석 회차를 찾을 수 없습니다.");
  return { attendance };
};

export const actions: Actions = {
  saveAttendance: async ({ request, locals, url, cookies, params }) => {
    await requireOrganizerPreview(locals, url, cookies, params.id);
    const formData = await request.formData();
    const eventEntry = formData.get("eventId");
    const eventId = typeof eventEntry === "string" ? eventEntry : "";
    if (!studyIdSchema.safeParse(eventId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }

    const current = getDevStudyAttendanceData(eventId, params.id);
    if (!current || current.selectedSession.eventId !== eventId) {
      return fail(404, { error: "NOT_FOUND" });
    }
    if (!current.canSave) {
      return fail(409, {
        error: "종료된 스터디의 출석부는 수정할 수 없습니다.",
      });
    }

    const submitted = stringEntries(formData, "attendeeIds");
    const merged = mergeStudyAttendance(
      getDevStudyAttendeeIds(eventId),
      submitted,
      current.attendees.map((member) => member.id),
    );
    if (!merged.success) return fail(400, merged);

    saveDevStudyAttendance(eventId, merged.attendeeIds);
    return {
      success: true,
      operation: "attendanceSaved" as const,
      eventId,
      attendeeIds: merged.attendeeIds,
    };
  },
};
