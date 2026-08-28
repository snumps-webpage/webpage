import { AppError } from "$lib/server/core/errors";
import { newId, randomToken } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { ensureCreated } from "$lib/server/data/idempotency";
import type { Event, Study, StudyRequest } from "$lib/server/data/schemas";
import { effectiveStatus, type CronStep } from "./events";

/**
 * Study lifecycle (API-SPEC §6 / BE-47~51): proposal → approval → recruiting
 * → sessions → attendance, plus the two-phase organizer handover.
 * Session idempotency key is the composite `<studyId>:<date>` — the one
 * anchor shared by manual creation and the cron's schedule step.
 */

// ---- proposals (STU-01) -----------------------------------------------------

export async function submitStudyRequest(input: {
  title: string;
  textbook: string;
  description: string;
  semester: string;
  requesterId: string;
}): Promise<StudyRequest> {
  const row: StudyRequest = {
    id: newId(),
    ...input,
    status: "pending",
    createdAt: nowKstIso(),
  };
  await mutate("study-requests", (rows) => [...rows, row]);
  return row;
}

export async function withdrawStudyRequest(id: string, memberId: string): Promise<void> {
  await mutate("study-requests", (rows) => {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    if (rows[idx].requesterId !== memberId) throw new AppError("FORBIDDEN");
    if (rows[idx].status !== "pending") throw new AppError("CONFLICT");
    rows[idx] = { ...rows[idx], status: "withdrawn" };
    return rows;
  });
}

/** ADM-16: approval creates the study with the requester as organizer. */
export async function approveStudy(id: string): Promise<StudyRequest> {
  const request = (await getTable("study-requests")).find((r) => r.id === id);
  if (!request) throw new AppError("NOT_FOUND");
  if (request.status !== "pending") throw new AppError("CONFLICT");

  await ensureCreated("studies", id, () => ({
    id: newId(),
    title: request.title,
    semester: request.semester,
    textbook: request.textbook,
    description: request.description,
    note: "",
    organizerIds: [request.requesterId],
    participantIds: [request.requesterId],
    pendingParticipantIds: [],
    pendingTransfer: null,
    schedule: [],
    transferHistory: [],
    photos: [],
    status: "recruiting" as const,
    sourceRequestId: id,
  }));

  await mutate("study-requests", (rows) =>
    rows.map((r) => (r.id === id ? { ...r, status: "approved" as const } : r)),
  );
  return request;
}

export async function rejectStudy(id: string): Promise<StudyRequest> {
  const request = (await getTable("study-requests")).find((r) => r.id === id);
  if (!request) throw new AppError("NOT_FOUND");
  if (request.status !== "pending") throw new AppError("CONFLICT");
  await mutate("study-requests", (rows) =>
    rows.map((r) => (r.id === id ? { ...r, status: "rejected" as const } : r)),
  );
  return request;
}

// ---- participation (STU-02 / STU-04) ---------------------------------------

async function patchStudy(id: string, fn: (s: Study) => Study): Promise<Study> {
  let updated: Study | undefined;
  await mutate("studies", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    updated = fn(rows[idx]);
    rows[idx] = updated;
    return rows;
  });
  return updated!;
}

export async function joinStudy(studyId: string, memberId: string): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (s.status !== "recruiting") throw new AppError("STUDY_NOT_RECRUITING");
    if (s.participantIds.includes(memberId) || s.pendingParticipantIds.includes(memberId)) {
      return s; // idempotent
    }
    return { ...s, pendingParticipantIds: [...s.pendingParticipantIds, memberId] };
  });
}

export async function leaveStudy(studyId: string, memberId: string): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (s.organizerIds.includes(memberId)) throw new AppError("CONFLICT"); // hand over first
    return {
      ...s,
      participantIds: s.participantIds.filter((id) => id !== memberId),
      pendingParticipantIds: s.pendingParticipantIds.filter((id) => id !== memberId),
    };
  });
}

export async function acceptParticipant(studyId: string, memberId: string): Promise<void> {
  await patchStudy(studyId, (s) => ({
    ...s,
    pendingParticipantIds: s.pendingParticipantIds.filter((id) => id !== memberId),
    participantIds: s.participantIds.includes(memberId)
      ? s.participantIds
      : [...s.participantIds, memberId],
  }));
}

