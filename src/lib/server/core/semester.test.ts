import { describe, expect, it } from "vitest";
import {
  compareSemesters,
  termOf,
  termRange,
  termStartDateOrNull,
} from "./semester";

// Instants chosen around KST boundaries (KST = UTC+9).
const kst = (s: string) => new Date(s);

describe("termOf — KST boundaries", () => {
  it("maps March–August to the first term", () => {
    expect(termOf(kst("2026-03-01T00:00:00+09:00"))).toBe("26-1");
    expect(termOf(kst("2026-08-31T23:59:59+09:00"))).toBe("26-1");
  });

  it("maps September–December to the second term of the same year", () => {
    expect(termOf(kst("2026-09-01T00:00:00+09:00"))).toBe("26-2");
    expect(termOf(kst("2026-12-31T23:59:59+09:00"))).toBe("26-2");
  });

  it("maps January–February to the PREVIOUS year's second term", () => {
    expect(termOf(kst("2027-01-15T12:00:00+09:00"))).toBe("26-2");
    expect(termOf(kst("2027-02-28T23:59:59+09:00"))).toBe("26-2");
  });

  it("respects KST, not UTC, at the edge", () => {
    // 2026-02-28 15:30 UTC == 2026-03-01 00:30 KST → first term
    expect(termOf(new Date("2026-02-28T15:30:00Z"))).toBe("26-1");
    // 2026-08-31 15:30 UTC == 2026-09-01 00:30 KST → second term
    expect(termOf(new Date("2026-08-31T15:30:00Z"))).toBe("26-2");
  });
});

describe("termRange", () => {
  it("returns [start, end) that round-trips through termOf", () => {
    for (const term of ["26-1", "26-2"]) {
      const { start, end } = termRange(term);
      expect(termOf(start)).toBe(term);
      expect(termOf(new Date(end.getTime() - 1000))).toBe(term);
      expect(termOf(end)).not.toBe(term);
    }
  });

  it("rejects malformed terms", () => {
    expect(() => termRange("2026-1")).toThrow();
    expect(() => termRange("26-3")).toThrow();
  });
});

describe("compareSemesters (W-7)", () => {
  // 1학기(3~8월) → 여름 → 2학기(9~익년 2월) → 겨울. 문자열 비교로는
  // "26-S"·"26-W"가 "26-2"보다 뒤에 와서 최신 기록처럼 정렬됐다.
  it("orders a term-year chronologically: 1 → S → 2 → W", () => {
    const terms = ["26-W", "26-2", "26-S", "26-1"];

    expect([...terms].sort(compareSemesters)).toEqual([
      "26-1",
      "26-S",
      "26-2",
      "26-W",
    ]);
  });

  it("orders by year first", () => {
    expect([...["26-1", "25-W"]].sort(compareSemesters)).toEqual([
      "25-W",
      "26-1",
    ]);
  });

  it("puts newest first when reversed — the archive's display order", () => {
    const newestFirst = ["26-1", "26-W", "26-2", "26-S"].sort((a, b) =>
      compareSemesters(b, a),
    );

    expect(newestFirst).toEqual(["26-W", "26-2", "26-S", "26-1"]);
  });
});

describe("termStartDateOrNull (W-7)", () => {
  it("gives the KST first day for a regular term", () => {
    expect(termStartDateOrNull("26-1")).toBe("2026-03-01");
    expect(termStartDateOrNull("26-2")).toBe("2026-09-01");
  });

  // 1970-01-01 was a fabricated date on real data — the schema allows S/W.
  it("returns null for a vacation term instead of inventing a date", () => {
    expect(termStartDateOrNull("26-S")).toBeNull();
    expect(termStartDateOrNull("26-W")).toBeNull();
  });

  it("returns null for anything unparseable", () => {
    expect(termStartDateOrNull("nonsense")).toBeNull();
  });
});
