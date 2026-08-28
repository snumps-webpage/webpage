import { ulid } from "ulid";

/**
 * Record ids are time-sortable 128-bit strings (API-SPEC §1-3):
 * lexicographic order == creation order, which is the only ordering
 * the index-less S3 tables get for free.
 */
export function newId(): string {
  return ulid();
}
