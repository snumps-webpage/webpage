/**
 * The single definition of the term ("학기") derivation rule (API-SPEC §2):
 * March–August = "<YY>-1", September–February = "<YY>-2",
 * where January/February belong to the PREVIOUS year's second term.
 * All boundaries are KST. Activities/events never store a term — they derive it here.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const TERM_PATTERN = /^\d{2}-[12]$/;

/**
 * Stored record semesters (seminars/studies) additionally allow the vacation
 * terms that exist in the club's historical data: "YY-S" (여름) / "YY-W" (겨울).
 * Date-DERIVED terms (termOf/termRange, 임원 roles) remain regular-only.
 */
export const SEMESTER_PATTERN = /^\d{2}-(?:[12SW])$/;

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

/**
 * Chronological order inside a term-year: 1학기(3~8월) → 여름 → 2학기(9~익년 2월)
 * → 겨울. A plain string compare sorted "26-S"/"26-W" after "26-2", which put
 * vacation records above the semester that actually followed them (W-7).
 */
const HALF_ORDER: Record<string, number> = { "1": 0, S: 1, "2": 2, W: 3 };

export function compareSemesters(a: string, b: string): number {
  const [ay, ah] = a.split("-");
  const [by, bh] = b.split("-");
  if (ay !== by) return ay.localeCompare(by);
  return (HALF_ORDER[ah] ?? 99) - (HALF_ORDER[bh] ?? 99);
}

/**
 * KST first day of a term, or null when the term has no derivable start —
 * vacation terms (YY-S/YY-W) are stored but have no date range by design.
 *
 * Callers used to fall back to "1970-01-01", which is not a coarse answer but
 * a wrong one: it showed up in gallery captions as a real date.
 */
export function termStartDateOrNull(term: string): string | null {
  try {
    return new Date(termRange(term).start.getTime() + KST_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
  } catch {
    return null;
  }
}
