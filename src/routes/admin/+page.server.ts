import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import {
  adminAttendanceTimeInputSchema,
  adminDashboardIdSchema,
  adminEventInputSchema,
  adminFormIssues,
  localAdminDateTimeToIso,
} from "$lib/domain/admin-dashboard";
import { ensureAdmin } from "$lib/server/auth-guards";
import {
  approveDevApplication,
  approveDevAttendance,
  deleteDevAttendance,
  deleteDevEvent,
  getDevAdminDashboard,
  rejectDevApplication,
  rejectDevAttendance,
  setDevEventStatus,
  updateDevAttendanceTime,
  updateDevEvent,
} from "$lib/server/dev-admin-dashboard-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

function formValue(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function requirePreview(
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    throw error(503, "새 운영 API 연결이 필요합니다.");
  }
}

async function authorize(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  await ensureAdmin(locals, { silent: true });
  requirePreview(url, cookies);
}

function parseId(formData: FormData) {
  return adminDashboardIdSchema.safeParse(formValue(formData, "id"));
}

function parseAttendanceTarget(formData: FormData) {
  const eventId = adminDashboardIdSchema.safeParse(
    formValue(formData, "eventId"),
  );
  const queueId = adminDashboardIdSchema.safeParse(
    formValue(formData, "queueId"),
  );
  return eventId.success && queueId.success
    ? { success: true as const, eventId: eventId.data, queueId: queueId.data }
    : { success: false as const };
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await authorize(locals, url, cookies);
  return { dashboard: getDevAdminDashboard() };
};

export const actions: Actions = {
  approve: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const parsed = parseId(await request.formData());
    if (!parsed.success) return fail(400, { error: "잘못된 가입 신청입니다." });
    if (!approveDevApplication(parsed.data))
      return fail(404, { error: "가입 신청을 찾을 수 없습니다." });
    return {
      success: true,
      operation: "applicationApproved" as const,
      applicationId: parsed.data,
      mailFailed: false,
    };
  },

  reject: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const parsed = parseId(await request.formData());
    if (!parsed.success) return fail(400, { error: "잘못된 가입 신청입니다." });
    if (!rejectDevApplication(parsed.data))
      return fail(404, { error: "가입 신청을 찾을 수 없습니다." });
    return {
      success: true,
      operation: "applicationRejected" as const,
      applicationId: parsed.data,
      mailFailed: false,
    };
  },

  activateEvent: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const parsed = parseId(await request.formData());
    if (!parsed.success) return fail(400, { error: "잘못된 이벤트입니다." });
    const event = setDevEventStatus(parsed.data, "active");
    if (!event)
      return fail(409, { error: "현재 상태에서는 이벤트를 열 수 없습니다." });
    return { success: true, operation: "eventActivated" as const, event };
  },

  expireEvent: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const parsed = parseId(await request.formData());
    if (!parsed.success) return fail(400, { error: "잘못된 이벤트입니다." });
    const event = setDevEventStatus(parsed.data, "expired");
    if (!event)
      return fail(409, { error: "현재 상태에서는 이벤트를 닫을 수 없습니다." });
    return { success: true, operation: "eventExpired" as const, event };
  },

  updateEvent: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const formData = await request.formData();
    const eventId = adminDashboardIdSchema.safeParse(formValue(formData, "id"));
    const parsed = adminEventInputSchema.safeParse({
      title: formValue(formData, "title"),
      type: formValue(formData, "type"),
      startsAtLocal: formValue(formData, "startsAtLocal"),
      endsAtLocal: formValue(formData, "endsAtLocal"),
    });
    if (!eventId.success || !parsed.success) {
      return fail(400, {
        error: "입력값을 확인해 주세요.",
        issues: parsed.success ? {} : adminFormIssues(parsed.error),
      });
    }
    const event = updateDevEvent(eventId.data, {
      title: parsed.data.title,
      type: parsed.data.type,
      startsAt: localAdminDateTimeToIso(parsed.data.startsAtLocal),
      endsAt: parsed.data.endsAtLocal
        ? localAdminDateTimeToIso(parsed.data.endsAtLocal)
        : null,
    });
    if (!event) return fail(404, { error: "이벤트를 찾을 수 없습니다." });
    return { success: true, operation: "eventUpdated" as const, event };
  },

  deleteEvent: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const parsed = parseId(await request.formData());
    if (!parsed.success) return fail(400, { error: "잘못된 이벤트입니다." });
    const result = deleteDevEvent(parsed.data);
    if (!result.success) {
      return fail(result.error === "CONFLICT" ? 409 : 404, {
        error:
          result.error === "CONFLICT"
            ? "승인 대기 출석이 있어 이벤트를 삭제할 수 없습니다. 먼저 출석을 처리해 주세요."
            : "이벤트를 찾을 수 없습니다.",
      });
    }
    return {
      success: true,
      operation: "eventDeleted" as const,
      eventId: parsed.data,
    };
  },

  approveAttendance: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const parsed = parseAttendanceTarget(await request.formData());
    if (!parsed.success) return fail(400, { error: "잘못된 출석 기록입니다." });
    const attendance = approveDevAttendance(parsed.eventId, parsed.queueId);
    if (!attendance)
      return fail(404, { error: "출석 기록을 찾을 수 없습니다." });
    return {
      success: true,
      operation: "attendanceApproved" as const,
      attendance,
    };
  },

  rejectAttendance: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const parsed = parseAttendanceTarget(await request.formData());
    if (!parsed.success) return fail(400, { error: "잘못된 출석 기록입니다." });
    const attendance = rejectDevAttendance(parsed.eventId, parsed.queueId);
    if (!attendance)
      return fail(404, { error: "출석 기록을 찾을 수 없습니다." });
    return {
      success: true,
      operation: "attendanceRejected" as const,
      attendance,
    };
  },

  updateAttendanceTime: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const formData = await request.formData();
    const target = parseAttendanceTarget(formData);
    const parsed = adminAttendanceTimeInputSchema.safeParse({
      startTimeLocal: formValue(formData, "startTimeLocal"),
      endTimeLocal: formValue(formData, "endTimeLocal"),
    });
    if (!target.success || !parsed.success) {
      return fail(400, {
        error: "입력값을 확인해 주세요.",
        issues: parsed.success ? {} : adminFormIssues(parsed.error),
      });
    }
    const attendance = updateDevAttendanceTime(
      target.eventId,
      target.queueId,
      localAdminDateTimeToIso(parsed.data.startTimeLocal),
      localAdminDateTimeToIso(parsed.data.endTimeLocal),
    );
    if (!attendance)
      return fail(404, { error: "출석 기록을 찾을 수 없습니다." });
    return {
      success: true,
      operation: "attendanceUpdated" as const,
      attendance,
    };
  },

  deleteAttendanceRecord: async ({ request, locals, url, cookies }) => {
    await authorize(locals, url, cookies);
    const parsed = parseAttendanceTarget(await request.formData());
    if (!parsed.success) return fail(400, { error: "잘못된 출석 기록입니다." });
    if (!deleteDevAttendance(parsed.eventId, parsed.queueId))
      return fail(404, { error: "출석 기록을 찾을 수 없습니다." });
    return {
      success: true,
      operation: "attendanceDeleted" as const,
      attendanceId: parsed.queueId,
    };
  },
};
