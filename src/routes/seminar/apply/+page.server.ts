import { redirect } from "@sveltejs/kit";
import { createSeminarRequest, parseSpeakerIds } from "$lib/server/seminars";
import {
  getSearchableMembers,
  resolveActualName,
  type SearchableMember,
} from "$lib/server/admin";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import { getMemberByEmail } from "$lib/server/notion";
import { parseGoogleName } from "$lib/utils";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await ensureSession(locals, url);

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
    return handleUserAction(locals, async (session) => {
      const data = await request.formData();
      const title = data.get("title") as string;
      const description = data.get("description") as string;
      const prerequisites = data.get("prerequisites") as string;
      const duration = data.get("duration") as string;
      const speakerIdsRaw = data.get("speakerIds") as string;
      const attachment = data.get("attachment") as string;

      const member = await getMemberByEmail(session.user.email);
      if (!member) throw new Error("회원 정보를 찾을 수 없습니다. 가입 상태를 확인해 주세요.");

      let speakerIds = parseSpeakerIds(speakerIdsRaw);
      if (speakerIds.length === 0) {
        speakerIds = [member.memberId];
      }

      if (!title || !description) throw new Error("세미나 제목과 설명은 필수 입력 항목입니다.");

      await createSeminarRequest({
        title,
        description,
        prerequisites: prerequisites || "",
        duration,
        speakerIds,
        attachment,
      });

      const displayName = parseGoogleName(session.user.name).name;
      const { sendSeminarApplicationNotification } = await import("$lib/server/mail");
      await sendSeminarApplicationNotification(displayName, title);
    }, { invalidate: "all_seminar_requests" });
  },
};
