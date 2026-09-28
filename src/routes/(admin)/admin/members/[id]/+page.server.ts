import { error, fail } from "@sveltejs/kit";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { getPrivateInfoOf } from "$lib/server/data/repos";
import { audit } from "$lib/server/data/audit";
import {
  holdWithdrawal,
  releaseWithdrawalHold,
  revokeAlumni,
  setAdmin,
  setRoles,
  setStatus,
  updateMember,
  updatePrivateInfo,
} from "$lib/server/services/members-admin";
import { listRoleTitles } from "$lib/server/services/executives-admin";
import { formatPhoneForDisplay } from "$lib/utils";
import { formText, fieldIssues } from "$lib/domain/form-data";
import {
  alumniRevocationInputSchema,
  memberAdminInputSchema,
  memberRecordInputSchema,
  memberRolesIssues,
  memberStatusInputSchema,
  parseRoleLines,
  privateInfoUpdateSchema,
} from "$lib/domain/members";
import type { PageServerLoad } from "./$types";

/** ADM-07·12: member detail. Reading this page reads PII — that read is audited. */
export const load: PageServerLoad = async ({ locals, params }) => {
  await ensureAdmin(locals, { silent: true });

  const member = (await getTable("members")).find((m) => m.id === params.id);
  if (!member) throw error(404, "Not Found");

  const privateInfo = await getPrivateInfoOf(member.id);
  await audit({
    actorMemberId: locals.member!.memberId,
    action: "private-info.read",
    targetTable: "private-info",
    targetId: member.id,
  });

  // The deprecated publicContact stays off the page: nobody reads or writes
  // it (decision #19, audit LB16-3).
  const { publicContact: _deprecated, ...record } = member;

  return {
    member: {
      ...record,
      privateInfo: privateInfo
        ? {
            email: privateInfo.email,
            phone: formatPhoneForDisplay(privateInfo.phone),
            background: privateInfo.background,
            mailPrefs: privateInfo.mailPrefs,
          }
        : null,
    },
    privateInfo: privateInfo
      ? {
          email: privateInfo.email,
          phone: formatPhoneForDisplay(privateInfo.phone),
          background: privateInfo.background,
        }
      : null,
    // The role suggestions are the executives page's options, not a list of
    // their own (audit LB22-3).
    roleTitles: (await listRoleTitles()).map((o) => o.title),
  };
};

type Ctx = { request: Request; locals: App.Locals; params: { id: string } };

/** A refused input: every bad field at once, and what was sent to refill the form. */
function invalid(
  issues: Record<string, string>,
  values: Record<string, string>,
) {
  return fail(400, { error: "VALIDATION_FAILED", issues, values });
}

export const actions = {
  updateMember: async ({ request, locals, params }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const values = {
        name: formText(data, "name"),
        department: formText(data, "department"),
        joinedAt: formText(data, "joinedAt"),
        projectTitle: formText(data, "projectTitle"),
        projectUrl: formText(data, "projectUrl"),
      };
      const record = memberRecordInputSchema.safeParse(values);
      if (!record.success) {
        return invalid(fieldIssues(record.error), values);
      }
      // The record only: the deprecated publicContact is written by nobody
      // (decision #19, audit LB16-3, LC11-1).
      await updateMember(params.id, record.data);
      return {};
    });
  },

  setStatus: async ({ request, locals, params }: Ctx) => {
    const values = { status: formText(await request.formData(), "status") };
    return handleAdminAction(locals, async () => {
      const parsed = memberStatusInputSchema.safeParse(values);
      if (!parsed.success) {
        return invalid(fieldIssues(parsed.error), values);
      }
      await setStatus(params.id, parsed.data.status, locals.member!.memberId);
      return {};
    });
  },

  revokeAlumni: async ({ request, locals, params }: Ctx) => {
    const values = { reason: formText(await request.formData(), "reason") };
    return handleAdminAction(locals, async () => {
      const parsed = alumniRevocationInputSchema.safeParse(values);
      if (!parsed.success) {
        return invalid(fieldIssues(parsed.error), values);
      }
      await revokeAlumni(
        params.id,
        parsed.data.reason,
        locals.member!.memberId,
      );
      return {};
    });
  },

  setRoles: async ({ request, locals, params }: Ctx) => {
    const values = { roles: formText(await request.formData(), "roles") };
    return handleAdminAction(locals, async () => {
      const parsed = parseRoleLines(values.roles);
      if (!parsed.success) {
        return invalid(memberRolesIssues(parsed.error), values);
      }
      await setRoles(params.id, parsed.data, locals.member!.memberId);
      return {};
    });
  },

  setAdmin: async ({ request, locals, params }: Ctx) => {
    const values = { isAdmin: formText(await request.formData(), "isAdmin") };
    return handleAdminAction(locals, async () => {
      const parsed = memberAdminInputSchema.safeParse(values);
      if (!parsed.success) {
        return invalid(fieldIssues(parsed.error), values);
      }
      await setAdmin(params.id, parsed.data.isAdmin, locals.member!.memberId);
      return {};
    });
  },

  updatePrivateInfo: async ({ request, locals, params }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const values = {
        email: formText(data, "email"),
        phone: formText(data, "phone"),
        background: formText(data, "background"),
      };
      const parsed = privateInfoUpdateSchema.safeParse(values);
      if (!parsed.success) {
        return invalid(fieldIssues(parsed.error), values);
      }
      await updatePrivateInfo(
        params.id,
        {
          phone: parsed.data.phone,
          background: parsed.data.background,
          email: parsed.data.email,
        },
        locals.member!.memberId,
      );
      return {};
    });
  },

  holdWithdrawal: async ({ locals, params }: Ctx) => {
    return handleAdminAction(locals, async () => {
      await holdWithdrawal(params.id, locals.member!.memberId);
      return {};
    });
  },

  releaseWithdrawalHold: async ({ locals, params }: Ctx) => {
    return handleAdminAction(locals, async () => {
      await releaseWithdrawalHold(params.id, locals.member!.memberId);
      return {};
    });
  },
};
