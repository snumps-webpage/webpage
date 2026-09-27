import { describe, expect, it } from "vitest";
import { proposalTerm, termLabel, termOf, termOfDateString } from "./term";

describe("termOf — KST calendar", () => {
  it.each([
    ["2026-03-01T00:00:00+09:00", "26-1"],
    ["2026-02-28T15:00:00Z", "26-1"], // Mar 1 00:00 KST
    ["2026-02-28T14:59:59Z", "25-2"],
    ["2026-08-31T23:59:59+09:00", "26-1"],
    ["2026-09-01T00:00:00+09:00", "26-2"],
    ["2027-01-15T12:00:00+09:00", "26-2"],
    ["2028-02-29T12:00:00+09:00", "27-2"], // leap day stays in term 2
    ["2005-04-01T00:00:00+09:00", "05-1"], // two digits, always
  ])("%s → %s", (at, term) => {
    expect(termOf(new Date(at))).toBe(term);
  });
});

describe("termOfDateString", () => {
  it("reads a stored instant by its KST day, whatever offset it was written with", () => {
    expect(termOfDateString("2026-02-28T15:30:00Z")).toBe("26-1");
    expect(termOfDateString("2026-03-01T00:30:00+09:00")).toBe("26-1");
  });

  it("reads a bare date as that KST day", () => {
    expect(termOfDateString("2026-03-01")).toBe("26-1");
    expect(termOfDateString("2026-02-29")).toBe("Unknown"); // not a date
    expect(termOfDateString("2028-02-29")).toBe("27-2");
  });

  it("answers Unknown for nothing or garbage", () => {
    expect(termOfDateString("")).toBe("Unknown");
    expect(termOfDateString("미상")).toBe("Unknown");
    expect(termOfDateString("2026/03/01")).toBe("Unknown");
  });

  // Without an offset, Date reads the time in the runtime's zone, so the
  // server and the browser disagreed at a term boundary (audit LC17-3).
  it("answers Unknown for a time without an offset", () => {
    expect(termOfDateString("2026-02-28T23:30:00")).toBe("Unknown");
  });

  // V8 rolls an impossible day into the next month — across the Feb/Mar
  // term boundary (audit LC17-4). The bare-date branch already refused it.
  it("answers Unknown for an instant on a day that does not exist", () => {
    expect(termOfDateString("2026-02-29T10:00:00+09:00")).toBe("Unknown");
    expect(termOfDateString("2026-02-30T10:00:00+09:00")).toBe("Unknown");
    expect(termOfDateString("2028-02-29T10:00:00+09:00")).toBe("27-2");
    expect(termOfDateString("2026-09-01T00:00:00.000Z")).toBe("26-2");
  });
});

describe("termLabel", () => {
  it("names a term by its starting year", () => {
    expect(termLabel("26-1")).toBe("2026년 1학기");
    expect(termLabel("25-2")).toBe("2025년 2학기");
    expect(termLabel("05-2")).toBe("2005년 2학기");
  });
});

describe("proposalTerm", () => {
  // Seminars run Mar–Jun and Sep–Dec. In the vacation months a new proposal
  // is for the coming term — the form offered only the months just past
  // (audit LC15-1).
  it.each([
    ["2026-01-15T12:00:00+09:00", "26-1"],
    ["2026-02-28T23:00:00+09:00", "26-1"],
    ["2026-03-01T00:00:00+09:00", "26-1"],
    ["2026-06-30T12:00:00+09:00", "26-1"],
    ["2026-07-01T00:00:00+09:00", "26-2"],
    ["2026-08-31T12:00:00+09:00", "26-2"],
    ["2026-09-01T00:00:00+09:00", "26-2"],
    ["2026-12-31T23:00:00+09:00", "26-2"],
  ])("%s → %s", (at, term) => {
    expect(proposalTerm(new Date(at))).toBe(term);
  });
});
