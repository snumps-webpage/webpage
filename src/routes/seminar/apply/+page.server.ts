import { error, fail } from "@sveltejs/kit";
import { validateSeminarRequestForm } from "$lib/domain/seminars";
import { ensureSession } from "$lib/server/auth-guards";
import { dev } from "$app/environment";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import { createDevSeminarRequest } from "$lib/server/dev-admin-seminar-fixtures";
import { getDevAdminMembers } from "$lib/server/dev-member-fixtures";
import type { PageServerLoad, Actions } from "./$types";

function activeMembers() {
  return getDevAdminMembers().filter((member) => member.status !== "withdrawn");
}

function previewMember(role: "member" | "admin") {
  const id = role === "admin" ? "dev-admin" : "dev-member";
  return activeMembers().find((member) => member.id === id) ?? null;
}

async function requireMemberPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  await ensureSession(locals, url);
  const role = resolveDevPreviewRole(url, cookies);
  if (!dev || !role) {
    throw error(503, "새 세미나 신청 API 연결이 필요합니다.");
  }
  return role;
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  const role = await requireMemberPreview(locals, url, cookies);
  const member = previewMember(role);
  if (!member) throw error(404, "회원 정보를 찾을 수 없습니다.");
  return {
    user: member,
    members: activeMembers().map(({ id, name, department }) => ({
      id,
      name,
      department,
    })),
    memberDirectoryUnavailable: false,
  };
};

export const actions: Actions = {
  default: async ({ request, locals, url, cookies }) => {
    const role = await requireMemberPreview(locals, url, cookies);

    const result = validateSeminarRequestForm(await request.formData());
    if (!result.success) return fail(400, result.failure);
    const members = activeMembers();
    const memberById = new Map(members.map((member) => [member.id, member]));
    const requester = previewMember(role);
    const presenters = result.data.presenterIds
      .map((id) => memberById.get(id))
      .filter((member): member is NonNullable<typeof member> => !!member)
      .map(({ id, name, department }) => ({ id, name, department }));
    if (!requester || presenters.length !== result.data.presenterIds.length) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: { presenterIds: "현재 회원 중 발표자를 선택해 주세요." },
        values: result.data,
      });
    }
    const seminarRequest = createDevSeminarRequest({
      values: result.data,
      requester: {
        id: requester.id,
        name: requester.name,
        department: requester.department,
      },
      presenters,
    });
    return {
      success: true,
      operation: "requestSubmitted" as const,
      request: seminarRequest,
    };
  },
};
