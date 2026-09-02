import { z } from "zod";
import { DateTime, Id } from "./common";

/**
 * Stored per event as `tables/attendance-queue/<eventId>.json.gz` —
 * NOT a member of the TABLES registry (API-SPEC §1-3 exception).
 */
export const AttendanceRecordSchema = z.object({
  id: Id,
  memberId: Id,
  eventId: Id,
  startTime: DateTime,
  endTime: DateTime.nullable(),
  status: z.enum(["pending", "approved", "rejected"]),
});

export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;
