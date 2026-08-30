import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import {
  alumniRevocationInputSchema,
  memberRecordInputSchema,
  memberStatusInputSchema,
  parseRolesJson,
  privateInfoInputSchema,
  publicContactInputSchema,
} from "$lib/domain/members";
import { ensureAdmin } from "$lib/server/auth-guards";
import {
  getDevAdminMember,
  revokeDevMemberAlumni,
  setDevMemberAdmin,
  setDevMemberPublicContact,
  setDevMemberRoles,
  setDevMemberStatus,
  setDevWithdrawalHold,
  updateDevMemberPrivateInfo,
  updateDevMemberRecord,
} from "$lib/server/dev-member-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

async function requireAdminPreview(
  locals: App.Locals,
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  await ensureAdmin(locals, { silent: true });
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    throw error(503, "새 회원 관리 API 연결이 필요합니다.");
  }
}

function stringValue(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function fieldIssues(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}) {
  const issues: Record<string, string> = {};
  for (const issue of error.issues) {
    issues[String(issue.path[0] ?? "_form")] ??= issue.message;
  }
  return issues;
}

export const load: PageServerLoad = async ({
  locals,
  url,
  cookies,
  params,
}) => {
  await requireAdminPreview(locals, url, cookies);
  const member = getDevAdminMember(params.id);
  if (!member) throw error(404, "회원을 찾을 수 없습니다.");
  return { member };
};

export const actions: Actions = {
  updateMember: async ({ request, locals, url, cookies, params }) => {
    await requireAdminPreview(locals, url, cookies);
    const formData = await request.formData();
    const parsed = memberRecordInputSchema.safeParse({
      name: stringValue(formData, "name"),
      department: stringValue(formData, "department"),
      joinedAt: stringValue(formData, "joinedAt"),
      projectTitle: stringValue(formData, "projectTitle"),
      projectUrl: stringValue(formData, "projectUrl"),
    });
    if (!parsed.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: fieldIssues(parsed.error),
      });
    }
    const member = updateDevMemberRecord(params.id, parsed.data);
    if (!member) return fail(404, { error: "NOT_FOUND" });
    return { success: true, operation: "memberUpdated" as const, member };
  },

  setStatus: async ({ request, locals, url, cookies, params }) => {
    await requireAdminPreview(locals, url, cookies);
    const parsed = memberStatusInputSchema.safeParse({
      status: stringValue(await request.formData(), "status"),
    });
    if (!parsed.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: fieldIssues(parsed.error),
      });
    }
    const updated = setDevMemberStatus(params.id, parsed.data.status);
    if (!updated) {
      return fail(409, {
        error: "탈퇴 상태는 지위 변경으로 복원할 수 없습니다.",
      });
    }
    return { success: true, operation: "statusUpdated" as const, ...updated };
  },

  revokeAlumni: async ({ request, locals, url, cookies, params }) => {
    await requireAdminPreview(locals, url, cookies);
    const parsed = alumniRevocationInputSchema.safeParse({
      reason: stringValue(await request.formData(), "reason"),
    });
    if (!parsed.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: fieldIssues(parsed.error),
      });
    }
    if (!revokeDevMemberAlumni(params.id)) {
      return fail(409, { error: "현재 동문 지위가 없습니다." });
    }
    return {
      success: true,
      operation: "alumniRevoked" as const,
      isAlumni: false as const,
      alumniRevoked: true as const,
    };
  },

  setRoles: async ({ request, locals, url, cookies, params }) => {
    await requireAdminPreview(locals, url, cookies);
    const parsed = parseRolesJson(
      stringValue(await request.formData(), "roles"),
    );
    if (!parsed.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: {
          roles:
            parsed.error.issues[0]?.message ?? "직책 형식을 확인해 주세요.",
        },
      });
    }
    const roles = setDevMemberRoles(params.id, parsed.data);
    if (!roles) return fail(404, { error: "NOT_FOUND" });
    return { success: true, operation: "rolesUpdated" as const, roles };
  },

  setAdmin: async ({ request, locals, url, cookies, params }) => {
    await requireAdminPreview(locals, url, cookies);
    const isAdmin = stringValue(await request.formData(), "isAdmin") === "true";
    if (!setDevMemberAdmin(params.id, isAdmin)) {
      return fail(409, {
        error: "현재 로그인한 관리자의 권한은 회수할 수 없습니다.",
      });
    }
    return { success: true, operation: "adminUpdated" as const, isAdmin };
  },

  setPublicContact: async ({ request, locals, url, cookies, params }) => {
    await requireAdminPreview(locals, url, cookies);
    const formData = await request.formData();
    const status = stringValue(formData, "status");
    const parsed = publicContactInputSchema.safeParse(
      status === "granted"
        ? {
            status,
            phone: stringValue(formData, "phone"),
            email: stringValue(formData, "email"),
          }
        : { status, phone: null, email: null },
    );
    if (!parsed.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: fieldIssues(parsed.error),
      });
    }
    const publicContact = setDevMemberPublicContact(params.id, parsed.data);
    if (!publicContact) return fail(404, { error: "NOT_FOUND" });
    return {
      success: true,
      operation: "publicContactUpdated" as const,
      publicContact,
    };
  },

  updatePrivateInfo: async ({ request, locals, url, cookies, params }) => {
    await requireAdminPreview(locals, url, cookies);
    const formData = await request.formData();
    const parsed = privateInfoInputSchema.safeParse({
      email: stringValue(formData, "email"),
      phone: stringValue(formData, "phone"),
      background: stringValue(formData, "background"),
    });
    if (!parsed.success) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        issues: fieldIssues(parsed.error),
      });
    }
    const result = updateDevMemberPrivateInfo(params.id, parsed.data);
    if (result.status === "not_found") {
      return fail(404, { error: "개인정보 레코드가 이미 삭제되었습니다." });
    }
    if (result.status === "conflict") {
      return fail(409, {
        error: "VALIDATION_FAILED",
        issues: { email: "이미 다른 회원이 사용하는 이메일입니다." },
      });
    }
    return {
      success: true,
      operation: "privateInfoUpdated" as const,
      privateInfo: result.privateInfo,
    };
  },

  holdWithdrawal: async ({ locals, url, cookies, params }) => {
    await requireAdminPreview(locals, url, cookies);
    const withdrawal = setDevWithdrawalHold(params.id, true);
    if (!withdrawal) {
      return fail(409, { error: "보존할 수 있는 탈퇴 유예 정보가 없습니다." });
    }
    return {
      success: true,
      operation: "withdrawalHoldUpdated" as const,
      withdrawal,
    };
  },

  releaseWithdrawalHold: async ({ locals, url, cookies, params }) => {
    await requireAdminPreview(locals, url, cookies);
    const withdrawal = setDevWithdrawalHold(params.id, false);
    if (!withdrawal) {
      return fail(409, { error: "해제할 수 있는 탈퇴 유예 정보가 없습니다." });
    }
    return {
      success: true,
      operation: "withdrawalHoldUpdated" as const,
      withdrawal,
    };
  },
};
