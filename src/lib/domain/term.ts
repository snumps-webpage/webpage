/**
 * The single definition of the term ("학기") derivation rule (API-SPEC §2):
 * March–August = "<YY>-1", September–February = "<YY>-2", where
 * January/February belong to the PREVIOUS year's second term. All boundaries
 * are KST. Browser-safe (no $lib/server import), so pages and the server
 * derive terms the same way; $lib/server/core/semester re-exports termOf.
 * The SQL flows mirror it in app_term_of (checked by flow-rules.test.ts).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstYearMonth(d: Date): { year: number; month: number } {
  const shifted = new Date(d.getTime() + KST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

const yy = (year: number) => String(year % 100).padStart(2, "0");

export function termOf(d: Date): string {
  const { year, month } = kstYearMonth(d);
  if (month >= 3 && month <= 8) return `${yy(year)}-1`;
  return `${yy(month >= 9 ? year : year - 1)}-2`;
}

/**
 * The term of a stored date string — an ISO instant with any offset, or a
 * bare "YYYY-MM-DD" (read as that KST day). "Unknown" when it is not a date.
 */
export function termOfDateString(value: string): string {
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = bare
    ? new Date(`${value}T12:00:00+09:00`) // midday KST: the day itself
    : new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  // a bare date must name a real day (2026-02-29 rolls over otherwise)
  if (bare && d.toISOString().slice(0, 10) !== value) return "Unknown";
  return termOf(d);
}

/**
 * The term a new proposal is for. Seminars run in the teaching months
 * (Mar–Jun, Sep–Dec); in the vacation months that follow a term (Jul–Aug,
 * Jan–Feb) a proposal is for the coming term, not the one just ended —
 * the form offered only months already past (audit LC15-1).
 */
export function proposalTerm(now: Date): string {
  const { year, month } = kstYearMonth(now);
  if (month <= 6) return `${yy(year)}-1`;
  return `${yy(year)}-2`;
}

/** "26-1" → "2026년 1학기". */
export function termLabel(term: string): string {
  const [year, half] = term.split("-");
  return `${2000 + Number(year)}년 ${half}학기`;
}
