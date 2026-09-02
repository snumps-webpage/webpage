import { handleUserAction } from "$lib/server/auth-guards";
import { nowKstIso } from "$lib/server/core/time";
import { getTable } from "$lib/server/data/tables";
import { memberPickers } from "$lib/server/data/repos";
import { acceptTransfer, declineTransfer } from "$lib/server/services/studies";
import type { PageServerLoad } from "./$types";

/** STU-02 entry: study list, recruiting first, with the viewer's state. */
export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.member!.memberId;
  const [studies, members] = await Promise.all([getTable("studies"), memberPickers()]);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

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
        organizerNames: s.organizerIds.map((id) => nameOf.get(id) ?? "Unknown"),
        myState: s.organizerIds.includes(memberId)
          ? ("organizer" as const)
          : s.participantIds.includes(memberId)
            ? ("participant" as const)
            : s.pendingParticipantIds.includes(memberId)
              ? ("pending" as const)
              : ("none" as const),
      })),
    // STU-07: proposals waiting on the viewer's acceptance (§6-5).
    transferOffers: studies
      .filter((s) => s.pendingTransfer?.toMemberId === memberId)
      .map((s) => ({
        studyId: s.id,
        studyTitle: s.title,
        fromName: nameOf.get(s.organizerIds[0] ?? "") ?? "Unknown",
        requestedAt: s.pendingTransfer!.requestedAt,
      })),
    generatedAt: nowKstIso(),
  };
};

type Ctx = { request: Request; locals: App.Locals };

export const actions = {
  acceptTransfer: async ({ request, locals }: Ctx) => {
    const studyId = (await request.formData()).get("studyId") as string;
    return handleUserAction(locals, async () => {
      await acceptTransfer(studyId, locals.member!.memberId);
      return {};
    });
  },

  declineTransfer: async ({ request, locals }: Ctx) => {
    const studyId = (await request.formData()).get("studyId") as string;
    return handleUserAction(locals, async () => {
      await declineTransfer(studyId, locals.member!.memberId);
      return {};
    });
  },
};
