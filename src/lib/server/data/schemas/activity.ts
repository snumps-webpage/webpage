import { z } from "zod";
import { ActivityType, DateRange, Id, SourceRequestId } from "./common";

export const ActivitySchema = z.object({
  id: Id,
  title: z.string().min(1),
  date: DateRange,
  type: ActivityType,
  attendeeIds: z.array(Id),
  sourceRequestId: SourceRequestId,
});

export type Activity = z.infer<typeof ActivitySchema>;
