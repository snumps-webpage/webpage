import { fail, redirect } from "@sveltejs/kit";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { memberPickers } from "$lib/server/data/repos";
import {
  updateSeminarRequest,
  withdrawSeminarRequest,
} from "$lib/server/services/seminar-requests";
import { AppError } from "$lib/server/core/errors";
import { seminarRequestView } from "$lib/server/data/views";
import { parseGoogleName } from "$lib/utils";
import { proposalTerm } from "$lib/domain/term";
import { formText } from "$lib/domain/form-data";
import {
  seminarTimingOptions,
  validateSeminarRequestForm,
} from "$lib/domain/seminars";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const session = await ensureSession(locals, url);

  const request = (await getTable("seminar-requests")).find(
    (r) => r.id === params.id,
  );
  if (!request || request.status !== "pending") throw redirect(302, "/");

  // Own requests only (admins may inspect).
  if (
    request.requesterId !== locals.member?.memberId &&
    !locals.member?.isAdmin
  ) {
    throw redirect(302, "/");
  }

  let memberDirectoryUnavailable = false;
  let searchableMembers: { id: string; name: string; department: string }[] =
    [];
  try {
    searchableMembers = await memberPickers();
  } catch (error) {
    memberDirectoryUnavailable = true;
    console.error("[Seminar Edit] Failed to load member pickers.", error);
  }

  const initialSpeakers = request.presenterIds
    .map((id) => searchableMembers.find((m) => m.id === id))
    .filter((m) => !!m);

  return {
    user: session.user,
    actualName: locals.member?.name || parseGoogleName(session.user.name).name,
    members: searchableMembers,
    memberDirectoryUnavailable,
    timingOptions: seminarTimingOptions(
      proposalTerm(new Date()),
      request.preferredTiming,
    ),
    request: {
      ...seminarRequestView(request),
      initialSpeakers,
    },
  };
};

export const actions: Actions = {
  update: async ({ request, locals, params }) => {
    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");

      const data = await request.formData();
      const parsed = validateSeminarRequestForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const { title, description, prerequisites, duration } = parsed.data;
      const { preferredTiming, presenterIds, attachmentUrl, kind } =
        parsed.data;

      await updateSeminarRequest(
        params.id,
        { memberId: member.memberId, isAdmin: member.isAdmin },
        {
          title,
          description,
          prerequisites,
          duration,
          preferredTiming,
          presenterIds,
          attachment: attachmentUrl,
          kind,
        },
        formText(data, "posterPendingKey"),
      );
    });
  },

  /** §5-2 ?/withdraw — the requester retracts a pending proposal. */
  withdraw: async ({ locals, params }) => {
    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");
      await withdrawSeminarRequest(params.id, member.memberId);
      throw redirect(303, "/");
    });
  },
};
