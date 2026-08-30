import { z } from "zod";
import { Id, Semester, SourceRequestId } from "./common";

export const SeminarSchema = z.object({
  id: Id,
  title: z.string().min(1),
  semester: Semester,
  note: z.string(),
  presenterIds: z.array(Id),
  externalPresenters: z.string(), // non-member presenters, free text
  materials: z.array(z.string()), // s3Keys
  photos: z.array(z.string()), // s3Keys
  activityId: Id.nullable(), // archive↔activity link, stamped at approval
  sourceRequestId: SourceRequestId,
});

export type Seminar = z.infer<typeof SeminarSchema>;
