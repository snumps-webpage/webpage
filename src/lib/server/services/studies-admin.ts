import { AppError } from "$lib/server/core/errors";
import { newId, randomToken } from "$lib/server/core/id";
import { isKstInstant, nowKstIso } from "$lib/server/core/time";
import { callFlow, type FlowResult } from "$lib/server/data/flows";
import { getTableFresh } from "$lib/server/data/tables";
import type { Event } from "$lib/server/data/schemas";

/** Actor is the authenticated admin's memberId, never an organizer substitute. */
export async function assertStudyAdmin(actorId: string): Promise<void> {
  const actor = (await getTableFresh("members")).find((m) => m.id === actorId);
  if (!actor?.isAdmin) throw new AppError("FORBIDDEN");
}
async function run(
  studyId: string,
  actorId: string,
  args: Record<string, unknown>,
) {
  await assertStudyAdmin(actorId);
  return callFlow<FlowResult & { event: Event }>(
    "flow_admin_study_session",
    {
      ...args,
      studyId,
      actorId,
      auditId: newId(),
      auditAt: nowKstIso(),
    },
    {
      messages: {
        "session-cancelled": "취소된 회차는 변경할 수 없습니다.",
        "session-slot-cancelled":
          "취소된 회차와 같은 일시입니다. 다른 일시를 선택해 주세요.",
      },
    },
  );
}
export async function createAdminStudySession(
  studyId: string,
  dateIso: string,
  title: string,
  actorId: string,
): Promise<Event> {
  if (!isKstInstant(dateIso) || title.length > 120)
    throw new AppError("VALIDATION_FAILED");
  return (
    await run(studyId, actorId, {
      op: "create",
      date: dateIso,
      title: title.trim(),
      activityId: newId(),
      eventId: newId(),
      pathId: randomToken(),
      attendCode: randomToken(),
    })
  ).event;
}
export async function updateAdminStudySession(
  studyId: string,
  eventId: string,
  patch: { title?: string; dateIso?: string },
  actorId: string,
): Promise<void> {
  if (
    (patch.dateIso !== undefined && !isKstInstant(patch.dateIso)) ||
    (patch.title?.length ?? 0) > 120
  )
    throw new AppError("VALIDATION_FAILED");
  await run(studyId, actorId, {
    op: "update",
    eventId,
    title: patch.title?.trim() ?? "",
    date: patch.dateIso ?? "",
  });
}
export async function cancelAdminStudySession(
  studyId: string,
  eventId: string,
  actorId: string,
): Promise<void> {
  await run(studyId, actorId, { op: "cancel", eventId });
}
export async function saveAdminStudyAttendance(
  studyId: string,
  eventId: string,
  selectedIds: string[],
  actorId: string,
): Promise<void> {
  await run(studyId, actorId, {
    op: "attendance",
    eventId,
    selectedIds: [...new Set(selectedIds)],
  });
}
