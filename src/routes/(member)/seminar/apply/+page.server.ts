import { fail, isActionFailure, type ActionFailure } from "@sveltejs/kit";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import { memberPickers } from "$lib/server/data/repos";
import { submitSeminarRequest } from "$lib/server/services/seminar-requests";
import { AppError } from "$lib/server/core/errors";
import { parseGoogleName } from "$lib/utils";
import { proposalTerm } from "$lib/domain/term";
import { formText } from "$lib/domain/form-data";
import {
  seminarRequestValuesFromFormData,
  seminarTimingOptions,
  validateSeminarRequestForm,
} from "$lib/domain/seminars";
import type { PageServerLoad, Actions } from "./$types";
import { CAPABILITIES, hasCapability } from "$lib/server/core/capabilities";
import { sendSeminarApplicationNotification } from "$lib/server/mail";

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
    canSubmit: hasCapability(
      locals.member?.capabilities,
      CAPABILITIES.PARTICIPATE,
    ),
    user: session.user,
    actualName: locals.member?.name || parseGoogleName(session.user.name).name,
    members: searchableMembers,
    // The requester starts as the presenter (removable) — the schema needs
    // at least one, and "the requester presents" is the usual case.
    initialPresenters: searchableMembers.filter(
      (m) => m.id === locals.member?.memberId,
    ),
    memberDirectoryUnavailable,
    timingOptions: seminarTimingOptions(proposalTerm(new Date())),
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const data = await request.formData();
    const result = await handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");

      const parsed = validateSeminarRequestForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const { title, description, prerequisites, duration } = parsed.data;
      const { preferredTiming, presenterIds, attachmentUrl, kind } =
        parsed.data;

      const row = await submitSeminarRequest({
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

      await sendSeminarApplicationNotification(member.name, title);
      return { operation: "requestSubmitted" as const, requestId: row.id };
    });
    if (isActionFailure(result as unknown)) {
      const failure = result as unknown as ActionFailure<
        Record<string, unknown>
      >;
      return fail(failure.status, {
        ...failure.data,
        operation: "requestSubmitted" as const,
        values: seminarRequestValuesFromFormData(data),
      });
    }
    return result;
  },
};
