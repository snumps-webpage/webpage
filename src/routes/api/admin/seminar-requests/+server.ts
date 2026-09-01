import { json } from "@sveltejs/kit";

import { getSeminarRequests } from "$lib/server/seminars";
import { getAllMembers } from "$lib/server/notion";
import { ensureAdmin } from "$lib/server/auth-guards";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  await ensureAdmin(locals);

  const [seminarRequests, members] = await Promise.all([
    getSeminarRequests(),
    getAllMembers(),
  ]);

  const requestWithSpeakers = seminarRequests
    .filter((r) => r.status === "pending")
    .sort(
      (a, b) =>
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    )
    .map((r) => ({
      ...r,
      speakerNames: Array.isArray(r.speakerIds)
        ? r.speakerIds.map((id) => {
            const m = members.find((member) => member.id === id);
            return m ? m.name : "Unknown";
          })
        : [],
    }));

  return json(requestWithSpeakers);
};
