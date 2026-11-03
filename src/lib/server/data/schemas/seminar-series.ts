import { z } from "zod";
import { Id } from "./common";

/** Shared heading only. Schedules, attendance and announcements belong to sessions. */
export const SeminarSeriesSchema = z.object({
  id: Id,
  title: z.string().min(1),
  description: z.string(),
});
export type SeminarSeries = z.infer<typeof SeminarSeriesSchema>;
