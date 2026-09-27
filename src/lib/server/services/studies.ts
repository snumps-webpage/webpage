import { AppError } from "$lib/server/core/errors";
import { newId, randomToken } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { getDirectoryIndex } from "$lib/server/data/directory";
import { mergeAttendees } from "$lib/server/attendance";
import { callFlow, type FlowResult } from "$lib/server/data/flows";
import {
  StudyRequestSchema,
  type Event,
  type Study,
  type StudyRequest,
} from "$lib/server/data/schemas";
import { effectiveStatus } from "./events";

/**
 * Study lifecycle (API-SPEC §6 / BE-47~51): proposal → approval → recruiting
 * → sessions → attendance, plus the two-phase organizer handover.
 * Session idempotency key is the composite `<studyId>:<date>`.
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

export async function withdrawStudyRequest(
  id: string,
  memberId: string,
): Promise<void> {
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
  // The study and the request's flip in one transaction, judged on the
  // request as it is now (flow_approve_study_request).
  const { request } = await callFlow<FlowResult & { request: unknown }>(
    "flow_approve_study_request",
    { id, studyId: newId() },
  );
  return StudyRequestSchema.parse(request);
}

export async function rejectStudy(id: string): Promise<StudyRequest> {
  const request = (await getTable("study-requests")).find((r) => r.id === id);
  if (!request) throw new AppError("NOT_FOUND");
  await mutate("study-requests", (rows) =>
    rows.map((r) => {
      if (r.id !== id) return r;
      if (r.status !== "pending") throw new AppError("CONFLICT"); // CAS
      return { ...r, status: "rejected" as const };
    }),
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

export async function joinStudy(
  studyId: string,
  memberId: string,
): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (s.status !== "recruiting") throw new AppError("STUDY_NOT_RECRUITING");
    if (
      s.participantIds.includes(memberId) ||
      s.pendingParticipantIds.includes(memberId)
    ) {
      return s; // idempotent
    }
    return {
      ...s,
      pendingParticipantIds: [...s.pendingParticipantIds, memberId],
    };
  });
}

export async function leaveStudy(
  studyId: string,
  memberId: string,
): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (s.organizerIds.includes(memberId)) throw new AppError("CONFLICT"); // hand over first
    return {
      ...s,
      participantIds: s.participantIds.filter((id) => id !== memberId),
      pendingParticipantIds: s.pendingParticipantIds.filter(
        (id) => id !== memberId,
      ),
    };
  });
}

export async function acceptParticipant(
  studyId: string,
  memberId: string,
): Promise<void> {
  await patchStudy(studyId, (s) => ({
    ...s,
    pendingParticipantIds: s.pendingParticipantIds.filter(
      (id) => id !== memberId,
    ),
    participantIds: s.participantIds.includes(memberId)
      ? s.participantIds
      : [...s.participantIds, memberId],
  }));
}

export async function removeParticipant(
  studyId: string,
  memberId: string,
): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (s.organizerIds.includes(memberId)) throw new AppError("CONFLICT");
    return {
      ...s,
      participantIds: s.participantIds.filter((id) => id !== memberId),
      pendingParticipantIds: s.pendingParticipantIds.filter(
        (id) => id !== memberId,
      ),
    };
  });
}

export async function setStudyStatus(
  studyId: string,
  status: Study["status"],
): Promise<void> {
  await patchStudy(studyId, (s) => {
    // §6-4: recruiting ↔ ongoing → finished. Finished is terminal — an
    // organizer must not resurrect a study whose sessions/cron treat it as
    // closed (review M1). Admin plenary updateStudy stays unrestricted.
    if (s.status === "finished" && status !== "finished") {
      throw new AppError("CONFLICT");
    }
    return { ...s, status };
  });
}

// ---- sessions (STU-03 / STU-06 / BE-49) -------------------------------------

/**
 * Creates the activity+event pair for one session — one transaction
 * (flow_create_study_session). Idempotent on the composite key, so a repeated
 * click returns the same session; the session number is taken under the lock,
 * so two sessions created at once never share one. A cancelled session holds
 * its slot forever (review M2) — refused visibly, pick a different datetime.
 */
