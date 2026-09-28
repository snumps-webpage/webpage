import { AppError, definedOnly } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { getTable, mutate } from "$lib/server/data/tables";
import { audit } from "$lib/server/data/audit";
import { promoteSeminarPoster } from "$lib/server/services/uploads";
import { forgetUnreferencedAssets } from "./asset-cleanup";
import { assertOrganizerCandidates, handOver } from "./studies";
import { isStudyClosed } from "$lib/domain/studies";
import { callFlow, type FlowResult } from "$lib/server/data/flows";
import { SeminarSchema } from "$lib/server/data/schemas";
import type {
  Activity,
  GalleryDinner,
  Seminar,
  Study,
} from "$lib/server/data/schemas";

/**
 * Record editors (API-SPEC §7-4 / BE-54): activities, seminars, studies,
 * dinner gallery. Deletes verify referential integrity; setAttendees is the
 * ONE sanctioned wholesale overwrite; setOrganizer is the admin's bypass of
 * the two-phase transfer and clears any pending proposal.
 */

// ---- activities -------------------------------------------------------------

export async function createActivity(
  input: Pick<Activity, "title" | "date" | "type">,
): Promise<Activity> {
  const row: Activity = {
    id: newId(),
    ...input,
    attendeeIds: [],
    sourceRequestId: null,
  };
  await mutate("activities", (rows) => [...rows, row]);
  return row;
}

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));

/**
 * Title and date of a seminar's activity (flow_update_seminar_schedule /
 * _record) and of a study session's activity (flow_update_study_session)
 * move together with their seminar or attendance event. Changing them here
 * alone split archive, attendance window and public detail, and the next
 * seminar edit overwrote it anyway (audit LB28-2) — so those changes are
 * refused with a pointer to the owning editor. Type stays editable, and a
 * re-sent unchanged title or date is no change.
 */
function pairedOwner(
  activity: Activity,
  seminars: Seminar[],
  events: { activityId: string; studyId: string | null }[],
): string | null {
  if (
    seminars.some(
      (s) =>
        s.activityId === activity.id ||
        activity.sourceRequestId === `seminar:${s.id}`,
    )
  )
    return "세미나 활동의 제목·일정은 세미나 관리에서 수정해 주세요.";
  if (events.some((e) => e.studyId !== null && e.activityId === activity.id))
    return "스터디 회차 활동의 제목·일정은 스터디 관리에서 수정해 주세요.";
  return null;
}

export async function updateActivity(
  id: string,
  patch: Partial<Pick<Activity, "title" | "date" | "type">>,
): Promise<void> {
  const [seminars, events] = await Promise.all([
    getTable("seminars"),
    getTable("events"),
  ]);
  await mutate("activities", (rows) => {
    const idx = rows.findIndex((a) => a.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const current = rows[idx];
    const moves =
      (patch.title !== undefined && patch.title !== current.title) ||
      (patch.date !== undefined &&
        !(
          sameInstant(patch.date.start, current.date.start) &&
          sameInstant(patch.date.end, current.date.end)
        ));
    const owner = moves ? pairedOwner(current, seminars, events) : null;
    if (owner) throw new AppError("CONFLICT", { userMessage: owner });
    rows[idx] = { ...rows[idx], ...definedOnly(patch) };
    return rows;
  });
}

export async function deleteActivity(id: string): Promise<void> {
  // refused while an event, gallery entry or seminar points at it — checked
  // and deleted under one lock (flow_delete_activity)
  await callFlow("flow_delete_activity", { id });
}

/** Admin plenary overwrite — merge rule deliberately NOT applied (§7-4). */
export async function setAttendees(
  id: string,
  attendeeIds: string[],
): Promise<void> {
  await mutate("activities", (rows) => {
    const idx = rows.findIndex((a) => a.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], attendeeIds: [...new Set(attendeeIds)] };
    return rows;
  });
}

// ---- seminars ---------------------------------------------------------------

