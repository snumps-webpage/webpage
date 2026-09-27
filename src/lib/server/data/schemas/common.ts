import { z } from "zod";
import { SEMESTER_PATTERN, TERM_PATTERN } from "$lib/server/core/semester";
import { RECORD_ACTIVITY_TYPES } from "$lib/constants";

/** Shared field primitives for the S3 table schemas (API-SPEC §2). */

export const Id = z.string().min(1);

/** Date-only, "YYYY-MM-DD". */
export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Instant, ISO 8601 with offset — stored with the KST offset. */
export const DateTime = z.string().datetime({ offset: true });

export const Term = z.string().regex(TERM_PATTERN);
/** Record semester — includes the vacation terms (YY-S/YY-W) found in club history. */
export const Semester = z.string().regex(SEMESTER_PATTERN);

/**
 * Closed set shared by activities.type and events.type. Defined once in
 * $lib/constants so the domain input schemas refuse what this cannot store.
 */
export const ACTIVITY_TYPES = RECORD_ACTIVITY_TYPES;
export const ActivityType = z.enum(ACTIVITY_TYPES);

export const DateRange = z.object({
  start: DateTime,
  end: DateTime.nullable(),
});

/**
 * §1-6 idempotency anchor. Two formats:
 * a request/queue row id, or a study-session composite key "<studyId>:<date>".
 */
export const SourceRequestId = z.string().nullable();
