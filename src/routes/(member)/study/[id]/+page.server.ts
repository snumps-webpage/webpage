import { error } from "@sveltejs/kit";
import { handleUserAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { memberPickers } from "$lib/server/data/repos";
import { joinStudy, leaveStudy } from "$lib/server/services/studies";
import { effectiveStatus } from "$lib/server/services/events";
import type { PageServerLoad } from "./$types";

/** STU-02: study detail — join/cancel for members, session list for everyone. */
export const load: PageServerLoad = async ({ locals, params }) => {
  const memberId = locals.member!.memberId;
  const study = (await getTable("studies")).find((s) => s.id === params.id);
  if (!study) throw error(404, "Not Found");

  const [events, members] = await Promise.all([getTable("events"), memberPickers()]);
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  return {
    study: {
      id: study.id,
      title: study.title,
      semester: study.semester,
      textbook: study.textbook,
      description: study.description,
      status: study.status,
      organizerNames: study.organizerIds.map((id) => nameOf.get(id) ?? "Unknown"),
      participantNames: study.participantIds.map((id) => nameOf.get(id) ?? "Unknown"),
      isOrganizer: study.organizerIds.includes(memberId),
      isParticipant: study.participantIds.includes(memberId),
      isPending: study.pendingParticipantIds.includes(memberId),
    },
    sessions: events
      .filter((e) => e.studyId === study.id && e.status !== "cancelled")
      .sort((a, b) => (a.sessionNo ?? 0) - (b.sessionNo ?? 0))
      .map((e) => ({
        sessionNo: e.sessionNo,
        title: e.title,
        date: e.date.start,
        status: effectiveStatus(e),
      })),
  };
};

type Ctx = { locals: App.Locals; params: { id: string } };

export const actions = {
  join: async ({ locals, params }: Ctx) => {
    return handleUserAction(locals, async () => {
      await joinStudy(params.id, locals.member!.memberId);
      return {};
    });
  },

  leave: async ({ locals, params }: Ctx) => {
    return handleUserAction(locals, async () => {
      await leaveStudy(params.id, locals.member!.memberId);
      return {};
    });
  },
};
