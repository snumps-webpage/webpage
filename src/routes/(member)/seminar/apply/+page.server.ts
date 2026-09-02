import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import { memberPickers } from "$lib/server/data/repos";
import { submitSeminarRequest } from "$lib/server/services/seminar-requests";
import { AppError } from "$lib/server/core/errors";
import { parseGoogleName } from "$lib/utils";
import { currentTerm } from "$lib/server/core/semester";
import { seminarTimingOptions } from "$lib/domain/seminars";
import type { PageServerLoad, Actions } from "./$types";

function parsePresenterIds(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await ensureSession(locals, url);

  let memberDirectoryUnavailable = false;
  let searchableMembers: { id: string; name: string; department: string }[] = [];

  try {
    searchableMembers = await memberPickers();
  } catch (error) {
    memberDirectoryUnavailable = true;
    console.error("[Seminar Apply] Failed to load member pickers.", error);
  }

  return {
    user: session.user,
    actualName: locals.member?.name || parseGoogleName(session.user.name).name,
    members: searchableMembers,
    memberDirectoryUnavailable,
    timingOptions: seminarTimingOptions(currentTerm()),
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");

      const data = await request.formData();
      const title = data.get("title") as string;
      const description = data.get("description") as string;
      if (!title || !description) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "세미나 제목과 설명은 필수 입력 항목입니다.",
        });
      }

      let presenterIds = parsePresenterIds(data.get("speakerIds") as string);
      if (presenterIds.length === 0) presenterIds = [member.memberId];

      await submitSeminarRequest({
        title,
        description,
        prerequisites: (data.get("prerequisites") as string) || "",
        duration: (data.get("duration") as string) || "",
        preferredTiming: (data.get("preferredTiming") as string) || "",
        presenterIds,
        attachment: (data.get("attachment") as string) || "",
        posterPendingKey: (data.get("posterPendingKey") as string) || "",
        requesterId: member.memberId,
      });

      const { sendSeminarApplicationNotification } = await import("$lib/server/mail");
      await sendSeminarApplicationNotification(member.name, title);
    });
  },
};
