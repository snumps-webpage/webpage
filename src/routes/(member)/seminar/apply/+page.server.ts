import { fail } from "@sveltejs/kit";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import { memberPickers } from "$lib/server/data/repos";
import { submitSeminarRequest } from "$lib/server/services/seminar-requests";
import { AppError } from "$lib/server/core/errors";
import { parseGoogleName } from "$lib/utils";
import { currentTerm } from "$lib/server/core/semester";
import { formText } from "$lib/domain/form-data";
import {
  seminarTimingOptions,
  validateSeminarRequestForm,
} from "$lib/domain/seminars";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await ensureSession(locals, url);

  let memberDirectoryUnavailable = false;
  let searchableMembers: { id: string; name: string; department: string }[] =
    [];

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
    // The requester starts as the presenter (removable) — the schema needs
    // at least one, and "the requester presents" is the usual case.
    initialPresenters: searchableMembers.filter(
      (m) => m.id === locals.member?.memberId,
    ),
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
      const parsed = validateSeminarRequestForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const { title, description, prerequisites, duration } = parsed.data;
      const { preferredTiming, presenterIds, attachmentUrl, kind } =
        parsed.data;

      await submitSeminarRequest({
        title,
        description,
        prerequisites,
        duration,
        preferredTiming,
        presenterIds,
        attachment: attachmentUrl,
        kind,
        posterPendingKey: formText(data, "posterPendingKey"),
        requesterId: member.memberId,
      });

      const { sendSeminarApplicationNotification } =
        await import("$lib/server/mail");
      await sendSeminarApplicationNotification(member.name, title);
    });
  },
};
