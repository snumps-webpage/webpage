import { z } from "zod";
import { DateTime, Id } from "./common";

export const RequestStatus = z.enum(["pending", "approved", "rejected", "withdrawn"]);
export type RequestStatus = z.infer<typeof RequestStatus>;

export const SeminarRequestSchema = z.object({
  id: Id,
  title: z.string().min(1),
  description: z.string(),
  prerequisites: z.string(),
  duration: z.string(),
  presenterIds: z.array(Id),
  requesterId: Id,
  status: RequestStatus,
  createdAt: DateTime,
});

export type SeminarRequest = z.infer<typeof SeminarRequestSchema>;
