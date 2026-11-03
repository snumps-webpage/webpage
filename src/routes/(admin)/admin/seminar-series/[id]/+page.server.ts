import { error } from "@sveltejs/kit";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { formText } from "$lib/domain/form-data";
import { getTable } from "$lib/server/data/tables";
import { directoryPickers, recordPickers } from "$lib/server/data/repos";
import { currentTerm } from "$lib/server/core/semester";
import {
  createSeminarSeriesSession,
  getSeminarSeries,
  setSeminarSessionAttendance,
  updateSeminarSeries,
} from "$lib/server/services/seminar-series";
import type { PageServerLoad } from "./$types";
export const load: PageServerLoad = async ({ locals, params }) => {
  await ensureAdmin(locals, { silent: true });
  const [series, members, pickers, activities, events] = await Promise.all([
    getSeminarSeries(),
    recordPickers(),
    directoryPickers(),
    getTable("activities"),
    getTable("events"),
  ]);
  const parent = series.find((s) => s.id === params.id);
  if (!parent) throw error(404, "세미나를 찾을 수 없습니다.");
  return {
    parent: {
      id: parent.id,
      title: parent.title,
      description: parent.description,
    },
    members,
    pickers,
    currentTerm: currentTerm(),
    sessions: parent.sessions.map((s) => ({
      ...s,
      attendeeIds:
        activities.find((a) => a.id === s.activityId)?.attendeeIds ?? [],
      eventId:
        events.find((e) => e.activityId === s.activityId && !e.studyId)?.id ??
        null,
      presenterNames: s.presenterIds.map(
        (id) =>
          pickers.find((m) => m.id === id || m.legacyMemberId === id)?.name ??
          id,
      ),
    })),
  };
};
type Ctx = { request: Request; locals: App.Locals; params: { id: string } };
export const actions = {
  update: async ({ request, locals, params }: Ctx) =>
    handleAdminAction(locals, async () => {
      const data = await request.formData();
      await updateSeminarSeries(locals.member!.memberId, params.id, {
        title: formText(data, "title"),
        description: formText(data, "description"),
      });
      return { operation: "updated" };
    }),
  createSession: async ({ request, locals, params }: Ctx) =>
    handleAdminAction(locals, async () => {
      const data = await request.formData();
      const seminar = await createSeminarSeriesSession(
        locals.member!.memberId,
        params.id,
        {
          title: formText(data, "title"),
          semester: formText(data, "semester"),
          presenterIds: data.getAll("presenterIds").map(String),
          externalPresenters: formText(data, "externalPresenters"),
        },
      );
      return { operation: "sessionCreated", seminarId: seminar.id };
    }),
  saveAttendance: async ({ request, locals, params }: Ctx) =>
    handleAdminAction(locals, async () => {
      const data = await request.formData();
      const seminarId = formText(data, "seminarId");
      await setSeminarSessionAttendance(
        locals.member!.memberId,
        params.id,
        seminarId,
        data.getAll("attendeeIds").map(String),
      );
      return { operation: "attendanceSaved", seminarId };
    }),
};