export async function removeParticipant(studyId: string, memberId: string): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (s.organizerIds.includes(memberId)) throw new AppError("CONFLICT");
    return {
      ...s,
      participantIds: s.participantIds.filter((id) => id !== memberId),
      pendingParticipantIds: s.pendingParticipantIds.filter((id) => id !== memberId),
    };
  });
}

export async function setStudyStatus(
  studyId: string,
  status: Study["status"],
): Promise<void> {
  await patchStudy(studyId, (s) => ({ ...s, status }));
}

// ---- sessions (STU-03 / STU-06 / BE-49) -------------------------------------

const sessionKey = (studyId: string, dateIso: string) => `${studyId}:${dateIso}`;

/**
 * Creates the activity+event pair for one session. Idempotent on the
 * composite key, so a manual click and the cron can never double-create.
 */
export async function createStudySession(
  study: Study,
  dateIso: string,
  opts: { title?: string; autoGenerated: boolean },
): Promise<Event> {
  if (study.status === "finished") throw new AppError("CONFLICT");
  const key = sessionKey(study.id, dateIso);

  const existingNos = (await getTable("events"))
    .filter((e) => e.studyId === study.id)
    .map((e) => e.sessionNo ?? 0);
  const sessionNo = Math.max(0, ...existingNos) + 1;
  const title = opts.title || `${study.title} ${sessionNo}회차`;

  const activity = await ensureCreated("activities", key, () => ({
    id: newId(),
    title,
    date: { start: dateIso, end: null },
    type: "스터디" as const,
    attendeeIds: [],
    sourceRequestId: key,
  }));

  return ensureCreated("events", key, () => ({
    id: newId(),
    title,
    date: { start: dateIso, end: null },
    type: "스터디" as const,
    status: "active" as const,
    pathId: randomToken(),
    attendCode: randomToken(),
    activityId: activity.id,
    applicantIds: [],
    presenterIds: [],
    studyId: study.id,
    sessionNo,
    autoGenerated: opts.autoGenerated,
    sourceRequestId: key,
  }));
}

export async function updateSession(
  studyId: string,
  eventId: string,
  patch: { title?: string; dateIso?: string },
): Promise<void> {
  await mutate("events", (rows) => {
    const idx = rows.findIndex((e) => e.id === eventId && e.studyId === studyId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = {
      ...rows[idx],
      title: patch.title || rows[idx].title,
      date: patch.dateIso ? { start: patch.dateIso, end: null } : rows[idx].date,
    };
    return rows;
  });
}

/** Cancelled is terminal — distinct from expired, never re-activatable. */
export async function cancelSession(studyId: string, eventId: string): Promise<void> {
  let cancelledKey: string | null = null;
  await mutate("events", (rows) => {
    const idx = rows.findIndex((e) => e.id === eventId && e.studyId === studyId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    cancelledKey = rows[idx].sourceRequestId;
    rows[idx] = { ...rows[idx], status: "cancelled" };
    return rows;
  });
  // Unhook the schedule entry so the slot is visibly cancelled, not "pending".
  if (cancelledKey) {
    await mutate("studies", (rows) =>
      rows.map((s) =>
        s.id === studyId
          ? {
              ...s,
              schedule: s.schedule.map((entry) =>
                sessionKey(studyId, entry.date) === cancelledKey
                  ? { ...entry, generatedEventId: eventId }
                  : entry,
              ),
            }
          : s,
      ),
    );
  }
}

export async function registerSchedule(studyId: string, dates: string[]): Promise<void> {
  if (dates.length === 0) throw new AppError("VALIDATION_FAILED");
  await patchStudy(studyId, (s) => {
    if (s.status === "finished") throw new AppError("CONFLICT");
    const existing = new Set(s.schedule.map((e) => e.date));
    const additions = dates
      .filter((d) => !existing.has(d))
      .map((date) => ({ date, generatedEventId: null }));
    return { ...s, schedule: [...s.schedule, ...additions] };
  });
}

/** The cron step BE-49 registers: due schedule entries become sessions. */
export const studySessionCronStep: CronStep = {
  name: "generate-study-sessions",
  run: async () => {
    let generated = 0;
    const now = new Date();
    const studies = await getTable("studies");
    for (const study of studies) {
      if (study.status === "finished") continue;
      for (const entry of study.schedule) {
        if (entry.generatedEventId || new Date(entry.date) > now) continue;
        // events first, schedule second (§2): a crash between the two re-runs
        // safely — ensureCreated dedupes on the composite key.
        const event = await createStudySession(study, entry.date, { autoGenerated: true });
        await mutate("studies", (rows) =>
          rows.map((s) =>
            s.id === study.id
              ? {
                  ...s,
                  schedule: s.schedule.map((e) =>
                    e.date === entry.date ? { ...e, generatedEventId: event.id } : e,
                  ),
                }
              : s,
          ),
        );
        generated++;
      }
    }
    return { generated };
  },
};

// ---- organizer handover (STU-07 / BE-50) ------------------------------------

export async function proposeTransfer(
  studyId: string,
  organizerId: string,
  toMemberId: string,
): Promise<void> {
  if (toMemberId === organizerId) throw new AppError("VALIDATION_FAILED"); // self-transfer
  const target = (await getTable("members")).find((m) => m.id === toMemberId);
  if (!target || target.status === "withdrawn") throw new AppError("VALIDATION_FAILED");

  await patchStudy(studyId, (s) => {
    if (s.pendingTransfer) throw new AppError("CONFLICT");
    return { ...s, pendingTransfer: { toMemberId, requestedAt: nowKstIso() } };
  });
}

export async function cancelTransfer(studyId: string): Promise<void> {
  await patchStudy(studyId, (s) => ({ ...s, pendingTransfer: null }));
}

/** The target's acceptance completes the handover atomically in one mutate. */
export async function acceptTransfer(studyId: string, memberId: string): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (s.pendingTransfer?.toMemberId !== memberId) throw new AppError("NOT_FOUND");
    const from = s.organizerIds[0] ?? "";
    return {
      ...s,
      organizerIds: [memberId],
      pendingTransfer: null,
      participantIds: s.participantIds.includes(memberId)
        ? s.participantIds
        : [...s.participantIds, memberId],
      transferHistory: [
        ...s.transferHistory,
        { from, to: memberId, at: nowKstIso(), byAdmin: false },
      ],
    };
  });
}

