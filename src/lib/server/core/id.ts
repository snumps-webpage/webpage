import { ulid } from "ulid";

/**
 * Record ids are time-sortable 128-bit strings (API-SPEC §1-3):
 * lexicographic order == creation order, which is the only ordering
 * the index-less S3 tables get for free.
 */
export function newId(): string {
  return ulid();
}

/** URL-safe random token for obfuscated attendance links (pathId/attendCode). */
export function randomToken(length = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
