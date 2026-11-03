import { error, fail } from "@sveltejs/kit";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { formText, fieldIssues } from "$lib/domain/form-data";
import {
  studySessionCreateInputSchema,
  studySessionUpdateInputSchema,
  studySessionTargetInputSchema,
} from "$lib/domain/studies";
import { kstInputToIso } from "$lib/server/core/time";
import { getTable } from "$lib/server/data/tables";
import {
  assertStudyAdmin,
  createAdminStudySession,
  updateAdminStudySession,
  cancelAdminStudySession,
  saveAdminStudyAttendance,
} from "$lib/server/services/studies-admin";
import {
  setStudyParticipants,
  setOrganizer,
} from "$lib/server/services/records-admin";
import { effectiveStatus } from "$lib/server/services/events";
import { directoryPickers, memberPickers } from "$lib/server/data/repos";
import { directorySummaryIndex } from "$lib/server/data/admin-queue-views";
import type { AdminStudyRecord } from "$lib/domain/admin-records";
import type { PageServerLoad } from "./$types";

export const load = (async (ctx) => {
  await ensureAdmin(ctx.locals, { silent: true });
  await assertStudyAdmin(ctx.locals.member!.memberId);
  const [studies, events, activities, members, pickers, directory] =
    await Promise.all([
      getTable("studies"),
      getTable("events"),
      getTable("activities"),
      memberPickers(),
      directoryPickers(),
      directorySummaryIndex(),
    ]);
  const study = studies.find((s) => s.id === ctx.params.id);
  if (!study) error(404, "NOT_FOUND");
  const studyEvents = events.filter((e) => e.studyId === study.id);
  const linked = activities.filter((a) => a.studyId === study.id);
  const record: AdminStudyRecord = {
    id: study.id,
    sourceRequestId: study.sourceRequestId,
    title: study.title,
    term: study.semester,
    status: study.status,
    description: study.description,
    material: study.textbook,
    organizerIds: study.organizerIds,
    organizerNames: study.organizerIds.map(
      (id) => directory.get(id)?.name ?? "알 수 없음",
    ),
    participantIds: study.participantIds,
    participantPeople: study.participantIds.map(
      (id) => directory.get(id) ?? { id, name: "알 수 없음", department: "" },
    ),
    attendeeCandidates: [
      ...new Set(
        linked.filter((a) => a.type === "스터디").flatMap((a) => a.attendeeIds),
      ),
    ],
    pendingTransfer: study.pendingTransfer,
    transferHistory: study.transferHistory.map((t) => ({
      fromMemberId: t.from,
      toMemberId: t.to,
      changedAt: t.at,
      byAdmin: t.byAdmin,
    })),
    sessionCount: studyEvents.length,
    linkedActivityCount: linked.length,
    files: [],
  };
  return {
    record,
    members,
    pickers,
    sessions: studyEvents
      .sort((a, b) => (a.sessionNo ?? 0) - (b.sessionNo ?? 0))
      .map((e) => ({
        ...e,
        effectiveStatus: effectiveStatus(e),
        attendeeIds:
          activities.find((a) => a.id === e.activityId)?.attendeeIds ?? [],
      })),
  };
}) satisfies PageServerLoad;
type Ctx = { request: Request; locals: App.Locals; params: { id: string } };
const invalid = (parsed: { error: Parameters<typeof fieldIssues>[0] }) =>
  fail(400, { error: "VALIDATION_FAILED", issues: fieldIssues(parsed.error) });
export const actions = {
  createSession: async ({ request, locals, params }: Ctx) =>
    handleAdminAction(locals, async () => {
      const data = await request.formData();
      const parsed = studySessionCreateInputSchema.safeParse({
        title: formText(data, "title"),
        startedAtLocal: formText(data, "date"),
      });
      if (!parsed.success) return invalid(parsed);
      await createAdminStudySession(
        params.id,
        kstInputToIso(parsed.data.startedAtLocal),
        parsed.data.title,
        locals.member!.memberId,
      );
      return { operation: "sessionCreated" };
    }),
  updateSession: async ({ request, locals, params }: Ctx) =>
    handleAdminAction(locals, async () => {
      const data = await request.formData();
      const parsed = studySessionUpdateInputSchema.safeParse({
        eventId: formText(data, "eventId"),
        title: formText(data, "title"),
        startedAtLocal: formText(data, "date"),
      });
      if (!parsed.success) return invalid(parsed);
      await updateAdminStudySession(
        params.id,
        parsed.data.eventId,
        {
          title: parsed.data.title,
          dateIso: kstInputToIso(parsed.data.startedAtLocal),
        },
        locals.member!.memberId,
      );
      return { operation: "sessionUpdated" };
    }),
  cancelSession: async ({ request, locals, params }: Ctx) =>
    handleAdminAction(locals, async () => {
      const parsed = studySessionTargetInputSchema.safeParse({
        eventId: formText(await request.formData(), "eventId"),
      });
      if (!parsed.success) return invalid(parsed);
      await cancelAdminStudySession(
        params.id,
        parsed.data.eventId,
        locals.member!.memberId,
      );
      return { operation: "sessionCancelled" };
    }),
  saveAttendance: async ({ request, locals, params }: Ctx) =>
    handleAdminAction(locals, async () => {
      const data = await request.formData();
      const parsed = studySessionTargetInputSchema.safeParse({
        eventId: formText(data, "eventId"),
      });
      if (!parsed.success) return invalid(parsed);
      await saveAdminStudyAttendance(
        params.id,
        parsed.data.eventId,
        data
          .getAll("attendeeIds")
          .filter((id): id is string => typeof id === "string"),
        locals.member!.memberId,
      );
      return { operation: "attendanceSaved" };
    }),
  setParticipants: async ({ request, locals, params }: Ctx) =>
    handleAdminAction(locals, async () => {
      await assertStudyAdmin(locals.member!.memberId);
      const data = await request.formData();
      await setStudyParticipants(
        params.id,
        data
          .getAll("participantIds")
          .filter((id): id is string => typeof id === "string" && !!id),
        locals.member!.memberId,
      );
      return { operation: "studyParticipantsSet" };
    }),
  setOrganizer: async ({ request, locals, params }: Ctx) =>
    handleAdminAction(locals, async () => {
      await assertStudyAdmin(locals.member!.memberId);
      await setOrganizer(
        params.id,
        formText(await request.formData(), "organizerId"),
        locals.member!.memberId,
      );
      return { operation: "studyOrganizerSet" };
    }),
};
