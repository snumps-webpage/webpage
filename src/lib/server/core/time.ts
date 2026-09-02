import { AppError } from "./errors";

/** Instants are stored as ISO 8601 with the KST offset (API-SPEC §2). */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** MEM-07: the withdrawal grace period — single definition. */
export const WITHDRAWAL_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export function toKstIso(d: Date): string {
  const t = new Date(d.getTime() + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}+09:00`
  );
}

export function nowKstIso(): string {
  return toKstIso(new Date());
}

/** "YYYY-MM-DDTHH:mm" from a form's datetime-local input, interpreted as KST. */
export function kstInputToIso(raw: string): string {
  // Malformed input must fail loudly here — new Date() would yield NaN and
  // serialize as "NaN-NaN-…", poisoning the stored table (review C1).
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    throw new AppError("VALIDATION_FAILED");
  }
  const d = new Date(`${raw.length === 16 ? `${raw}:00` : raw}+09:00`);
  if (Number.isNaN(d.getTime())) throw new AppError("VALIDATION_FAILED");
  return toKstIso(d);
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
