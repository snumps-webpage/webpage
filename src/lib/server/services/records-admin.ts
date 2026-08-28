import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { audit } from "$lib/server/data/audit";
import { invalidateAttendanceCaches } from "$lib/server/attendance";
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
  const row: Activity = { id: newId(), ...input, attendeeIds: [], sourceRequestId: null };
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
    rows[idx] = { ...rows[idx], ...patch };
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
export async function setAttendees(id: string, attendeeIds: string[]): Promise<void> {
  let before: string[] = [];
  await mutate("activities", (rows) => {
    const idx = rows.findIndex((a) => a.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    before = rows[idx].attendeeIds;
    rows[idx] = { ...rows[idx], attendeeIds: [...new Set(attendeeIds)] };
    return rows;
  });
  await invalidateAttendanceCaches([...new Set([...before, ...attendeeIds])]);
}

// ---- seminars ---------------------------------------------------------------

export async function createSeminar(
  input: Pick<Seminar, "title" | "semester" | "note" | "presenterIds" | "externalPresenters">,
): Promise<Seminar> {
  const row: Seminar = {
    id: newId(),
    ...input,
    materials: [],
    photos: [],
    activityId: null,
    sourceRequestId: null,
  };
  await mutate("seminars", (rows) => [...rows, row]);
  return row;
}

export async function updateSeminar(
  id: string,
  patch: Partial<
    Pick<Seminar, "title" | "semester" | "note" | "presenterIds" | "externalPresenters" | "activityId">
  >,
): Promise<void> {
  await mutate("seminars", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], ...patch };
    return rows;
  });
}

export async function deleteSeminar(id: string): Promise<void> {
  await mutate("seminars", (rows) => {
    if (!rows.some((s) => s.id === id)) throw new AppError("NOT_FOUND");
    return rows.filter((s) => s.id !== id);
  });
}

export async function setSeminarFiles(
  id: string,
  field: "materials" | "photos",
  op: { add?: string; remove?: string },
): Promise<void> {
  await mutate("seminars", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    let files = rows[idx][field];
    if (op.add) files = [...new Set([...files, op.add])];
    if (op.remove) files = files.filter((f) => f !== op.remove);
    rows[idx] = { ...rows[idx], [field]: files };
    return rows;
  });
}

// ---- studies ----------------------------------------------------------------

export async function createStudy(
  input: Pick<Study, "title" | "semester" | "textbook" | "description" | "note" | "organizerIds">,
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
  patch: Partial<Pick<Study, "title" | "semester" | "textbook" | "description" | "note" | "status">>,
): Promise<void> {
  await mutate("studies", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], ...patch };
    return rows;
  });
}

export async function deleteStudy(id: string): Promise<void> {
  const events = await getTable("events");
  if (events.some((e) => e.studyId === id)) throw new AppError("CONFLICT");
  await mutate("studies", (rows) => {
    if (!rows.some((s) => s.id === id)) throw new AppError("NOT_FOUND");
    return rows.filter((s) => s.id !== id);
  });
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

export async function setStudyPhotos(
  id: string,
  op: { add?: string; remove?: string },
): Promise<void> {
  await mutate("studies", (rows) => {
    const idx = rows.findIndex((s) => s.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    let photos = rows[idx].photos;
    if (op.add) photos = [...new Set([...photos, op.add])];
    if (op.remove) photos = photos.filter((p) => p !== op.remove);
    rows[idx] = { ...rows[idx], photos };
    return rows;
  });
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
    rows[idx] = { ...rows[idx], ...patch };
    return rows;
  });
}

export async function deleteGalleryEntry(id: string): Promise<void> {
  await mutate("gallery-dinner", (rows) => {
    if (!rows.some((g) => g.id === id)) throw new AppError("NOT_FOUND");
    return rows.filter((g) => g.id !== id);
  });
}

export async function setGalleryPhotos(
  id: string,
  op: { add?: string; remove?: string },
): Promise<void> {
  await mutate("gallery-dinner", (rows) => {
    const idx = rows.findIndex((g) => g.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    let photos = rows[idx].photos;
    if (op.add) photos = [...new Set([...photos, op.add])];
    if (op.remove) photos = photos.filter((p) => p !== op.remove);
    rows[idx] = { ...rows[idx], photos };
    return rows;
  });
}
