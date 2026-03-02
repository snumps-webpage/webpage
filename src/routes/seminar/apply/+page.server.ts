import { fail, redirect } from "@sveltejs/kit";
import { createSeminarRequest } from "$lib/server/seminars";
import {
  getSearchableMembers,
  resolveActualName,
  type SearchableMember,
} from "$lib/server/admin";
import { getMemberByEmail } from "$lib/server/notion";
import { parseGoogleName } from "$lib/utils";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  let session = null;
  try {
    session = await locals.auth();
  } catch (error) {
    console.error("[Seminar Apply] Failed to resolve auth session:", error);
  }
  if (!session?.user)
    throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);

  let memberDirectoryUnavailable = false;
  let searchableMembers: SearchableMember[] = [];
  let actualName = "";

  try {
    [searchableMembers, actualName] = await Promise.all([
      getSearchableMembers(),
      resolveActualName(session),
    ]);
  } catch (error) {
    memberDirectoryUnavailable = true;
    console.error(
      "[Seminar Apply] Failed to load member data. Falling back.",
      error,
    );
    actualName = parseGoogleName(session.user.name).name;
  }

  return {
    user: session.user,
    actualName,
    members: searchableMembers,
    memberDirectoryUnavailable,
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    let session = null;
    try {
      session = await locals.auth();
    } catch (error) {
      console.error("[Seminar Apply] Failed to resolve auth session:", error);
    }
    if (!session?.user?.email || !session.user.name) {
      return fail(401, {
        error: "세미나 신청을 위해 로그인이 필요합니다.",
      });
    }

    const data = await request.formData();
    const title = data.get("title") as string;
    const description = data.get("description") as string;
    const prerequisites = data.get("prerequisites") as string;
    const duration = data.get("duration") as string;
    const speakerIdsRaw = data.get("speakerIds") as string;
    const attachment = data.get("attachment") as string;

    const member = await getMemberByEmail(session.user.email);
    if (!member)
      return fail(404, {
        error: "회원 정보를 찾을 수 없습니다. 가입 상태를 확인해 주세요.",
      });

    let speakerIds: string[] = [];
    if (speakerIdsRaw) {
      try {
        speakerIds = JSON.parse(speakerIdsRaw);
      } catch {
        speakerIds = speakerIdsRaw.split(",").filter((id) => id.trim());
      }
    }

    // Default to the applicant themselves if no speakers are explicitly selected
    if (speakerIds.length === 0) {
      speakerIds = [member.memberId];
    }

    if (!title || !description) {
      return fail(400, {
        error: "세미나 제목과 설명은 필수 입력 항목입니다.",
      });
    }

    try {
      await createSeminarRequest({
        title,
        description,
        prerequisites: prerequisites || "",
        duration,
        speakerIds,
        attachment,
      });

      // Use centralized name parser
      const displayName = parseGoogleName(session.user.name).name;

      // Notify admins about the new seminar application
      const { sendSeminarApplicationNotification } =
        await import("$lib/server/mail");
      await sendSeminarApplicationNotification(displayName, title);

      return { success: true };
    } catch (e) {
      console.error("[Seminar Apply] Action Error:", e);
      return fail(500, {
        error: "세미나 신청 처리 중 서버 오류가 발생했습니다.",
      });
    }
  },
};