export async function declineTransfer(studyId: string, memberId: string): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (s.pendingTransfer?.toMemberId !== memberId) throw new AppError("NOT_FOUND");
    return { ...s, pendingTransfer: null };
  });
}

// ---- attendance (STU-05 / BE-51) --------------------------------------------

/** Session×participant attendance sheet for the organizer. */
export async function getAttendanceSheet(study: Study) {
  const [events, activities, members] = await Promise.all([
    getTable("events"),
    getTable("activities"),
    getTable("members"),
  ]);
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const sessions = events
    .filter((e) => e.studyId === study.id && e.status !== "cancelled")
    .sort((a, b) => (a.sessionNo ?? 0) - (b.sessionNo ?? 0))
    .map((e) => ({
      eventId: e.id,
      sessionNo: e.sessionNo,
      title: e.title,
      date: e.date.start,
      status: effectiveStatus(e),
      attendPath: `/events/${e.pathId}/${e.attendCode}`,
      attendeeIds: activityById.get(e.activityId)?.attendeeIds ?? [],
    }));

  const participants = study.participantIds.map((id) => ({
    id,
    name: memberById.get(id)?.name ?? "Unknown",
    department: memberById.get(id)?.department ?? "",
  }));

  return { sessions, participants };
}

/** Same merge rule as the presenter save — walk-ins survive (§6-6). */
export async function saveStudyAttendance(
  study: Study,
  eventId: string,
  selectedIds: string[],
): Promise<void> {
  const event = (await getTable("events")).find((e) => e.id === eventId);
  if (!event || event.studyId !== study.id) throw new AppError("NOT_FOUND");

  const { mergeAttendees, invalidateAttendanceCaches } = await import(
    "$lib/server/attendance"
  );
  let touched: string[] = [];
  await mutate("activities", (rows) => {
    const idx = rows.findIndex((a) => a.id === event.activityId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const next = mergeAttendees(rows[idx].attendeeIds, study.participantIds, selectedIds);
    touched = [...new Set([...rows[idx].attendeeIds, ...next])];
    rows[idx] = { ...rows[idx], attendeeIds: next };
    return rows;
  });
  await invalidateAttendanceCaches(touched);
}
