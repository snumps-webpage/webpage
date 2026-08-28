import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import {
  managedEventIdSchema,
  mergeManagedAttendance,
} from "$lib/domain/attendance";
import { ensureSession } from "$lib/server/auth-guards";
import { getDevAccountSettings } from "$lib/server/dev-member-fixtures";
import {
  getDevPresenterEventAttendeeIds,
  getDevPresenterEventManagement,
  getDevPresenterEventSummaries,
  saveDevPresenterEventAttendance,
} from "$lib/server/dev-presenter-event-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

async function requireMemberPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  await ensureSession(locals, url);
  if (!dev) throw error(503, "새 발표자 출석 관리 API 연결이 필요합니다.");
  const role = resolveDevPreviewRole(url, cookies);
  if (!role) throw error(404, "Not Found");
  const account = getDevAccountSettings(role);
  if (!account || account.status === "withdrawn") {
    throw error(404, "Not Found");
  }
  return account;
}

function stringEntries(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .filter((entry): entry is string => typeof entry === "string");
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  const account = await requireMemberPreview(locals, url, cookies);
  const events = getDevPresenterEventSummaries(account.memberId);
  const selectedId = url.searchParams.get("event");
  const management = getDevPresenterEventManagement(
    account.memberId,
    selectedId,
  );
  if (selectedId && !management)
    throw error(404, "세미나 이벤트를 찾을 수 없습니다.");
  return { events, management };
};

export const actions: Actions = {
  saveAttendance: async ({ request, locals, url, cookies }) => {
    const account = await requireMemberPreview(locals, url, cookies);
    const formData = await request.formData();
    const eventEntry = formData.get("eventId");
    const eventId = typeof eventEntry === "string" ? eventEntry : "";
    if (!managedEventIdSchema.safeParse(eventId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }

    const management = getDevPresenterEventManagement(
      account.memberId,
      eventId,
    );
    if (!management || management.selectedEvent.id !== eventId) {
      return fail(403, { error: "FORBIDDEN" });
    }
    if (!management.canSave) return fail(409, { error: "CONFLICT" });

    const submitted = stringEntries(formData, "attendeeIds");
    const existing = getDevPresenterEventAttendeeIds(eventId);
    if (!existing) return fail(404, { error: "NOT_FOUND" });
    const applicantIds = management.applicants.map((member) => member.id);
    const merged = mergeManagedAttendance(existing, submitted, applicantIds);
    if (!merged.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: {
          attendeeIds: "이 세미나의 신청자만 출석 처리할 수 있습니다.",
        },
      });
    }

    const saved = saveDevPresenterEventAttendance(
      eventId,
      account.memberId,
      merged.attendeeIds,
    );
    if (!saved) return fail(403, { error: "FORBIDDEN" });
    return {
      success: true,
      operation: "presenterAttendanceSaved" as const,
      eventId,
      applicantAttendeeIds: [...new Set(submitted)],
      totalAttendanceCount: saved.attendanceCount,
    };
  },
};
