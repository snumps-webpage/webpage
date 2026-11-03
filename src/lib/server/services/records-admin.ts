import { AppError, definedOnly } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { getTable, mutate } from "$lib/server/data/tables";
import { audit } from "$lib/server/data/audit";
import { getDirectoryIndex } from "$lib/server/data/directory";
import { promoteSeminarPoster } from "$lib/server/services/uploads";
import { forgetUnreferencedAssets } from "./asset-cleanup";
import { assertOrganizerCandidates, handOver } from "./studies";
import { isStudyClosed } from "$lib/domain/studies";
import { callFlow, type FlowResult } from "$lib/server/data/flows";
import { SeminarSchema } from "$lib/server/data/schemas";
import { isStudyLinkType } from "$lib/constants";
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
    studyId: null,
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

/**
 * The study a study-session activity is fixed to: the study of the first
 * session event (an event with a study) that records into it, else null
 * (snumps-webpage/D-000088). Migrated activities no session points at are
 * not fixed. This is the editor's display rule; flow_set_activity_study
 * applies the same rule itself when it links (D-000099).
 */
export function sessionStudyOf(
  activityId: string,
  events: { activityId: string; studyId: string | null }[],
): string | null {
  return (
    events.find((e) => e.studyId !== null && e.activityId === activityId)
      ?.studyId ?? null
  );
}

const LINKED_TYPE_LIMITED =
  "스터디에 연결된 활동은 종류를 '스터디'나 '회식'으로만 바꿀 수 있습니다. 다른 종류로 바꾸려면 먼저 스터디 연결을 해제해 주세요.";
const SESSION_TYPE_FIXED = "스터디 회차 활동은 종류를 바꿀 수 없습니다.";

/**
 * Why this patch may not set the activity's type, or null. A study-session
 * activity stays '스터디' (D-000088·129·138) — only a move TO '스터디' passes,
 * the repair of old data. Any other linked activity must end up '스터디' or
 * '회식' (D-000138): a move between them passes, and so must a save of old
 * data that is still neither — kept or left out, its type is refused until
 * one of the two is picked.
 */
function typeRefusal(
  current: Activity,
  type: Activity["type"] | undefined,
  sessionStudyId: string | null,
): string | null {
  if (sessionStudyId !== null)
    return type !== undefined && type !== current.type && type !== "스터디"
      ? SESSION_TYPE_FIXED
      : null;
  if (current.studyId === null) return null;
  return isStudyLinkType(type ?? current.type) ? null : LINKED_TYPE_LIMITED;
}

/**
 * Type, title and date are the admin's to edit, with two exceptions: the
 * paired owner's title and date (above), and the type of an activity linked
 * to a study (`typeRefusal`, snumps-webpage/D-000138). Either refusal writes
 * nothing; when both apply, the type refusal is the one reported (D-000108).
 * A patch without a type leaves it as it is.
 */
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
    const refusal = typeRefusal(
      current,
      patch.type,
      sessionStudyOf(current.id, events),
    );
    if (refusal)
      throw new AppError("VALIDATION_FAILED", { userMessage: refusal });
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

const ACTIVITY_GONE =
  "활동 기록을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다. 화면을 새로 고쳐 주세요.";
const LINKED_STUDY_GONE =
  "선택한 스터디를 찾을 수 없습니다. 화면을 새로 고친 뒤 다시 골라 주세요.";

const SESSION_FIXED =
  "스터디 회차 활동은 그 회차의 스터디에 고정되어 있어 연결을 바꾸거나 해제할 수 없습니다.";

/**
 * Links a '스터디' or '회식' activity to a study, or unlinks it (`studyId`
 * null) — flow_set_activity_study checks the rows under one lock. Only those
 * two types may be linked here (snumps-webpage/D-000135); the flow leaves
 * that rule to its caller, read before the lock. A missing activity is
 * NOT_FOUND, a study that does not exist is a bad pick (VALIDATION_FAILED),
 * each with its own message (D-000062). A study-session activity stays with
 * its session's study: any other study, or unlinking, is refused — by the
 * flow, under its lock (D-000088·099); its own study again is a no-op
 * success (D-000109).
 */
