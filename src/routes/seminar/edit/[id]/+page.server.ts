import {
  requireEditableSeminarRequest,
  updateSeminarRequest,
  parseSpeakerIds,
  type SeminarRequestActor,
} from "$lib/server/seminars";
import {
  getSearchableMembers,
  resolveActualName,
  isAdmin,
  type SearchableMember,
} from "$lib/server/admin";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import { getMemberByEmail } from "$lib/server/notion";
import { parseGoogleName } from "$lib/utils";
import type { PageServerLoad, Actions } from "./$types";
import type { AuthenticatedSession } from "$lib/server/auth-guards";

/**
 * Resolves who is acting, for the ownership check in
 * `requireEditableSeminarRequest`. A member lookup failure yields
 * `memberId: null`, which denies rather than allows.
 */
async function resolveActor(
  session: AuthenticatedSession,
): Promise<SeminarRequestActor> {
  const member = await getMemberByEmail(session.user.email).catch((e) => {
    console.error("[Seminar Edit] Member lookup failed; denying edit.", e);
    return null;
  });
  return {
    memberId: member?.memberId ?? null,
    isAdmin: isAdmin(session.user.email),
  };
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const session = await ensureSession(locals, url);

  // Authorization: 404 for anyone who is not a speaker on this request.
  const request = await requireEditableSeminarRequest(
    params.id,
    await resolveActor(session),
  );

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
      "[Seminar Edit] Failed to load member data. Falling back.",
      error,
    );
    actualName = parseGoogleName(session.user.name).name;
  }

  // Reconstruct the initial speakers list for the UI
  const initialSpeakers = request.speakerIds
    .map((id) => searchableMembers.find((m) => m.id === id))
    .filter((m) => !!m);

  return {
    user: session.user,
    actualName,
    members: searchableMembers,
    memberDirectoryUnavailable,
    request: {
      ...request,
      initialSpeakers,
    },
  };
};

export const actions: Actions = {
  default: async ({ request, locals, params }) => {
    return handleUserAction(
      locals,
      async (session) => {
        const data = await request.formData();
        const title = data.get("title") as string;
        const description = data.get("description") as string;
        const prerequisites = data.get("prerequisites") as string;
        const duration = data.get("duration") as string;
        const speakerIdsRaw = data.get("speakerIds") as string;
        const attachment = data.get("attachment") as string;

        if (!title || !description)
          throw new Error("필수 항목을 입력해주세요.");

        // Re-checked inside updateSeminarRequest; the load gate does not
        // protect this action because a form POST never runs `load`.
        const actor = await resolveActor(session);

        let speakerIds = parseSpeakerIds(speakerIdsRaw);
        if (speakerIds.length === 0 && actor.memberId) {
          speakerIds = [actor.memberId];
        }

        await updateSeminarRequest(params.id, actor, {
          title,
          description,
          prerequisites,
          duration,
          speakerIds,
          attachment,
        });
      },
      { invalidate: "all_seminar_requests" },
    );
  },
};
