import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import {
  localKstDateTimeToIso,
  nextStudyStatuses,
  operationIdSchema,
  studyIdSchema,
  studySessionCorrectionSchema,
  studyStatusSchema,
} from "$lib/domain/studies";
import { ensureSession } from "$lib/server/auth-guards";
import {
  acceptDevStudyParticipant,
  cancelDevStudySession,
  cancelDevStudyTransfer,
  createDevStudySession,
  getDevStudyDetail,
  getDevStudyManagementData,
  getDevStudyTransferCandidates,
  proposeDevStudyTransfer,
  removeDevStudyParticipant,
  setDevStudyStatus,
  updateDevStudySession,
} from "$lib/server/dev-study-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

async function requireOrganizerPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
  studyId: string,
) {
  await ensureSession(locals, url);
  if (!dev) throw error(503, "새 스터디 관리 API 연결이 필요합니다.");
  if (resolveDevPreviewRole(url, cookies) !== "member") {
    throw error(404, "Not Found");
  }
  if (!getDevStudyDetail(studyId)?.canManage) {
    throw error(404, "스터디를 찾을 수 없습니다.");
  }
}

function correctionIssues(errorValue: {
  issues: { path: PropertyKey[]; message: string }[];
}) {
  const issues: Record<string, string> = {};
  for (const issue of errorValue.issues) {
    const field = String(issue.path[0] ?? "_form");
    issues[field] ??= issue.message;
  }
  return issues;
}

export const load: PageServerLoad = async ({
  locals,
  url,
  cookies,
  params,
}) => {
  await requireOrganizerPreview(locals, url, cookies, params.id);
  return {
    study: getDevStudyManagementData(params.id),
    transferCandidates: getDevStudyTransferCandidates(params.id),
  };
};

export const actions: Actions = {
  acceptParticipant: async ({ request, locals, url, cookies, params }) => {
    await requireOrganizerPreview(locals, url, cookies, params.id);
    const memberId = value(await request.formData(), "memberId");
    if (!studyIdSchema.safeParse(memberId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }
    const member = acceptDevStudyParticipant(memberId, params.id);
    if (!member) return fail(404, { error: "NOT_FOUND" });
    return { success: true, operation: "participantAccepted" as const, member };
  },

  removeParticipant: async ({ request, locals, url, cookies, params }) => {
    await requireOrganizerPreview(locals, url, cookies, params.id);
    const memberId = value(await request.formData(), "memberId");
    if (!studyIdSchema.safeParse(memberId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }
    if (
      getDevStudyManagementData(params.id).organizers.some(
        (member) => member.id === memberId,
      )
    ) {
      return fail(409, { error: "주최자는 참여자에서 제외할 수 없습니다." });
    }
    if (!removeDevStudyParticipant(memberId, params.id)) {
      return fail(404, { error: "NOT_FOUND" });
    }
    return {
      success: true,
      operation: "participantRemoved" as const,
      memberId,
    };
  },

  setStudyStatus: async ({ request, locals, url, cookies, params }) => {
    await requireOrganizerPreview(locals, url, cookies, params.id);
    const nextStatus = studyStatusSchema.safeParse(
      value(await request.formData(), "status"),
    );
    if (!nextStatus.success) return fail(400, { error: "VALIDATION_FAILED" });

    const current = getDevStudyManagementData(params.id).status;
    if (!nextStudyStatuses(current).includes(nextStatus.data)) {
      return fail(409, { error: "허용되지 않는 스터디 상태 전이입니다." });
    }
    setDevStudyStatus(nextStatus.data, params.id);
    return {
      success: true,
      operation: "statusChanged" as const,
      status: nextStatus.data,
    };
  },

  createSession: async ({ request, locals, url, cookies, params }) => {
    await requireOrganizerPreview(locals, url, cookies, params.id);
    if (getDevStudyManagementData(params.id).status === "finished") {
      return fail(409, { error: "종료된 스터디에는 회차를 만들 수 없습니다." });
    }

    const operationId = value(await request.formData(), "operationId");
    if (!operationIdSchema.safeParse(operationId).success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: { operationId: "새 작업 식별자가 필요합니다." },
      });
    }
    const session = createDevStudySession(operationId, params.id);
    return {
      success: true,
      operation: "sessionCreated" as const,
      operationId,
      session,
    };
  },

  updateSession: async ({ request, locals, url, cookies, params }) => {
    await requireOrganizerPreview(locals, url, cookies, params.id);
    const formData = await request.formData();
    const sessionId = value(formData, "sessionId");
    const parsed = studySessionCorrectionSchema.safeParse({
      title: value(formData, "title"),
      startedAtLocal: value(formData, "startedAtLocal"),
    });
    if (!studyIdSchema.safeParse(sessionId).success || !parsed.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: parsed.success ? {} : correctionIssues(parsed.error),
      });
    }
    const startedAt = localKstDateTimeToIso(parsed.data.startedAtLocal);
    const updated = updateDevStudySession(
      sessionId,
      {
        title: parsed.data.title,
        startedAt,
      },
      params.id,
    );
    if (!updated) return fail(404, { error: "NOT_FOUND" });
    return {
      success: true,
      operation: "sessionUpdated" as const,
      sessionId,
      title: updated.title,
      startedAt: updated.startedAt,
    };
  },

  cancelSession: async ({ request, locals, url, cookies, params }) => {
    await requireOrganizerPreview(locals, url, cookies, params.id);
    const sessionId = value(await request.formData(), "sessionId");
    if (!studyIdSchema.safeParse(sessionId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }
    if (!cancelDevStudySession(sessionId, params.id)) {
      return fail(409, { error: "이 회차는 취소할 수 없습니다." });
    }
    return {
      success: true,
      operation: "sessionCancelled" as const,
      sessionId,
    };
  },

  proposeTransfer: async ({ request, locals, url, cookies, params }) => {
    await requireOrganizerPreview(locals, url, cookies, params.id);
    const memberId = value(await request.formData(), "memberId");
    if (!studyIdSchema.safeParse(memberId).success) {
      return fail(400, { error: "새 주최자를 선택해 주세요." });
    }
    if (
      !getDevStudyManagementData(params.id).capabilities.canTransferOrganizer
    ) {
      return fail(409, { error: "현재 주최자를 변경할 수 없습니다." });
    }
    const transfer = proposeDevStudyTransfer(params.id, memberId);
    if (!transfer) {
      return fail(409, {
        error: "참여자에게만 하나의 전달 제안을 보낼 수 있습니다.",
      });
    }
    return {
      success: true,
      operation: "transferProposed" as const,
      toMember: transfer.toMember,
      requestedAt: transfer.requestedAt,
    };
  },

  cancelTransfer: async ({ locals, url, cookies, params }) => {
    await requireOrganizerPreview(locals, url, cookies, params.id);
    if (!cancelDevStudyTransfer(params.id)) {
      return fail(409, { error: "철회할 전달 제안이 없습니다." });
    }
    return { success: true, operation: "transferCancelled" as const };
  },
};
