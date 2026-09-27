import { AppError } from "$lib/server/core/errors";

/**
 * The one attendance-merge rule (API-SPEC §5-6/§6-6). The organizer save
 * runs it here; the presenter save runs its SQL twin inside
 * flow_save_presenter_attendance, pinned against this function by
 * participation.test.ts (audit LB20-2). NEVER overwrite attendee lists
 * wholesale — attendees who arrived through another path must survive.
 * The single sanctioned exception is the admin's explicit setAttendees.
 */
export function mergeAttendees(
  current: string[],
  allowedPool: string[],
  selected: string[],
): string[] {
  const pool = new Set(allowedPool);
  if (!selected.every((id) => pool.has(id))) {
    throw new AppError("VALIDATION_FAILED");
  }
  const outside = current.filter((id) => !pool.has(id));
  return [...new Set([...outside, ...selected])];
}
