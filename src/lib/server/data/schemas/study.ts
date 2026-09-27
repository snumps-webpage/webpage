import { z } from "zod";
import { DateTime, Id, Semester, SourceRequestId } from "./common";

export const StudyStatus = z.enum(["recruiting", "ongoing", "finished"]);
export type StudyStatus = z.infer<typeof StudyStatus>;

export const StudySchema = z.object({
  id: Id,
  title: z.string().min(1),
  semester: Semester,
  textbook: z.string(),
  description: z.string(),
  note: z.string(),
  // Array by design (extensibility); the current invariant is exactly one organizer.
  organizerIds: z.array(Id).min(1),
  participantIds: z.array(Id),
  pendingParticipantIds: z.array(Id),
  // STU-07 two-phase handover; null when no transfer is in flight.
  pendingTransfer: z
    .object({ toMemberId: Id, requestedAt: DateTime })
    .nullable(),
  // DEPRECATED — schedule-driven session generation was removed (decision
  // 2026-09-27; sessions are created by hand). Kept only so stored documents
  // still validate: nothing reads it, new rows write []. Drop it in a data
  // migration.
  schedule: z.array(
    z.object({ date: DateTime, generatedEventId: Id.nullable() }),
  ),
  transferHistory: z.array(
    z.object({ from: Id, to: Id, at: DateTime, byAdmin: z.boolean() }),
  ),
  photos: z.array(z.string()),
  status: StudyStatus,
  sourceRequestId: SourceRequestId,
});

export type Study = z.infer<typeof StudySchema>;
