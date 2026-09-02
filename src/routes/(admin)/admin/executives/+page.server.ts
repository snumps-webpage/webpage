import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { currentTerm } from "$lib/server/core/semester";
import {
  addRoleTitle,
  assignRole,
  getTermBoard,
  listRoleTitles,
  removeRoleTitle,
  unassignRole,
} from "$lib/server/services/executives-admin";
import type { PageServerLoad } from "./$types";

/** ADM: 학기별 임원진 배정 — 관리자 전용 (zone guard + ensureAdmin 이중). */
export const load: PageServerLoad = async ({ locals, url }) => {
  await ensureAdmin(locals, { silent: true });
  const term = url.searchParams.get("term") ?? currentTerm();
  const [board, titles] = await Promise.all([getTermBoard(term), listRoleTitles()]);
  return { ...board, titles, currentTerm: currentTerm() };
};

const str = (d: FormData, n: string) => ((d.get(n) as string) ?? "").trim();

export const actions = {
  assign: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await assignRole({
        memberId: str(data, "memberId"),
        term: str(data, "term"),
        title: str(data, "title"),
        actorId: locals.member!.memberId,
      });
      return { operation: "assigned" };
    });
  },

  unassign: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await unassignRole({
        memberId: str(data, "memberId"),
        term: str(data, "term"),
        title: str(data, "title"),
        actorId: locals.member!.memberId,
      });
      return { operation: "unassigned" };
    });
  },

  addTitle: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await addRoleTitle(str(data, "title"));
      return { operation: "title-added" };
    });
  },

  removeTitle: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await removeRoleTitle(str(data, "title"));
      return { operation: "title-removed" };
    });
  },
};
