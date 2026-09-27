import { AppError, definedOnly } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import {
  deleteQueue,
  getQueue,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { audit } from "$lib/server/data/audit";
import { promoteSeminarPoster } from "$lib/server/services/uploads";
import { forgetUnreferencedAssets } from "./asset-cleanup";
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

export async function updateActivity(
  id: string,
  patch: Partial<Pick<Activity, "title" | "date" | "type">>,
): Promise<void> {
  await mutate("activities", (rows) => {
    const idx = rows.findIndex((a) => a.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], ...definedOnly(patch) };
    return rows;
  });
}

export async function deleteActivity(id: string): Promise<void> {
  const [events, galleries, seminars] = await Promise.all([
    getTable("events"),
    getTable("gallery-dinner"),
    getTable("seminars"),
  ]);
  const referenced =
    events.some((e) => e.activityId === id) ||
    galleries.some((g) => g.activityId === id) ||
    seminars.some((s) => s.activityId === id);
  if (referenced) throw new AppError("CONFLICT");

  await mutate("activities", (rows) => {
    if (!rows.some((a) => a.id === id)) throw new AppError("NOT_FOUND");
    return rows.filter((a) => a.id !== id);
  });
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
  >,
  posterPendingKey = "",
): Promise<Seminar> {
  const row: Seminar = {
    id: newId(),
    ...input,
    description: "",
    materials: [],
    photos: [],
    // 이 경로에는 아직 일정 입력 칸이 없다(입력은 title·semester·note·발표자뿐).
    // 일정 확정 흐름이 필요하면 승인 경로를 쓴다.
    publicationStatus: "published",
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
    >
  >,
  posterPendingKey = "",
): Promise<void> {
  const promotedPoster = posterPendingKey
    ? await promoteSeminarPoster(posterPendingKey)
    : null;
  let replacedPoster: string | null = null;
  await mutate("seminars", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    // CAS 재시도마다 다시 센다 — 진 시도의 값이 남으면 엉뚱한 키를 지운다.
    replacedPoster =
      promotedPoster !== null && rows[idx].posterKey !== promotedPoster
        ? rows[idx].posterKey || null
        : null;
    // 학기를 **실제로 바꾸면** 그것은 관리자의 결정이고, 이후 자동 도출이
    // 덮어서는 안 된다. 편집기는 바뀌지 않은 학기도 매번 보내므로 값이 같은
    // 저장은 고정으로 읽지 않는다 — 한 번 저장했다는 이유로 모든 기록의 학기
    // 자동화가 멈추게 된다.
    const pinned =
      patch.semester !== undefined && patch.semester !== rows[idx].semester;
    rows[idx] = {
      ...rows[idx],
      ...definedOnly(patch),
      ...(pinned ? { semesterPinned: true } : {}),
      ...(promotedPoster !== null ? { posterKey: promotedPoster } : {}),
    };
    return rows;
  });
  // 교체된 포스터는 어느 기록도 가리키지 않는다 — 남겨 두면 용량과 백업만 먹는다.
  await forgetUnreferencedAssets([replacedPoster]);
}

/**
 * An unpublished or cancelled seminar is what hides its activity
 * (visibility.ts); without the seminar row that activity goes public again.
 * So the delete takes the hidden activity and its sessions with it — unless
 * someone besides the presenters was credited or a check-in is still open.
 * That is attendance evidence (it counts toward regular membership) and must
 * be cleared by hand (activity editor / attendance queue), not lost silently.
 * The presenters' own credit is stamped automatically at publication, so it
 * proves nothing and does not block.
 *
 * Anything else hanging off the activity — another seminar, a gallery entry,
 * a study session — would be left dangling, so that refuses too.
 *
 * Not atomic. Order: the activity (credit re-checked inside the write, so a
 * refusal leaves everything in place), then its sessions, then (in the
 * caller) the source request and the seminar. A failure part-way leaves the
 * seminar row, which keeps hiding whatever is left, and a retry finishes.
 */
