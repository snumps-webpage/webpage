import { z } from "zod/v4";

/**
 * One way to read a form field: a missing field and a File both read as "",
 * so schemas see strings and report "required" instead of actions crashing on
 * `null`. Shared by every action that validates with a domain schema.
 */
export function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * The one way to turn a schema failure into per-field form messages: the first
 * message of each top-level field. Issues without a field — and, when
 * `fields` is given, fields the form does not render — go under `_form`, so
 * no message is lost to a field nobody displays.
 */
type IssueSource = {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
};

export function fieldIssues(error: IssueSource): Record<string, string>;
export function fieldIssues<F extends string>(
  error: IssueSource,
  fields: readonly F[],
): Partial<Record<F | "_form", string>>;
export function fieldIssues(
  error: IssueSource,
  fields?: readonly string[],
): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const issue of error.issues) {
    const head = issue.path[0];
    const field =
      typeof head === "string" && (!fields || fields.includes(head))
        ? head
        : "_form";
    issues[field] ??= issue.message;
  }
  return issues;
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * The instant a KST `datetime-local` value names, in ms; NaN unless it is a
 * real wall-clock time in 2000–2099. This is kstInputToIso's rule
 * (server/core/time.ts), restated because this module ships to the browser:
 * a value this accepts is one the action can store. Ordering compares these
 * instants, never the raw strings (audit LC02-2).
 */
export function localDateTimeMs(value: string): number {
  const m = LOCAL_DATE_TIME.exec(value);
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (y < 2000 || y > 2099) return NaN;
  // Date.UTC rolls 02-30 or 24:00 over to another day; a rolled value differs
  const wall = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const real =
    wall.getUTCFullYear() === y &&
    wall.getUTCMonth() === mo - 1 &&
    wall.getUTCDate() === d &&
    wall.getUTCHours() === h &&
    wall.getUTCMinutes() === mi;
  return real ? wall.getTime() - KST_OFFSET_MS : NaN;
}

/**
 * A KST `datetime-local` input, "YYYY-MM-DDTHH:mm", naming a real time — the
 * one schema piece every form with such a field uses (audit LC04-4). Only the
 * shape message is the form's own; a malformed value gets that message alone,
 * a well-formed impossible one (02-30, 24:00, outside 2000–2099) the calendar
 * message.
 */
export function localDateTimeInput(
  shapeMessage = "날짜와 시간을 확인해 주세요.",
) {
  return z
    .string()
    .trim()
    .regex(LOCAL_DATE_TIME, { message: shapeMessage, abort: true })
    .refine(
      (v) => Number.isFinite(localDateTimeMs(v)),
      "존재하지 않는 날짜나 시각입니다.",
    );
}

/** The default-message local datetime field. */
export const localDateTimeSchema = localDateTimeInput();
