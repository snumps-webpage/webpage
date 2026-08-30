import type {
  AdminActivityRecord,
  AdminContentFile,
  AdminGalleryPhoto,
  AdminGalleryRecord,
  AdminSeminarRecord,
  AdminStudyRecord,
} from "$lib/domain/admin-records";
import type { SeminarKind } from "$lib/domain/seminars";
import type { ActivityType } from "$lib/constants";
import {
  createDevPublicActivity,
  createDevPublicGalleryRecord,
  deleteDevPublicSeminar,
  deleteDevPublicStudy,
  deleteDevPublicActivity,
  deleteDevPublicGalleryRecord,
  getDevPublicArchive,
  updateDevPublicActivity,
  updateDevPublicGalleryRecord,
  upsertDevPublicSeminar,
  upsertDevPublicStudy,
} from "$lib/server/dev-public-content-fixtures";

let activities: AdminActivityRecord[] = getDevPublicArchive().activities.map(
  (activity) => ({
    ...activity,
    attendeeIds:
      activity.id === "activity-seminar-graph"
        ? ["dev-member", "member-editor"]
        : activity.id === "activity-2"
          ? ["dev-member"]
          : [],
    linkedEventIds:
      activity.id === "activity-seminar-graph" ? ["event-seminar-graph"] : [],
  }),
);

let gallery: AdminGalleryRecord[] = getDevPublicArchive().gallery.map(
  (record) => ({
    id: record.id,
    title: record.title,
    category: record.category,
    date: record.date,
    alt: record.alt,
    photo: null,
  }),
);

let seminars: AdminSeminarRecord[] = getDevPublicArchive().seminars.map(
  (record, index) => ({
    ...record,
    durationMinutes: record.durationMinutes ?? 60,
    sourceRequestId: null,
    kind: index === 1 ? "irregular" : "regular",
    presenterIds:
      index === 0
        ? ["member-president"]
        : index === 1
          ? ["member-editor"]
          : ["dev-member"],
    endsAt: null,
    activityId:
      record.id === "seminar-published-1" ? "activity-seminar-graph" : null,
    eventId: record.id === "seminar-published-1" ? "event-seminar-graph" : null,
    files: [],
  }),
);

seminars = [
  {
    id: "seminar-unscheduled-1",
    sourceRequestId: "request-approved-1",
    kind: "regular",
    title: "대수위상수학의 기본군과 피복공간",
    term: "26-2",
    description:
      "기본군의 계산과 피복공간의 분류 정리를 구체적인 예제와 함께 살펴봅니다.",
    prerequisites: "점집합 위상수학",
    durationMinutes: 90,
    presenterIds: ["member-president"],
    presenterNames: ["김회장"],
    scheduledAt: null,
    endsAt: null,
    location: null,
    activityId: null,
    eventId: null,
    files: [],
  },
  {
    id: "seminar-scheduled-1",
    sourceRequestId: "request-approved-2",
    kind: "irregular",
    title: "수론적 함수와 푸리에 해석",
    term: "26-2",
    description: "산술적 함수의 예와 푸리에 해석을 연결합니다.",
    prerequisites: "복소해석학",
    durationMinutes: 75,
    presenterIds: ["member-editor"],
    presenterNames: ["이편집"],
    scheduledAt: "2026-09-12T16:00:00+09:00",
    endsAt: "2026-09-12T17:15:00+09:00",
    location: "129동 101호",
    activityId: null,
    eventId: null,
    files: [],
  },
  ...seminars,
];

let studies: AdminStudyRecord[] = getDevPublicArchive().studies.map(
  (record, index) => ({
    id: record.id,
    sourceRequestId: null,
    title: record.title,
    term: record.term,
    description: record.description,
    material: record.material ?? "기록 없음",
    organizerIds: index === 0 ? ["member-editor"] : ["member-vice-president"],
    organizerNames: record.organizerNames,
    pendingTransfer:
      index === 0
        ? {
            toMemberId: "dev-member",
            requestedAt: "2026-08-27T20:10:00+09:00",
          }
        : null,
    transferHistory: [],
    sessionCount: index === 0 ? 2 : 0,
    files: [],
  }),
);

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function getDevAdminActivities() {
  return clone([...activities].sort((a, b) => b.date.localeCompare(a.date)));
}