async function retireHiddenActivity(seminar: Seminar): Promise<void> {
  const activityId = seminar.activityId!;
  const [seminars, activities, events, galleries] = await Promise.all([
    getTable("seminars"),
    getTable("activities"),
    getTable("events"),
    getTable("gallery-dinner"),
  ]);
  const sessions = events.filter((e) => e.activityId === activityId);
  if (
    seminars.some((s) => s.id !== seminar.id && s.activityId === activityId) ||
    galleries.some((g) => g.activityId === activityId) ||
    sessions.some((e) => e.studyId !== null)
  ) {
    throw new AppError("CONFLICT");
  }
  const credited = (a: Activity | undefined) =>
    !!a && a.attendeeIds.some((id) => !seminar.presenterIds.includes(id));
  if (credited(activities.find((a) => a.id === activityId))) {
    throw new AppError("CONFLICT");
  }
  for (const e of sessions) {
    if ((await getQueue(e.id)).some((r) => r.status !== "rejected")) {
      throw new AppError("CONFLICT");
    }
  }

  await mutate("activities", (rows) => {
    if (credited(rows.find((a) => a.id === activityId))) {
      throw new AppError("CONFLICT"); // credit landed after the check above
    }
    return rows.filter((a) => a.id !== activityId);
  });
  for (const e of sessions) await deleteQueue(e.id);
  await mutate("events", (rows) =>
    rows.filter((e) => e.activityId !== activityId),
  );
}

export async function deleteSeminar(id: string): Promise<void> {
  const seminar = (await getTable("seminars")).find((s) => s.id === id);
  if (!seminar) throw new AppError("NOT_FOUND");
  const hidden = seminar.publicationStatus !== "published";
  if (hidden && seminar.activityId) await retireHiddenActivity(seminar);

  let removed:
    { materials: string[]; photos: string[]; posterKey: string } | undefined;
  await mutate("seminars", (rows) => {
    const row = rows.find((s) => s.id === id);
    if (!row) throw new AppError("NOT_FOUND");
    // Everything above was decided from a read. A publish or cancel that
    // committed since (publish ∥ delete, cancel ∥ delete) changes what the
    // delete must take with it — refuse and let the admin retry on fresh state.
    if (
      row.publicationStatus !== seminar.publicationStatus ||
      row.activityId !== seminar.activityId
    ) {
      throw new AppError("WRITE_CONFLICT");
    }
    removed = {
      materials: row.materials,
      photos: row.photos,
      posterKey: row.posterKey,
    };
    return rows.filter((s) => s.id !== id);
  });
  // The hidden seminar was also what kept its approved request off the
  // presenter's dashboard (cancelledRequestIds); gone, the request would read
  // "승인" for a seminar that no longer exists. After the delete, so a refused
  // delete keeps it; unless another seminar still points at the same request.
  if (hidden && seminar.sourceRequestId) {
    const sharedBy = (await getTable("seminars")).some(
      (s) => s.sourceRequestId === seminar.sourceRequestId,
    );
    if (!sharedBy) {
      await mutate("seminar-requests", (rows) =>
        rows.filter((r) => r.id !== seminar.sourceRequestId),
      );
    }
  }
  await forgetUnreferencedAssets([
    ...removed!.materials,
    ...removed!.photos,
    removed!.posterKey,
  ]);
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
  const row: Study = {
    id: newId(),
    ...input,
    participantIds: [],
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
    rows[idx] = { ...rows[idx], ...definedOnly(patch) };
    return rows;
  });
}

export async function deleteStudy(id: string): Promise<void> {
  const events = await getTable("events");
  if (events.some((e) => e.studyId === id)) throw new AppError("CONFLICT");
  let photos: string[] = [];
  await mutate("studies", (rows) => {
    const row = rows.find((s) => s.id === id);
    if (!row) throw new AppError("NOT_FOUND");
    photos = row.photos;
    return rows.filter((s) => s.id !== id);
  });
  await forgetUnreferencedAssets(photos);
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
  // Same target validation as the two-phase proposal (review M6): a ghost or
  // grace-period member as sole organizer leaves the study unmanageable.
  const target = (await getTable("members")).find(
    (m) => m.id === newOrganizerId,
  );
  if (!target || target.status === "withdrawn")
    throw new AppError("VALIDATION_FAILED");

  await mutate("studies", (rows) => {
    const idx = rows.findIndex((s) => s.id === studyId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const study = rows[idx];
    const from = study.organizerIds[0] ?? "";
    rows[idx] = {
      ...study,
      organizerIds: [newOrganizerId],
      pendingTransfer: null,
      participantIds: study.participantIds.includes(newOrganizerId)
        ? study.participantIds
        : [...study.participantIds, newOrganizerId],
      transferHistory: [
        ...study.transferHistory,
        { from, to: newOrganizerId, at: nowKstIso(), byAdmin: true },
      ],
    };
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
