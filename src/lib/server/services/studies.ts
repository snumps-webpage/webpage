import { AppError } from "$lib/server/core/errors";
import { newId, randomToken } from "$lib/server/core/id";
import { isKstInstant, nowKstIso } from "$lib/server/core/time";
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

/** Found and judged on the stored row (not the cache), like the withdrawal. */
export async function rejectStudy(id: string): Promise<StudyRequest> {
  let rejected: StudyRequest | undefined;
  await mutate("study-requests", (rows) => {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    if (rows[idx].status !== "pending") throw new AppError("CONFLICT");
    rejected = { ...rows[idx], status: "rejected" };
    rows[idx] = rejected;
    return rows;
  });
  return rejected!;
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
  await patchStudy(studyId, (s) => {
    if (s.participantIds.includes(memberId)) return s; // idempotent
    // §6-4 pending → participants: only someone who asked and still waits
    if (!s.pendingParticipantIds.includes(memberId)) {
      throw new AppError("NOT_FOUND", {
        userMessage: "참여 신청 대기 중인 회원이 아닙니다.",
      });
    }
    return {
      ...s,
      pendingParticipantIds: s.pendingParticipantIds.filter(
        (id) => id !== memberId,
      ),
      participantIds: [...s.participantIds, memberId],
    };
  });
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
  // The flow stores this date on the activity and the event with no zod
  // gate — a value the schema refuses would make both tables unreadable.
  if (!isKstInstant(dateIso)) throw new AppError("VALIDATION_FAILED");
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
 * a different slot. A cancelled session is refused — terminal, like its slot.
 */
export async function updateSession(
  studyId: string,
  eventId: string,
  patch: { title?: string; dateIso?: string },
): Promise<void> {
  // stored by the flow without a zod gate (see createStudySession)
  if (patch.dateIso !== undefined && !isKstInstant(patch.dateIso)) {
    throw new AppError("VALIDATION_FAILED");
  }
  await callFlow(
    "flow_update_study_session",
    {
      studyId,
      eventId,
      title: patch.title ?? "",
      date: patch.dateIso ?? "",
    },
    {
      messages: { "session-cancelled": "취소된 회차는 정정할 수 없습니다." },
    },
  );
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

/**
 * Who may organize a study: a member on the roster who is not withdrawing. A
 * ghost or grace-period member as sole organizer leaves the study
 * unmanageable (review M6). The one check for every way a study gets an
 * organizer — creation, the two-phase proposal, the admin's direct transfer
 * (audit LB28-4).
 */
export async function assertOrganizerCandidates(
  memberIds: readonly string[],
): Promise<void> {
  const members = await getTable("members");
  for (const id of memberIds) {
    const member = members.find((m) => m.id === id);
    if (!member || member.status === "withdrawn")
      throw new AppError("VALIDATION_FAILED");
  }
}

/**
 * The study after `to` takes it over: the sole organizer, also a participant
 * (the organizer is on the attendance sheet like the approve flow's
 * requester), no proposal left in flight, the handover recorded. The one
 * write for the member's acceptance and the admin's transfer (audit LB28-4).
 */
export function handOver(
  study: Study,
  to: string,
  { byAdmin }: { byAdmin: boolean },
): Study {
  return {
    ...study,
    organizerIds: [to],
    pendingTransfer: null,
    participantIds: study.participantIds.includes(to)
      ? study.participantIds
      : [...study.participantIds, to],
    transferHistory: [
      ...study.transferHistory,
      { from: study.organizerIds[0] ?? "", to, at: nowKstIso(), byAdmin },
    ],
  };
}

export async function proposeTransfer(
  studyId: string,
  organizerId: string,
  toMemberId: string,
): Promise<void> {
  if (toMemberId === organizerId) throw new AppError("VALIDATION_FAILED"); // self-transfer
  await assertOrganizerCandidates([toMemberId]);

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
    return handOver(s, memberId, { byAdmin: false });
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
  // Cancelled is terminal, so the cached read can only be late to see it —
  // a save racing the cancel is one that came just before it.
  if (event.status === "cancelled") {
    throw new AppError("CONFLICT", {
      userMessage: "취소된 회차에는 출석을 기록할 수 없습니다.",
    });
  }

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
