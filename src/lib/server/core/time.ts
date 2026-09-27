import { AppError } from "./errors";

/** Instants are stored as ISO 8601 with the KST offset (API-SPEC §2). */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** MEM-07: the withdrawal grace period — single definition. */
export const WITHDRAWAL_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export function toKstIso(d: Date): string {
  const t = new Date(d.getTime() + KST_OFFSET_MS);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  // The year is padded too: "202-…" is not ISO 8601 and would fail the
  // DateTime schema on the next read of the whole table (audit LA09-5).
  return (
    `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}+09:00`
  );
}

export function nowKstIso(): string {
  return toKstIso(new Date());
}

/**
 * Is `value` an instant exactly as this app stores them — the canonical
 * `toKstIso` form? Stricter than the DateTime schema, which checks the shape
 * but lets "2026-02-30T…" through. Services check values with this before a
 * SQL flow writes them, since flows have no zod gate.
 */
export function isKstInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && toKstIso(d) === value;
}

/**
 * "YYYY-MM-DDTHH:mm[:ss]" from a form's datetime-local input, interpreted as
 * KST. Refuses — never repairs — anything that is not a real KST wall-clock
 * time in 2000–2099:
 * - malformed input would serialize as "NaN-NaN-…" (review C1);
 * - an impossible one (02-30, 24:00) is rolled over by `Date` to a different,
 *   real date (audit LA09-1);
 * - terms are two-digit codes, so a year outside 2000–2099 has no term, and a
 *   short year used to leave a non-ISO string (audit LA09-5).
 * Values from here may be written by a SQL flow that has no zod gate, so this
 * check is load-bearing, not cosmetic.
 */
export function kstInputToIso(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!m) throw new AppError("VALIDATION_FAILED");
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? "0"));
  if (y < 2000 || y > 2099 || h > 23 || mi > 59 || s > 59) {
    throw new AppError("VALIDATION_FAILED");
  }
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi, s) - KST_OFFSET_MS);
  const iso = toKstIso(utc);
  // round trip: a rolled-over date comes back different
  const wanted = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+09:00`;
  if (iso !== wanted) throw new AppError("VALIDATION_FAILED");
  return iso;
}

export function endOfKstDay(iso: string): Date {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + KST_OFFSET_MS);
  const endUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  );
  return new Date(endUtc - KST_OFFSET_MS);
}
