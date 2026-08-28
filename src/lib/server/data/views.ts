import type {
  Application,
  Event,
  SeminarRequest,
  StudyRequest,
} from "./schemas";

/**
 * Client-facing projections (IMPLEMENTATION-SPEC 부록 3: never return raw
 * rows). One picker per record type — every route boundary uses these, so the
 * legacy field names (speakerIds/submittedAt/notionPageId) live in exactly
 * one place and internal fields can never leak by spread (review M8).
 */

export function seminarRequestView(r: SeminarRequest) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    prerequisites: r.prerequisites,
    duration: r.duration,
    attachment: r.attachment,
    status: r.status,
    speakerIds: r.presenterIds, // legacy UI name
    submittedAt: r.createdAt,
  };
}

export function studyRequestView(r: StudyRequest) {
  return {
    id: r.id,
    title: r.title,
    textbook: r.textbook,
    description: r.description,
    semester: r.semester,
    status: r.status,
    submittedAt: r.createdAt,
  };
}

export function applicationView(a: Application) {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    department: a.department,
    background: a.background,
    accepted: false, // the table holds only unprocessed rows
    submittedAt: a.createdAt,
  };
}

export function adminEventView(e: Event, status: Event["status"]) {
  return {
    id: e.id,
    title: e.title,
    date: e.date.start,
    type: e.type,
    status,
    pathId: e.pathId,
    attendCode: e.attendCode,
    notionPageId: e.activityId, // legacy UI name
    applicantCount: e.applicantIds.length,
  };
}
