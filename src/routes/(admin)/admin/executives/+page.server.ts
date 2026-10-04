import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { currentTerm } from "$lib/server/core/semester";
import { formText } from "$lib/domain/form-data";
import { fail, isActionFailure, type ActionFailure } from "@sveltejs/kit";
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
  const [board, titles] = await Promise.all([
    getTermBoard(term),
    listRoleTitles(),
  ]);
  const requestedTitle = url.searchParams.get("title") ?? "";
  const selectedTitle = titles.some(({ title }) => title === requestedTitle)
    ? requestedTitle
    : "";
  return { ...board, titles, selectedTitle, currentTerm: currentTerm() };
};

const str = (d: FormData, n: string) => ((d.get(n) as string) ?? "").trim();

type Ctx = { request: Request; locals: App.Locals; url?: URL };
type ExecutiveAction = "assign" | "unassign" | "addTitle" | "removeTitle";

/** View context identifies feedback only; writes keep their posted inputs. */
async function executiveAction<T extends Record<string, unknown>>(
  { request, locals, url }: Ctx,
  data: FormData,
  action: ExecutiveAction,
  logic: () => Promise<T>,
) {
  const title = formText(data, "title").trim();
  const viewTerm =
    (url ?? new URL(request.url)).searchParams.get("term") ??
    (formText(data, "viewTerm").trim() || currentTerm());
  const metadata = {
    scope: "executive" as const,
    action,
    targetKey: title,
    title,
    viewTerm,
    ...(action === "assign" || action === "unassign"
      ? { targetTerm: formText(data, "term").trim() }
      : {}),
  };
  const result = await handleAdminAction(locals, logic);
  if (isActionFailure(result as unknown)) {
    const failure = result as ActionFailure<Record<string, unknown>>;
    const values =
      action === "assign" || action === "unassign"
        ? {
            memberId: formText(data, "memberId"),
            term: formText(data, "term"),
            title: formText(data, "title"),
          }
        : { title: formText(data, "title") };
    return fail(failure.status, { ...failure.data, ...metadata, values });
  }
  return { ...(result as T & { success: true }), ...metadata };
}

export const actions = {
  assign: async (ctx: Ctx) => {
    const { request, locals } = ctx;
    const data = await request.formData();
    return executiveAction(ctx, data, "assign", async () => {
      await assignRole({
        memberId: str(data, "memberId"),
        term: str(data, "term"),
        title: str(data, "title"),
        actorId: locals.member!.memberId,
      });
      return { operation: "assigned" };
    });
  },

  unassign: async (ctx: Ctx) => {
    const { request, locals } = ctx;
    const data = await request.formData();
    return executiveAction(ctx, data, "unassign", async () => {
      await unassignRole({
        memberId: str(data, "memberId"),
        term: str(data, "term"),
        title: str(data, "title"),
        actorId: locals.member!.memberId,
      });
      return { operation: "unassigned" };
    });
  },

  addTitle: async (ctx: Ctx) => {
    const { request } = ctx;
    const data = await request.formData();
    return executiveAction(ctx, data, "addTitle", async () => {
      await addRoleTitle(str(data, "title"));
      return { operation: "title-added" };
    });
  },

  removeTitle: async (ctx: Ctx) => {
    const { request } = ctx;
    const data = await request.formData();
    return executiveAction(ctx, data, "removeTitle", async () => {
      await removeRoleTitle(str(data, "title"));
      return { operation: "title-removed" };
    });
  },
};
