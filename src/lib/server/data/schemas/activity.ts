import { z } from "zod";
import { ActivityType, DateRange, Id, SourceRequestId } from "./common";

export const ActivitySchema = z.object({
  id: Id,
  title: z.string().min(1),
  date: DateRange,
  type: ActivityType,
  attendeeIds: z.array(Id),
  // the study this activity belongs to; no default — every writer sets it
  // (migration 20261015000000_activity_study_link)
  studyId: Id.nullable(),
  sourceRequestId: SourceRequestId,
});

export type Activity = z.infer<typeof ActivitySchema>;