export async function createSeminar(
  input: Pick<
    Seminar,
    "title" | "semester" | "note" | "presenterIds" | "externalPresenters"
  > &
    Partial<Pick<Seminar, "kind" | "durationMinutes" | "prerequisites">>,
  posterPendingKey = "",
): Promise<Seminar> {
  const { kind = null, durationMinutes = null, prerequisites = "" } = input;
  const row: Seminar = {
    id: newId(),
    ...input,
    kind,
    durationMinutes,
    prerequisites,
    description: "",
    materials: [],
    photos: [],
    // 이 경로에는 아직 일정 입력 칸이 없다(입력은 title·semester·note·발표자뿐).
    // 일정 확정 흐름이 필요하면 승인 경로를 쓴다.
    publicationStatus: "published",
    // 아카이브 기록이지 알릴 행사가 아니다 — 나중에 앞날의 일정을 줘도 전 회원
    // 공지·일정 변경·취소 안내가 나가지 않는다 (#21, flow_publish_seminar).
    announce: false,
    schedule: null,
    announcedAt: null,
    // 관리자가 학기를 직접 입력하는 유일한 경로 — 이후 일정 변경이 덮지 않는다.
    semesterPinned: true,
    // 신청 흐름과 동일한 단일 소스 헬퍼 — 포스터 처리가 루트마다 갈라지지 않는다
    posterKey: await promoteSeminarPoster(posterPendingKey),
    preferredTiming: "",
    activityId: null,
    sourceRequestId: null,
  };
  await mutate("seminars", (rows) => [...rows, row]);
  return row;
}

export async function updateSeminar(
  id: string,
  patch: Partial<
    Pick<
      Seminar,
      | "title"
      | "semester"
      | "note"
      | "presenterIds"
      | "externalPresenters"
      | "activityId"
      | "kind"
      | "durationMinutes"
      | "prerequisites"
    >
  >,
  posterPendingKey = "",
): Promise<void> {
  // The flow has no zod gate: each field is checked by the stored schema
  // here, before it is written (the lesson of audit LA09-1).
  const checked = SeminarSchema.partial().safeParse(definedOnly(patch));
  if (!checked.success) throw new AppError("VALIDATION_FAILED");
  const promotedPoster = posterPendingKey
    ? await promoteSeminarPoster(posterPendingKey)
    : null;
  // One transaction: the row, and — for a published seminar — the title and
  // presenters its activity and attendance event carry (audit LB28-1), with
  // the presenters' automatic credit on the activity moving to the new ones
  // (#14). The flow also pins a term the admin actually changed: the editor
  // resends an unchanged term every time, and reading that as a decision
  // would stop every record's term derivation after one save.
  const { replacedPoster } = await callFlow<
    FlowResult & { replacedPoster: string | null }
  >("flow_update_seminar_record", {
    id,
    patch: definedOnly(checked.data),
    posterKey: promotedPoster,
  });
  // 교체된 포스터는 어느 기록도 가리키지 않는다 — 남겨 두면 용량과 백업만 먹는다.
  await forgetUnreferencedAssets([replacedPoster]);
}

/**
 * Deletes a seminar record — one transaction in flow_delete_seminar
 * (supabase/migrations/20260928000000_atomic_flows.sql, ATOMIC-FLOWS.md). A
 * cancelled or unpublished seminar takes its hidden activity, sessions and
 * queues with it (refused while attendance evidence or other references
 * remain) and leaves its request marked closed. The function locks what it
 * reads, so a publish or cancel racing the delete cannot slip between the
 * decision and the write. Files are cleaned after the commit, only those
 * nothing references any more.
 */
export async function deleteSeminar(id: string): Promise<void> {
  const { assets } = await callFlow<FlowResult & { assets: string[] }>(
    "flow_delete_seminar",
    { id },
  );
  await forgetUnreferencedAssets(assets);
}

/** One file-array editor for all three photo/material fields (review M11). */
async function setFileArray(
  table: "seminars" | "studies" | "gallery-dinner",
  id: string,
  field: string,
  op: { add?: string; remove?: string },
): Promise<void> {
  await mutate(table, (rows) => {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const row = rows[idx] as Record<string, unknown>;
    let files = row[field] as string[];
    // 지울 키는 폼의 hidden 필드로 온다 — 즉 **클라이언트가 고른다.** 이 기록이
    // 갖고 있지 않은 키라면 거절한다. 예전에는 조용히 통과했고(기록이 안 바뀌면
    // mutate가 쓰기를 건너뛴다), 그런데도 그 키를 버킷에서 지웠다 — 다른 기록의
    // 파일을 지우고 화면에는 성공으로 보이는 길이었다.
    if (op.remove && !files.includes(op.remove))
      throw new AppError("NOT_FOUND");
    if (op.add) files = [...new Set([...files, op.add])];
    if (op.remove) files = files.filter((f) => f !== op.remove);
    rows[idx] = { ...rows[idx], [field]: files };
    return rows;
  });
  if (op.remove) await forgetUnreferencedAssets([op.remove]);
}

