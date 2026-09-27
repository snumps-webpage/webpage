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
