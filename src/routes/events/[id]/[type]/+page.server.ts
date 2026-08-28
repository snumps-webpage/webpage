import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import { ensureSession } from "$lib/server/auth-guards";
import {
  getDevAccountSettings,
  getDevDashboardProfile,
} from "$lib/server/dev-member-fixtures";
import {
  getDevCheckInEvent,
  recordDevCheckIn,
} from "$lib/server/dev-presenter-event-fixtures";
import {
  getDevStudyCheckInEvent,
  recordDevStudyCheckIn,
} from "$lib/server/dev-study-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

function resolveCheckIn(pathId: string, attendCode: string) {
  const seminar = getDevCheckInEvent(pathId, attendCode);
  if (seminar) {
    return {
      source: "seminar" as const,
      event: seminar.event,
      context: {
        primaryLabel: "발표자",
        primaryValue: seminar.context.presenterNames.join(", "),
        secondaryLabel: "장소",
        secondaryValue: seminar.context.location,
      },
    };
  }
  const study = getDevStudyCheckInEvent(pathId, attendCode);
  if (!study) return null;
  return {
    source: "study" as const,
    event: study.event,
    context: {
      primaryLabel: "스터디",
      primaryValue: study.context.studyTitle,
      secondaryLabel: "회차",
      secondaryValue: `${study.context.sessionTitle} · ${study.context.semester}`,
    },
  };
}

export const load: PageServerLoad = async ({
  params,
  locals,
  url,
  cookies,
}) => {
  const session = await ensureSession(locals, url);
  const previewRole = resolveDevPreviewRole(url, cookies);
  if (!dev || !previewRole) {
    throw error(503, "새 출석 API 연결이 필요합니다.");
  }

  const preview = resolveCheckIn(params.id, params.type);
  if (!preview) throw error(404, "Event not found");
  if (preview.event.status !== "active") {
    throw error(403, "Event is not active");
  }
  return {
    event: preview.event,
    context: preview.context,
    user: session.user,
    actionType: "attend",
  };
};

export const actions: Actions = {
  attend: async ({ params, locals, url, cookies }) => {
    const previewRole = resolveDevPreviewRole(url, cookies);
    if (!dev || !previewRole) {
      await ensureSession(locals, url);
      return fail(503, { error: "새 출석 API 연결이 필요합니다." });
    }

    await ensureSession(locals, url);
    const account = getDevAccountSettings(previewRole);
    const preview = resolveCheckIn(params.id, params.type);
    if (!account || !preview || preview.event.status !== "active") {
      return fail(404, { error: "NOT_FOUND" });
    }
    const profile = getDevDashboardProfile(previewRole);
    const member = {
      id: account.memberId,
      name: profile?.name ?? account.name,
      department: profile?.department ?? "소속 미입력",
      email: account.email,
    };
    const result =
      preview.source === "seminar"
        ? recordDevCheckIn(preview.event.id, member)
        : recordDevStudyCheckIn(preview.event.id, member);
    if (!result) return fail(409, { error: "EVENT_NOT_OPEN" });
    if (!result.isNew) return fail(409, { error: "이미 출석을 요청했습니다." });
    return { success: true, operation: "attendanceRequested" as const };
  },
};
