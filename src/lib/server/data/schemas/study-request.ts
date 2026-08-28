import { z } from "zod";
import { DateTime, Id, Term } from "./common";
import { RequestStatus } from "./seminar-request";

export const StudyRequestSchema = z.object({
  id: Id,
  title: z.string().min(1), // 분야명
  textbook: z.string(),
  description: z.string(),
  semester: Term,
  requesterId: Id, // becomes the organizer on approval
  status: RequestStatus,
  createdAt: DateTime,
});

export type StudyRequest = z.infer<typeof StudyRequestSchema>;
