import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { kstInputToIso, toKstIso } from "./time";
import { DateTime } from "$lib/server/data/schemas/common";

const refused = (raw: string) => () => kstInputToIso(raw);
const isValidation = (e: unknown) =>
  e instanceof AppError && e.code === "VALIDATION_FAILED";

describe("kstInputToIso", () => {
  it("turns a datetime-local value into a KST instant", () => {
    expect(kstInputToIso("2026-10-05T19:00")).toBe("2026-10-05T19:00:00+09:00");
    expect(kstInputToIso("2028-02-29T09:30:15")).toBe(
      "2028-02-29T09:30:15+09:00",
    );
  });

  // new Date() rolls these over to a different, real date instead of
  // refusing — the stored value would silently differ from the input
  // (audit LA09-1).
  it.each([
    "2026-02-30T19:00", // no such day
    "2027-02-29T19:00", // not a leap year
    "2026-04-31T10:00",
    "2026-13-01T10:00",
    "2026-00-10T10:00",
    "2026-10-05T24:00", // hour 24
    "2026-10-05T19:60",
    "2026-10-05T19:00:60",
  ])("refuses the impossible %s", (raw) => {
    expect(refused(raw)).toThrow(AppError);
    try {
      kstInputToIso(raw);
    } catch (e) {
      expect(isValidation(e)).toBe(true);
    }
  });

  // Terms are two-digit codes (YY-1/YY-2): a year outside 2000–2099 has no
  // term, and years before 1000 used to leave a non-ISO string (audit LA09-5).
  it.each(["0202-10-05T19:00", "1999-12-31T23:59", "2100-01-01T00:00"])(
    "refuses the out-of-range year in %s",
    (raw) => {
      expect(refused(raw)).toThrow(AppError);
    },
  );

  it("refuses anything that is not the input's shape", () => {
    for (const raw of ["", "2026-10-05", "2026-10-05 19:00", "x"]) {
      expect(refused(raw)).toThrow(AppError);
    }
  });
});

describe("toKstIso", () => {
  it("always writes a four-digit year, so the result is a valid DateTime", () => {
    const iso = toKstIso(new Date(Date.UTC(202, 0, 1)));
    expect(iso.startsWith("0202-01-01T")).toBe(true);
    expect(DateTime.safeParse(iso).success).toBe(true);
  });
});
