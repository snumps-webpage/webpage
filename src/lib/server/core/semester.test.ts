import { describe, expect, it } from "vitest";
import { termOf, termRange } from "./semester";

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
