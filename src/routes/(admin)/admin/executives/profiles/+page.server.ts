import { fail } from "@sveltejs/kit";
import {
  parseExecutiveProfileForm,
  parseWithdrawnProfileForm,
} from "$lib/domain/executive-profile";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import {
  getProfileEditor,
  listExecutiveProfileCandidates,
  saveExecutiveProfile,
  saveWithdrawnProfile,
} from "$lib/server/services/executive-profiles";
import type { PageServerLoad } from "./$types";

/**
 * ADM: 역대 회장단 공개 프로필 — 관리자 대리 편집. 로그인하지 않는 옛
 * 회장단(legacy 전용)도 여기서 채운다. `?member=<명부 id>`가 편집 대상.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  await ensureAdmin(locals, { silent: true });
  const candidates = await listExecutiveProfileCandidates();
  const selected = url.searchParams.get("member");
  let editor = null;
  if (selected) {
    try {
      editor = await getProfileEditor(selected);
    } catch (e) {
      // 목록 밖의 id(오타, 이력 없는 회원)는 편집기 없이 목록만 보여 준다.
      if (!(e instanceof AppError)) throw e;
      if (e.code !== "NOT_FOUND" && e.code !== "FORBIDDEN") throw e;
    }
  }
  return { candidates, editor, selected };
};

export const actions = {
  save: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const parsed = parseExecutiveProfileForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const memberId = ((data.get("memberId") as string) ?? "").trim();
      await saveExecutiveProfile(memberId, parsed.data, {
        actorId: locals.member!.memberId,
        byAdmin: true,
      });
      return { operation: "saved" };
    });
  },

  /** 탈퇴한 회장단의 자리에 남을 것 — 탈퇴 뒤의 변경은 관리자만 한다. */
  saveWithdrawn: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const parsed = parseWithdrawnProfileForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const memberId = ((data.get("memberId") as string) ?? "").trim();
      await saveWithdrawnProfile(
        memberId,
        parsed.data,
        locals.member!.memberId,
      );
      return { operation: "saved" };
    });
  },
};
