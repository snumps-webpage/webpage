/**
 * The single definition of the term ("학기") derivation rule (API-SPEC §2):
 * March–August = "<YY>-1", September–February = "<YY>-2",
 * where January/February belong to the PREVIOUS year's second term.
 * All boundaries are KST. Activities/events never store a term — they derive it here.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const TERM_PATTERN = /^\d{2}-[12]$/;

function kstYearMonth(d: Date): { year: number; month: number } {
  const shifted = new Date(d.getTime() + KST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

export function termOf(d: Date): string {
  const { year, month } = kstYearMonth(d);
  if (month >= 3 && month <= 8) {
    return `${String(year % 100).padStart(2, "0")}-1`;
  }
  const termYear = month >= 9 ? year : year - 1;
  return `${String(termYear % 100).padStart(2, "0")}-2`;
}

export function currentTerm(now: Date = new Date()): string {
  return termOf(now);
}

/** [start, end) of a term as instants, KST boundaries. */
export function termRange(term: string): { start: Date; end: Date } {
  if (!TERM_PATTERN.test(term)) {
    throw new Error(`invalid term: ${term}`);
  }
  const [yy, half] = term.split("-");
  const year = 2000 + Number(yy);
  const kstStart = (y: number, month1: number) =>
    new Date(Date.UTC(y, month1 - 1, 1) - KST_OFFSET_MS);
  if (half === "1") {
    return { start: kstStart(year, 3), end: kstStart(year, 9) };
  }
  return { start: kstStart(year, 9), end: kstStart(year + 1, 3) };
}
