import { describe, expect, it } from "vitest";
import { mergeManagedAttendance } from "./attendance";

describe("managed attendance merge", () => {
  it("preserves attendance outside the managed roster", () => {
    expect(
      mergeManagedAttendance(
        ["applicant-1", "walk-in"],
        ["applicant-2"],
        ["applicant-1", "applicant-2"],
      ),
    ).toEqual({
      success: true,
      attendeeIds: ["walk-in", "applicant-2"],
    });
  });

  it("rejects submitted IDs outside the managed roster", () => {
    expect(
      mergeManagedAttendance([], ["forged-member"], ["applicant-1"]),
    ).toEqual({
      success: false,
      error: "VALIDATION_FAILED",
      unknownMemberId: "forged-member",
    });
  });

  it("deduplicates submitted attendance", () => {
    expect(
      mergeManagedAttendance(
        [],
        ["applicant-1", "applicant-1"],
        ["applicant-1"],
      ),
    ).toEqual({ success: true, attendeeIds: ["applicant-1"] });
  });
});
