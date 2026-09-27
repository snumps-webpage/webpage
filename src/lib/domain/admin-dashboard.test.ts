import { describe, expect, it } from "vitest";
import {
  adminActionErrorMessage,
  adminAttendanceCapabilities,
  adminAttendanceTimeInputSchema,
  adminEventCapabilities,
  adminEventInputSchema,
} from "$lib/domain/admin-dashboard";
import { fieldIssues, localDateTimeSchema } from "$lib/domain/form-data";

describe("admin dashboard rules", () => {
  it("derives event actions from lifecycle and pending queue state", () => {
    expect(adminEventCapabilities("draft", 0, false)).toMatchObject({
      canActivate: true,
      canExpire: false,
      canDelete: true,
    });
    expect(adminEventCapabilities("active", 2, false)).toMatchObject({
      canActivate: false,
      canExpire: true,
      canDelete: false,
    });
    expect(adminEventCapabilities("cancelled", 0, false)).toMatchObject({
      canActivate: false,
      canExpire: false,
    });
    // closed by hand before its end: reopening works
    expect(adminEventCapabilities("expired", 0, false)).toMatchObject({
      canActivate: true,
    });
  });

  // Audit LC02-1: "expired" also means "its end has passed", which opening
  // cannot undo — the server refuses it (LB20-1), so the button must not show.
  it("offers no open action once the event's end has passed", () => {
    expect(adminEventCapabilities("expired", 0, true).canActivate).toBe(false);
    expect(adminEventCapabilities("draft", 0, true).canActivate).toBe(false);
  });

  it("allows reversing an approved attendance record", () => {
    expect(adminAttendanceCapabilities("approved")).toMatchObject({
      canApprove: false,
      canReject: true,
      canDelete: true,
    });
  });

  it("rejects invalid event and attendance time ranges", () => {
    expect(
      adminEventInputSchema.safeParse({
        title: "세미나",
        type: "세미나",
        startsAtLocal: "2026-09-03T18:30",
        endsAtLocal: "2026-09-03T17:30",
      }).success,
    ).toBe(false);
    expect(
      adminAttendanceTimeInputSchema.safeParse({
        startTimeLocal: "2026-09-03T18:30",
        endTimeLocal: "2026-09-03T18:20",
      }).success,
    ).toBe(false);
  });
});

describe("localDateTimeSchema", () => {
  // Audit LC02-2: the shape-only regex let impossible times through, and
  // kstInputToIso then refused them with no field issue (or, before it was
  // made strict, stored a rolled-over date).
  it.each([
    "2026-02-30T10:00",
    "2026-01-01T24:00",
    "2026-13-01T10:00",
    "2026-09-03T18:60",
    "1999-12-31T10:00",
  ])("refuses %s, which kstInputToIso cannot store", (value) => {
    const result = localDateTimeSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toMatch(/[가-힣]/);
  });

  it("accepts a real KST wall-clock time", () => {
    expect(localDateTimeSchema.safeParse("2028-02-29T23:59").success).toBe(
      true,
    );
  });

  // Audit LC02-2: ordering compared the raw strings, so an impossible start
  // that sorts before its end passed as an ordered range. The issue now lands
  // on the impossible field, not on the order.
  it("reports an impossible start instead of ordering it", () => {
    const result = adminEventInputSchema.safeParse({
      title: "세미나",
      type: "세미나",
      startsAtLocal: "2026-02-30T10:00",
      endsAtLocal: "2026-03-01T12:00",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(Object.keys(fieldIssues(result.error))).toEqual(["startsAtLocal"]);
  });

  it("checks attendance times the same way", () => {
    const result = adminAttendanceTimeInputSchema.safeParse({
      startTimeLocal: "2026-09-03T18:30",
      endTimeLocal: "2026-09-31T18:40",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(Object.keys(fieldIssues(result.error))).toEqual(["endTimeLocal"]);
  });
});

describe("adminActionErrorMessage", () => {
  it("prefers the server's own message", () => {
    expect(
      adminActionErrorMessage(
        { error: "CONFLICT", message: "직접 문구" },
        "기본",
      ),
    ).toBe("직접 문구");
  });

  it("never shows a raw error code", () => {
    for (const code of [
      "VALIDATION_FAILED",
      "NOT_FOUND",
      "CONFLICT",
      "WRITE_CONFLICT",
      "SERVICE_UNAVAILABLE",
    ]) {
      const text = adminActionErrorMessage({ error: code }, "기본");
      expect(text).not.toMatch(/[A-Z_]{5,}/);
    }
  });

  it("falls back for anything unknown or missing", () => {
    expect(adminActionErrorMessage({ error: "SOMETHING" }, "기본")).toBe(
      "기본",
    );
    expect(adminActionErrorMessage(null, "기본")).toBe("기본");
  });
});