export function createDevAdminActivity(input: {
  title: string;
  type: ActivityType;
  date: string;
}) {
  const record: AdminActivityRecord = {
    id: `activity-${crypto.randomUUID()}`,
    ...clone(input),
    attendeeIds: [],
    linkedEventIds: [],
  };
  activities = [record, ...activities];
  createDevPublicActivity(record);
  return clone(record);
}

export function registerDevAdminActivity(input: {
  id: string;
  title: string;
  type: ActivityType;
  date: string;
}) {
  const existing = activities.find((activity) => activity.id === input.id);
  if (existing) return clone(existing);
  const record: AdminActivityRecord = {
    ...clone(input),
    attendeeIds: [],
    linkedEventIds: [],
  };
  activities = [record, ...activities];
  createDevPublicActivity(record);
  return clone(record);
}

export function linkDevAdminActivityEvent(activityId: string, eventId: string) {
  const activity = activities.find((record) => record.id === activityId);
  if (!activity) return null;
  activity.linkedEventIds = [...new Set([...activity.linkedEventIds, eventId])];
  return clone(activity);
}

export function updateDevAdminActivity(
  id: string,
  input: { title: string; type: ActivityType; date: string },
) {
  const record = activities.find((activity) => activity.id === id);
  if (!record) return null;
  Object.assign(record, clone(input));
  updateDevPublicActivity(id, input);
  return clone(record);
}

export function setDevAdminActivityAttendees(
  id: string,
  attendeeIds: string[],
) {
  const record = activities.find((activity) => activity.id === id);
  if (!record) return null;
  record.attendeeIds = [...new Set(attendeeIds)];
  return clone(record);
}

export function deleteDevAdminActivity(id: string) {
  const record = activities.find((activity) => activity.id === id);
  if (!record) return "not_found" as const;
  if (record.linkedEventIds.length) return "conflict" as const;
  activities = activities.filter((activity) => activity.id !== id);
  deleteDevPublicActivity(id);
  return "deleted" as const;
}

export function getDevAdminGallery() {
  return clone([...gallery].sort((a, b) => b.date.localeCompare(a.date)));
}

export function createDevAdminGalleryRecord(input: {
  title: string;
  category: AdminGalleryRecord["category"];
  date: string;
  alt: string;
}) {
  const record: AdminGalleryRecord = {
    id: `gallery-${crypto.randomUUID()}`,
    ...clone(input),
    photo: null,
  };
  gallery = [record, ...gallery];
  createDevPublicGalleryRecord(record);
  return clone(record);
}

export function updateDevAdminGalleryRecord(
  id: string,
  input: {
    title: string;
    category: AdminGalleryRecord["category"];
    date: string;
    alt: string;
  },
) {
  const record = gallery.find((item) => item.id === id);
  if (!record) return null;
  Object.assign(record, clone(input));
  updateDevPublicGalleryRecord(id, input);
  return clone(record);
}

export function setDevAdminGalleryPhoto(id: string, photo: AdminGalleryPhoto) {
  const record = gallery.find((item) => item.id === id);
  if (!record) return null;
  record.photo = clone(photo);
  return clone(record);
}

export function removeDevAdminGalleryPhoto(id: string) {
  const record = gallery.find((item) => item.id === id);
  if (!record) return null;
  record.photo = null;
  return clone(record);
}

export function deleteDevAdminGalleryRecord(id: string) {
  const before = gallery.length;
  gallery = gallery.filter((item) => item.id !== id);
  if (gallery.length === before) return false;
  deleteDevPublicGalleryRecord(id);
  return true;
}