export async function setActivityStudy(
  id: string,
  studyId: string | null,
): Promise<void> {
  const activity = (await getTable("activities")).find((a) => a.id === id);
  if (!activity)
    throw new AppError("NOT_FOUND", { userMessage: ACTIVITY_GONE });
  if (!isStudyLinkType(activity.type))
    throw new AppError("VALIDATION_FAILED", {
      userMessage:
        "종류가 '스터디'나 '회식'인 활동만 스터디에 연결할 수 있습니다.",
    });
  try {
    await callFlow(
      "flow_set_activity_study",
      { activityId: id, studyId },
      {
        messages: {
          activity: ACTIVITY_GONE,
          study: LINKED_STUDY_GONE,
          session: SESSION_FIXED,
        },
      },
    );
  } catch (e) {
    if (e instanceof AppError && e.userMessage === LINKED_STUDY_GONE)
      throw new AppError("VALIDATION_FAILED", {
        userMessage: LINKED_STUDY_GONE,
      });
    throw e;
  }
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
    Partial<
      Pick<Seminar, "kind" | "durationMinutes" | "prerequisites" | "videos">
    >,
  posterPendingKey = "",
): Promise<Seminar> {
  const {
    kind = null,
    durationMinutes = null,
    prerequisites = "",
    videos = [],
  } = input;
  const row: Seminar = {
    id: newId(),
    ...input,
    kind,
    durationMinutes,
    prerequisites,
    videos,
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
  const out = await callFlow<FlowResult & { seminar: Seminar }>(
    "flow_create_standalone_seminar",
    { seminar: row },
  );
  return out.seminar;
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
      | "videos"
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
  // refused while it has sessions or linked activities (D-000059) — checked
  // and deleted under one lock (flow_delete_study); photos are cleaned after
  // the commit
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
 *
 * Who may take it depends on the study (snumps-webpage/D-000044·054): a
 * recruiting or ongoing study keeps the two-phase proposal's rule (an
 * operating, non-withdrawn member — someone who can run it); a finished or
 * cancelled one is a record fix, so anyone in the merged directory, withdrawn
 * and legacy-only people included. The status is judged on the row being
 * written, so a study closed or reopened meanwhile gets its own rule.
 */
export async function setOrganizer(
  studyId: string,
  newOrganizerId: string,
  actorId: string,
): Promise<void> {
  // Same target check and same handover write as the two-phase proposal and
  // its acceptance (studies.ts, audit LB28-4).
  const [operating, directory] = await Promise.all([
    assertOrganizerCandidates([newOrganizerId]).then(
      () => true,
      (e: unknown) => {
        if (e instanceof AppError && e.code === "VALIDATION_FAILED")
          return false;
        throw e;
      },
    ),
    getDirectoryIndex(),
  ]);

  await mutate("studies", (rows) => {
    const idx = rows.findIndex((s) => s.id === studyId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const allowed = isStudyClosed(rows[idx].status)
      ? directory.has(newOrganizerId)
      : operating;
    if (!allowed)
      throw new AppError("VALIDATION_FAILED", {
        userMessage: isStudyClosed(rows[idx].status)
          ? "명부에 없는 사람은 주최자로 지정할 수 없습니다."
          : "모집 중·진행 중인 스터디의 주최자는 운영 명단의 회원만 맡을 수 있습니다.",
      });
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

/**
 * Admin participant editor (snumps-webpage/D-000043·057): replaces a study's
 * participants on any study, finished and cancelled included — a record fix,
 * not the organizer's join flow. Anyone in the merged directory may be named,
 * withdrawn and legacy-only people too; an id the study already records is
 * kept even when no directory knows it (saving must not force dropping it).
 * The organizers stay participants, as removeParticipant guards: a list
 * missing one is refused and nothing is written. The saved people leave the
 * waiting list. Audited with the ids added and removed.
 */
export async function setStudyParticipants(
  studyId: string,
  participantIds: string[],
  actorId: string,
): Promise<void> {
  const ids = [...new Set(participantIds)];
  const directory = await getDirectoryIndex();
  let before: string[] = [];
  await mutate("studies", (rows) => {
    const idx = rows.findIndex((s) => s.id === studyId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const study = rows[idx];
    if (
      ids.some((id) => !directory.has(id) && !study.participantIds.includes(id))
    )
      throw new AppError("VALIDATION_FAILED", {
        userMessage:
          "명부에 없는 사람이 들어 있습니다. 화면을 새로 고친 뒤 다시 저장해 주세요.",
      });
    if (study.organizerIds.some((id) => !ids.includes(id)))
      throw new AppError("VALIDATION_FAILED", {
        userMessage: "주최자는 참가자에서 뺄 수 없습니다.",
      });
    before = study.participantIds;
    rows[idx] = {
      ...study,
      participantIds: ids,
      pendingParticipantIds: study.pendingParticipantIds.filter(
        (id) => !ids.includes(id),
      ),
    };
    return rows;
  });
  await audit({
    actorMemberId: actorId,
    action: "study.set-participants",
    targetTable: "studies",
    targetId: studyId,
    detail: {
      added: ids.filter((id) => !before.includes(id)),
      removed: before.filter((id) => !ids.includes(id)),
    },
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