export async function createStudySession(
  study: Study,
  dateIso: string,
  opts: { title?: string; autoGenerated: boolean },
): Promise<Event> {
  const { event } = await callFlow<FlowResult & { event: Event }>(
    "flow_create_study_session",
    {
      studyId: study.id,
      date: dateIso,
      title: opts.title ?? "",
      autoGenerated: opts.autoGenerated,
      activityId: newId(),
      eventId: newId(),
      pathId: randomToken(),
      attendCode: randomToken(),
    },
    {
      messages: {
        "session-slot-cancelled":
          "취소된 회차와 같은 일시입니다. 다른 일시를 선택해 주세요.",
      },
    },
  );
  return event;
}

/**
 * Corrects a session's title and/or start. The event and its activity move
 * together (flow_update_study_session) — archives and term grouping key off
 * the ACTIVITY's date (review M5). The composite key keeps the ORIGINAL date
 * on purpose: the old slot stays consumed, a session at the new datetime is
 * a different slot.
 */
export async function updateSession(
  studyId: string,
  eventId: string,
  patch: { title?: string; dateIso?: string },
): Promise<void> {
  await callFlow("flow_update_study_session", {
    studyId,
    eventId,
    title: patch.title ?? "",
    date: patch.dateIso ?? "",
  });
}

/** Cancelled is terminal — distinct from expired, never re-activatable. */
export async function cancelSession(
  studyId: string,
  eventId: string,
): Promise<void> {
  await mutate("events", (rows) => {
    const idx = rows.findIndex(
      (e) => e.id === eventId && e.studyId === studyId,
    );
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], status: "cancelled" };
    return rows;
  });
}

// ---- organizer handover (STU-07 / BE-50) ------------------------------------

export async function proposeTransfer(
  studyId: string,
  organizerId: string,
  toMemberId: string,
): Promise<void> {
  if (toMemberId === organizerId) throw new AppError("VALIDATION_FAILED"); // self-transfer
  const target = (await getTable("members")).find((m) => m.id === toMemberId);
  if (!target || target.status === "withdrawn")
    throw new AppError("VALIDATION_FAILED");

  await patchStudy(studyId, (s) => {
    if (s.pendingTransfer) throw new AppError("CONFLICT");
    return { ...s, pendingTransfer: { toMemberId, requestedAt: nowKstIso() } };
  });
}

export async function cancelTransfer(studyId: string): Promise<void> {
  await patchStudy(studyId, (s) => ({ ...s, pendingTransfer: null }));
}

/** The target's acceptance completes the handover atomically in one mutate. */
export async function acceptTransfer(
  studyId: string,
  memberId: string,
): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (!s.pendingTransfer) throw new AppError("NOT_FOUND"); // withdrawn/expired proposal
    if (s.pendingTransfer.toMemberId !== memberId)
      throw new AppError("FORBIDDEN"); // §6-5
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

export async function declineTransfer(
  studyId: string,
  memberId: string,
): Promise<void> {
  await patchStudy(studyId, (s) => {
    if (!s.pendingTransfer) throw new AppError("NOT_FOUND");
    if (s.pendingTransfer.toMemberId !== memberId)
      throw new AppError("FORBIDDEN");
    return { ...s, pendingTransfer: null };
  });
}

// ---- attendance (STU-05 / BE-51) --------------------------------------------

/** Session×participant attendance sheet for the organizer. */
export async function getAttendanceSheet(study: Study) {
  const [events, activities, memberById] = await Promise.all([
    getTable("events"),
    getTable("activities"),
    getDirectoryIndex(), // 표시용 — 이주된 스터디의 participantIds는 legacy id
  ]);
  const activityById = new Map(activities.map((a) => [a.id, a]));

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

  await mutate("activities", (rows) => {
    const idx = rows.findIndex((a) => a.id === event.activityId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const next = mergeAttendees(
      rows[idx].attendeeIds,
      study.participantIds,
      selectedIds,
    );
    rows[idx] = { ...rows[idx], attendeeIds: next };
    return rows;
  });
}
