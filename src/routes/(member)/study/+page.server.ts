import { getTable } from "$lib/server/data/tables";
import type { PageServerLoad } from "./$types";

/** STU-02 entry: study list, recruiting first, with the viewer's state. */
export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.member!.memberId;
  const studies = await getTable("studies");

  const order = { recruiting: 0, ongoing: 1, finished: 2 } as const;
  return {
    studies: [...studies]
      .sort((a, b) => order[a.status] - order[b.status] || b.semester.localeCompare(a.semester))
      .map((s) => ({
        id: s.id,
        title: s.title,
        semester: s.semester,
        textbook: s.textbook,
        description: s.description,
        status: s.status,
        participantCount: s.participantIds.length,
        myState: s.organizerIds.includes(memberId)
          ? "organizer"
          : s.participantIds.includes(memberId)
            ? "participant"
            : s.pendingParticipantIds.includes(memberId)
              ? "pending"
              : "none",
      })),
  };
};