export function setSeminarFiles(
  id: string,
  field: "materials" | "photos",
  op: { add?: string; remove?: string },
): Promise<void> {
  return setFileArray("seminars", id, field, op);
}

// ---- studies ----------------------------------------------------------------

export async function createStudy(
  input: Pick<
    Study,
    "title" | "semester" | "textbook" | "description" | "note" | "organizerIds"
  >,
): Promise<Study> {
  if (input.organizerIds.length === 0) throw new AppError("VALIDATION_FAILED");
  // The same organizer rule as a handover, and the organizer is a participant
  // as the approve flow makes the requester one — an admin-made study left
  // its organizer off the attendance sheet and put them on the waiting list
  // when they joined (audit LB28-4).
  await assertOrganizerCandidates(input.organizerIds);
  const row: Study = {
    id: newId(),
    ...input,
    participantIds: [...new Set(input.organizerIds)],
    pendingParticipantIds: [],
    pendingTransfer: null,
    schedule: [],
    transferHistory: [],
    photos: [],
    status: "recruiting",
    sourceRequestId: null,
  };
  await mutate("studies", (rows) => [...rows, row]);
  return row;
}

export async function updateStudy(
  id: string,
  patch: Partial<
    Pick<
      Study,
      "title" | "semester" | "textbook" | "description" | "note" | "status"
    >
  >,
): Promise<void> {
  await mutate("studies", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const next = { ...rows[idx], ...definedOnly(patch) };
    // Closing here (the admin exception to #4/#20) clears what no one could
    // answer on a closed study, as the organizer's close does.
    rows[idx] =
      isStudyClosed(next.status) && !isStudyClosed(rows[idx].status)
        ? { ...next, pendingParticipantIds: [], pendingTransfer: null }
        : next;
    return rows;
  });
}

export async function deleteStudy(id: string): Promise<void> {
  // refused while it has sessions — checked and deleted under one lock
  // (flow_delete_study); photos are cleaned after the commit
  const { assets } = await callFlow<FlowResult & { assets: string[] }>(
    "flow_delete_study",
    { id },
  );
  await forgetUnreferencedAssets(assets);
}

/**
 * Admin plenary transfer (§7-4): skips the two-phase consent, clears any
 * in-flight proposal (otherwise its later acceptance would silently undo
 * this), records history with byAdmin, and audits.
 */
export async function setOrganizer(
  studyId: string,
  newOrganizerId: string,
  actorId: string,
): Promise<void> {
  // Same target check and same handover write as the two-phase proposal and
  // its acceptance (studies.ts, audit LB28-4).
  await assertOrganizerCandidates([newOrganizerId]);

  await mutate("studies", (rows) => {
    const idx = rows.findIndex((s) => s.id === studyId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = handOver(rows[idx], newOrganizerId, { byAdmin: true });
    return rows;
  });
  await audit({
    actorMemberId: actorId,
    action: "study.set-organizer",
    targetTable: "studies",
    targetId: studyId,
    detail: { to: newOrganizerId },
  });
}

export function setStudyPhotos(
  id: string,
  op: { add?: string; remove?: string },
): Promise<void> {
  return setFileArray("studies", id, "photos", op);
}

// ---- dinner gallery ---------------------------------------------------------

export async function createGalleryEntry(
  input: Pick<GalleryDinner, "year" | "activityId">,
): Promise<GalleryDinner> {
  const row: GalleryDinner = { id: newId(), ...input, photos: [] };
  await mutate("gallery-dinner", (rows) => [...rows, row]);
  return row;
}

export async function updateGalleryEntry(
  id: string,
  patch: Partial<Pick<GalleryDinner, "year" | "activityId">>,
): Promise<void> {
  await mutate("gallery-dinner", (rows) => {
    const idx = rows.findIndex((g) => g.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], ...definedOnly(patch) };
    return rows;
  });
}

export async function deleteGalleryEntry(id: string): Promise<void> {
  let photos: string[] = [];
  await mutate("gallery-dinner", (rows) => {
    const row = rows.find((g) => g.id === id);
    if (!row) throw new AppError("NOT_FOUND");
    photos = row.photos;
    return rows.filter((g) => g.id !== id);
  });
  await forgetUnreferencedAssets(photos);
}

export function setGalleryPhotos(
  id: string,
  op: { add?: string; remove?: string },
): Promise<void> {
  return setFileArray("gallery-dinner", id, "photos", op);
}