function syncPublicSeminar(record: AdminSeminarRecord) {
  if (!record.eventId) return;
  upsertDevPublicSeminar({
    id: record.id,
    title: record.title,
    term: record.term,
    description: record.description,
    prerequisites: record.prerequisites,
    durationMinutes: record.durationMinutes,
    presenterNames: record.presenterNames,
    scheduledAt: record.scheduledAt,
    location: record.location,
    files: record.files
      .filter((file): file is AdminContentFile & { url: string } => !!file.url)
      .map(({ id, name, url, kind }) => ({ id, name, url, kind })),
  });
}

export function getDevAdminSeminarRecords() {
  return clone(
    [...seminars].sort((a, b) =>
      (b.scheduledAt ?? b.term).localeCompare(a.scheduledAt ?? a.term),
    ),
  );
}

export function createDevAdminSeminarRecord(input: {
  sourceRequestId?: string | null;
  kind: SeminarKind;
  title: string;
  term: string;
  description: string;
  prerequisites: string;
  durationMinutes: number;
  presenterIds: string[];
  presenterNames: string[];
}) {
  if (input.sourceRequestId) {
    const existing = seminars.find(
      (record) => record.sourceRequestId === input.sourceRequestId,
    );
    if (existing) return clone(existing);
  }
  const record: AdminSeminarRecord = {
    id: `seminar-${crypto.randomUUID()}`,
    sourceRequestId: input.sourceRequestId ?? null,
    kind: input.kind,
    title: input.title,
    term: input.term,
    description: input.description,
    prerequisites: input.prerequisites,
    durationMinutes: input.durationMinutes,
    presenterIds: [...new Set(input.presenterIds)],
    presenterNames: [...input.presenterNames],
    scheduledAt: null,
    endsAt: null,
    location: null,
    activityId: null,
    eventId: null,
    files: [],
  };
  seminars = [record, ...seminars];
  return clone(record);
}

export function updateDevAdminSeminarRecord(
  id: string,
  input: {
    kind: SeminarKind;
    title: string;
    term: string;
    description: string;
    prerequisites: string;
    durationMinutes: number;
    presenterIds: string[];
    presenterNames: string[];
  },
) {
  const record = seminars.find((item) => item.id === id);
  if (!record) return null;
  Object.assign(record, clone(input), {
    presenterIds: [...new Set(input.presenterIds)],
  });
  syncPublicSeminar(record);
  return clone(record);
}

export function scheduleDevAdminSeminarRecord(
  id: string,
  schedule: { startsAt: string; endsAt: string | null; location: string },
) {
  const record = seminars.find((item) => item.id === id);
  if (!record) return null;
  record.scheduledAt = schedule.startsAt;
  record.endsAt = schedule.endsAt;
  record.location = schedule.location;
  if (record.activityId) {
    const activity = activities.find((item) => item.id === record.activityId);
    if (activity) {
      activity.title = record.title;
      activity.date = schedule.startsAt.slice(0, 10);
      updateDevPublicActivity(activity.id, {
        title: activity.title,
        type: activity.type,
        date: activity.date,
      });
    }
  }
  syncPublicSeminar(record);
  return clone(record);
}

export function publishDevAdminSeminarRecord(
  id: string,
  activityId: string,
  eventId: string,
) {
  const record = seminars.find((item) => item.id === id);
  if (!record) return null;
  record.activityId = activityId;
  record.eventId = eventId;
  syncPublicSeminar(record);
  const existingActivity = activities.find((item) => item.id === activityId);
  if (existingActivity) {
    existingActivity.linkedEventIds = [
      ...new Set([...existingActivity.linkedEventIds, eventId]),
    ];
  } else {
    const activity: AdminActivityRecord = {
      id: activityId,
      title: record.title,
      type: "세미나",
      date:
        record.scheduledAt?.slice(0, 10) ??
        new Date().toISOString().slice(0, 10),
      attendeeIds: [],
      linkedEventIds: [eventId],
    };
    activities = [activity, ...activities];
    createDevPublicActivity(activity);
  }
  return clone(record);
}

export function addDevAdminSeminarFile(id: string, file: AdminContentFile) {
  const record = seminars.find((item) => item.id === id);
  if (!record) return null;
  record.files = [...record.files, clone(file)];
  syncPublicSeminar(record);
  return clone(record);
}

