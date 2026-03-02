import { fail, redirect } from "@sveltejs/kit";
import { getSeminarRequests, updateSeminarRequest } from "$lib/server/seminars";
import {
  getSearchableMembers,
  resolveActualName,
  type SearchableMember,
} from "$lib/server/admin";
import { getMemberByEmail } from "$lib/server/notion";
import { parseGoogleName } from "$lib/utils";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals, params, url }) => {
  let session = null;
  try {
    session = await locals.auth();
  } catch (error) {
    console.error("[Seminar Edit] Failed to resolve auth session:", error);
  }
  if (!session?.user)
    throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);

  const requestId = params.id;
  let requests = [];
  try {
    requests = await getSeminarRequests();
  } catch (error) {
    console.error(
      "[Seminar Edit] Failed to load seminar requests. Redirecting to home.",
      error,
    );
    throw redirect(302, "/");
  }
  const request = requests.find((r) => r.id === requestId);

  if (!request) {
    throw redirect(302, "/");
  }

  // Check if pending. Only pending requests should be editable.
  if (request.status !== "pending") {
    throw redirect(302, "/");
  }

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
    let session = null;
    try {
      session = await locals.auth();
    } catch (error) {
      console.error("[Seminar Edit] Failed to resolve auth session:", error);
    }
    if (!session?.user?.email) return fail(401, { error: "Login required" });

    const data = await request.formData();
    const title = data.get("title") as string;
    const description = data.get("description") as string;
    const prerequisites = data.get("prerequisites") as string;
    const duration = data.get("duration") as string;
    const speakerIdsRaw = data.get("speakerIds") as string;
    const attachment = data.get("attachment") as string;

    const requestId = params.id;

    if (!title || !description) {
      return fail(400, { error: "Missing required fields" });
    }

    let speakerIds: string[] = [];
    if (speakerIdsRaw) {
      try {
        speakerIds = JSON.parse(speakerIdsRaw);
      } catch {
        speakerIds = [];
      }
    }

    // Fallback if empty
    if (speakerIds.length === 0) {
      const member = await getMemberByEmail(session.user.email);
      if (member) speakerIds = [member.memberId];
    }

    try {
      await updateSeminarRequest(requestId, {
        title,
        description,
        prerequisites,
        duration,
        speakerIds,
        attachment,
      });

      return { success: true };
    } catch (e) {
      console.error("[Seminar Edit] Error:", e);
      return fail(500, { error: "Failed to update seminar request" });
    }
  },
};
