import { describe, expect, it } from "vitest";
import {
  adminActionErrorMessage,
  adminAttendanceCapabilities,
  adminAttendanceTimeInputSchema,
  adminEventCapabilities,
  adminEventInputSchema,
} from "$lib/domain/admin-dashboard";

describe("admin dashboard rules", () => {
  it("derives event actions from lifecycle and pending queue state", () => {
    expect(adminEventCapabilities("draft", 0)).toMatchObject({
      canActivate: true,
      canExpire: false,
      canDelete: true,
    });
    expect(adminEventCapabilities("active", 2)).toMatchObject({
      canActivate: false,
      canExpire: true,
      canDelete: false,
    });
    expect(adminEventCapabilities("cancelled", 0)).toMatchObject({
      canActivate: false,
      canExpire: false,
    });
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
