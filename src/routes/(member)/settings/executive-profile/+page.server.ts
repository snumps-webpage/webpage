import { error, fail } from "@sveltejs/kit";
import { parseExecutiveProfileForm } from "$lib/domain/executive-profile";
import { handleUserAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import {
  getProfileEditor,
  saveExecutiveProfile,
} from "$lib/server/services/executive-profiles";
import type { PageServerLoad } from "./$types";

/**
 * 역대 회장단 공개 프로필 — 본인 편집. 회장·부회장 이력이 있는 회원만.
 * 누구의 프로필인지는 세션이 정한다: 폼의 어떤 필드도 대상을 바꾸지 않는다.
 */
export const load: PageServerLoad = async ({ locals }) => {
  try {
    return { editor: await getProfileEditor(locals.member!.memberId) };
  } catch (e) {
    if (
      e instanceof AppError &&
      (e.code === "FORBIDDEN" || e.code === "NOT_FOUND")
    ) {
      throw error(
        403,
        "회장·부회장 이력이 있는 회원만 공개 프로필을 설정할 수 있습니다.",
      );
    }
    throw e;
  }
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
    return handleUserAction(locals, async () => {
      const parsed = parseExecutiveProfileForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const memberId = locals.member!.memberId;
      await saveExecutiveProfile(memberId, parsed.data, {
        actorId: memberId,
        byAdmin: false,
      });
      return {};
    });
  },
};