export function removeDevAdminSeminarFile(id: string, fileId: string) {
  const record = seminars.find((item) => item.id === id);
  if (!record || !record.files.some((file) => file.id === fileId)) return null;
  record.files = record.files.filter((file) => file.id !== fileId);
  syncPublicSeminar(record);
  return clone(record);
}

export function deleteDevAdminSeminarRecord(id: string) {
  const record = seminars.find((item) => item.id === id);
  if (!record) return "not_found" as const;
  if (record.activityId || record.eventId) return "conflict" as const;
  seminars = seminars.filter((item) => item.id !== id);
  deleteDevPublicSeminar(id);
  return "deleted" as const;
}

function syncPublicStudy(record: AdminStudyRecord) {
  upsertDevPublicStudy({
    id: record.id,
    title: record.title,
    term: record.term,
    description: record.description,
    material: record.material,
    organizerNames: record.organizerNames,
    files: record.files
      .filter((file): file is AdminContentFile & { url: string } => !!file.url)
      .map(({ id, name, url, kind }) => ({ id, name, url, kind })),
  });
}

export function getDevAdminStudyRecords() {
  return clone([...studies].sort((a, b) => b.term.localeCompare(a.term)));
}

export function createDevAdminStudyRecord(input: {
  sourceRequestId?: string | null;
  title: string;
  term: string;
  description: string;
  material: string;
  organizerId: string;
  organizerName: string;
}) {
  if (input.sourceRequestId) {
    const existing = studies.find(
      (record) => record.sourceRequestId === input.sourceRequestId,
    );
    if (existing) return clone(existing);
  }
  const record: AdminStudyRecord = {
    id: `study-${crypto.randomUUID()}`,
    sourceRequestId: input.sourceRequestId ?? null,
    title: input.title,
    term: input.term,
    description: input.description,
    material: input.material,
    organizerIds: [input.organizerId],
    organizerNames: [input.organizerName],
    pendingTransfer: null,
    transferHistory: [],
    sessionCount: 0,
    files: [],
  };
  studies = [record, ...studies];
  syncPublicStudy(record);
  return clone(record);
}

export function updateDevAdminStudyRecord(
  id: string,
  input: Pick<AdminStudyRecord, "title" | "term" | "description" | "material">,
) {
  const record = studies.find((item) => item.id === id);
  if (!record) return null;
  Object.assign(record, clone(input));
  syncPublicStudy(record);
  return clone(record);
}

export function setDevAdminStudyOrganizer(
  id: string,
  organizer: { id: string; name: string },
) {
  const record = studies.find((item) => item.id === id);
  if (!record) return null;
  const previousId = record.organizerIds[0];
  if (previousId !== organizer.id) {
    record.transferHistory = [
      ...record.transferHistory,
      {
        fromMemberId: previousId,
        toMemberId: organizer.id,
        changedAt: new Date().toISOString(),
        byAdmin: true,
      },
    ];
  }
  record.organizerIds = [organizer.id];
  record.organizerNames = [organizer.name];
  record.pendingTransfer = null;
  syncPublicStudy(record);
  return clone(record);
}

export function addDevAdminStudyFile(id: string, file: AdminContentFile) {
  const record = studies.find((item) => item.id === id);
  if (!record) return null;
  record.files = [...record.files, clone(file)];
  syncPublicStudy(record);
  return clone(record);
}

export function removeDevAdminStudyFile(id: string, fileId: string) {
  const record = studies.find((item) => item.id === id);
  if (!record || !record.files.some((file) => file.id === fileId)) return null;
  record.files = record.files.filter((file) => file.id !== fileId);
  syncPublicStudy(record);
  return clone(record);
}

export function deleteDevAdminStudyRecord(id: string) {
  const record = studies.find((item) => item.id === id);
  if (!record) return "not_found" as const;
  if (record.sessionCount > 0) return "conflict" as const;
  studies = studies.filter((item) => item.id !== id);
  deleteDevPublicStudy(id);
  return "deleted" as const;
}
