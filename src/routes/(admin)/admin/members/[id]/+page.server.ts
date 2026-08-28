import { error } from "@sveltejs/kit";
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
import { AppError } from "$lib/server/core/errors";
import { TERM_PATTERN } from "$lib/server/core/semester";
import { normalizePhoneNumber } from "$lib/utils";
import type { MemberRole } from "$lib/server/data/schemas";
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

  return {
    member,
    privateInfo: privateInfo
      ? { email: privateInfo.email, phone: privateInfo.phone, background: privateInfo.background }
      : null,
  };
};

function parseRoles(raw: string): MemberRole[] {
  // one per line: "26-1 회장"
  const roles = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(" ");
      if (space === -1) throw new AppError("VALIDATION_FAILED");
      const term = line.slice(0, space).trim();
      const title = line.slice(space + 1).trim();
      if (!TERM_PATTERN.test(term) || !title) throw new AppError("VALIDATION_FAILED");
      return { term, title };
    });
  return roles;
}

type Ctx = { request: Request; locals: App.Locals; params: { id: string } };

export const actions = {
  updateMember: async ({ request, locals, params }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const projectTitle = (data.get("projectTitle") as string)?.trim();
      await updateMember(params.id, {
        name: (data.get("name") as string)?.trim(),
        department: (data.get("department") as string)?.trim(),
        joinedAt: (data.get("joinedAt") as string) || null,
        publicContact: (data.get("publicContact") as string)?.trim() || null,
        project: projectTitle
          ? { title: projectTitle, url: (data.get("projectUrl") as string)?.trim() || undefined }
          : null,
      });
      return {};
    });
  },

  setStatus: async ({ request, locals, params }: Ctx) => {
    const status = (await request.formData()).get("status") as string;
    return handleAdminAction(locals, async () => {
      if (status !== "associate" && status !== "regular") {
        throw new AppError("VALIDATION_FAILED");
      }
      await setStatus(params.id, status, locals.member!.memberId);
      return {};
    });
  },

  revokeAlumni: async ({ request, locals, params }: Ctx) => {
    const reason = ((await request.formData()).get("reason") as string) ?? "";
    return handleAdminAction(locals, async () => {
      await revokeAlumni(params.id, reason, locals.member!.memberId);
      return {};
    });
  },

  setRoles: async ({ request, locals, params }: Ctx) => {
    const raw = ((await request.formData()).get("roles") as string) ?? "";
    return handleAdminAction(locals, async () => {
      await setRoles(params.id, parseRoles(raw), locals.member!.memberId);
      return {};
    });
  },

  setAdmin: async ({ request, locals, params }: Ctx) => {
    const grant = (await request.formData()).get("isAdmin") === "true";
    return handleAdminAction(locals, async () => {
      await setAdmin(params.id, grant, locals.member!.memberId);
      return {};
    });
  },

  updatePrivateInfo: async ({ request, locals, params }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const phoneRaw = data.get("phone") as string;
      await updatePrivateInfo(
        params.id,
        {
          phone: phoneRaw ? normalizePhoneNumber(phoneRaw) : undefined,
          background: (data.get("background") as string) ?? undefined,
          email: (data.get("email") as string)?.trim() || undefined,
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
