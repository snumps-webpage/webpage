import { error, fail } from "@sveltejs/kit";
import {
  validateSeminarRequestForm,
  type MemberPickerItem,
} from "$lib/domain/seminars";
import { ensureSession } from "$lib/server/auth-guards";
import { dev } from "$app/environment";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import {
  getDevSeminarRequest,
  updateDevSeminarRequest,
  withdrawDevSeminarRequest,
} from "$lib/server/dev-admin-seminar-fixtures";
import { getDevAdminMembers } from "$lib/server/dev-member-fixtures";
import type { PageServerLoad, Actions } from "./$types";

function activeMembers() {
  return getDevAdminMembers().filter((member) => member.status !== "withdrawn");
}

async function requireMemberPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  await ensureSession(locals, url);
  const role = resolveDevPreviewRole(url, cookies);
  if (!dev || !role) {
    throw error(503, "새 세미나 신청 수정 API 연결이 필요합니다.");
  }
  return role;
}

function canAccess(requesterId: string, role: "member" | "admin") {
  return role === "admin" || requesterId === "dev-member";
}

export const load: PageServerLoad = async ({
  locals,
  params,
  url,
  cookies,
}) => {
  const role = await requireMemberPreview(locals, url, cookies);
  const seminarRequest = getDevSeminarRequest(params.id);
  if (!seminarRequest) throw error(404, "세미나 신청을 찾을 수 없습니다.");
  if (!canAccess(seminarRequest.requesterId, role)) {
    throw error(403, "이 신청을 수정할 권한이 없습니다.");
  }
  if (seminarRequest.status !== "pending") {
    throw error(409, "승인 대기 중인 신청만 수정할 수 있습니다.");
  }
  const members: MemberPickerItem[] = activeMembers().map(
    ({ id, name, department }) => ({ id, name, department }),
  );
  const presenterIds = new Set(seminarRequest.presenterIds);
  return {
    members,
    memberDirectoryUnavailable: false,
    request: {
      ...seminarRequest,
      initialPresenters: members.filter((member) =>
        presenterIds.has(member.id),
      ),
    },
  };
};

export const actions: Actions = {
  update: async ({ request, locals, params, url, cookies }) => {
    const role = await requireMemberPreview(locals, url, cookies);
    const existing = getDevSeminarRequest(params.id);
    if (!existing) return fail(404, { error: "NOT_FOUND" });
    if (!canAccess(existing.requesterId, role)) {
      return fail(403, { error: "FORBIDDEN" });
    }
    if (existing.status !== "pending") {
      return fail(409, { error: "CONFLICT" });
    }

    const result = validateSeminarRequestForm(await request.formData());
    if (!result.success) return fail(400, result.failure);
    const memberById = new Map(
      activeMembers().map((member) => [member.id, member]),
    );
    const presenters = result.data.presenterIds
      .map((id) => memberById.get(id))
      .filter((member): member is NonNullable<typeof member> => !!member)
      .map(({ id, name, department }) => ({ id, name, department }));
    if (presenters.length !== result.data.presenterIds.length) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: { presenterIds: "현재 회원 중 발표자를 선택해 주세요." },
        values: result.data,
      });
    }
    const seminarRequest = updateDevSeminarRequest(
      params.id,
      result.data,
      presenters,
    );
    if (!seminarRequest) return fail(409, { error: "CONFLICT" });
    return {
      success: true,
      operation: "requestUpdated" as const,
      request: seminarRequest,
    };
  },

  withdraw: async ({ locals, params, url, cookies }) => {
    const role = await requireMemberPreview(locals, url, cookies);
    const existing = getDevSeminarRequest(params.id);
    if (!existing) return fail(404, { error: "NOT_FOUND" });
    if (!canAccess(existing.requesterId, role)) {
      return fail(403, { error: "FORBIDDEN" });
    }
    if (!withdrawDevSeminarRequest(params.id)) {
      return fail(409, { error: "CONFLICT" });
    }
    return {
      success: true,
      operation: "requestWithdrawn" as const,
      requestId: params.id,
    };
  },
};
