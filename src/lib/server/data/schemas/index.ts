import { z } from "zod";
import { MemberSchema } from "./member";
import { PrivateInfoSchema } from "./private-info";
import { ActivitySchema } from "./activity";
import { EventSchema } from "./event";
import { ApplicationSchema } from "./application";
import { SeminarRequestSchema } from "./seminar-request";
import { StudyRequestSchema } from "./study-request";
import { StudySchema } from "./study";
import { SeminarSchema } from "./seminar";
import { GalleryDinnerSchema } from "./gallery-dinner";

/**
 * The table registry — the single source of truth for what lives in S3
 * and what shape it has (API-SPEC §2). The attendance queue is deliberately
 * NOT here: it is stored per event (see ./attendance-record).
 */
export const TABLES = {
  members: MemberSchema,
  "private-info": PrivateInfoSchema,
  activities: ActivitySchema,
  events: EventSchema,
  applications: ApplicationSchema,
  "seminar-requests": SeminarRequestSchema,
  "study-requests": StudyRequestSchema,
  studies: StudySchema,
  seminars: SeminarSchema,
  "gallery-dinner": GalleryDinnerSchema,
} as const;

export type TableName = keyof typeof TABLES;
export type RowOf<N extends TableName> = z.infer<(typeof TABLES)[N]>;

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

/** Every stored object is wrapped so field-shape changes can branch on version. */
export const envelope = <S extends z.ZodTypeAny>(row: S) =>
  z.object({ schemaVersion: z.literal(1), rows: z.array(row) });

export const SCHEMA_VERSION = 1;

export * from "./common";
export * from "./member";
export * from "./private-info";
export * from "./activity";
export * from "./event";
export * from "./attendance-record";
export * from "./application";
export * from "./seminar-request";
export * from "./study-request";
export * from "./study";
export * from "./seminar";
export * from "./gallery-dinner";
