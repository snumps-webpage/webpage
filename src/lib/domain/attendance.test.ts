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

import {
  attendanceActionError,
  attendanceDateLabel,
  attendanceSessionLabel,
} from "./attendance";
describe("attendance action presentation", () => {
  it.each([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "WRITE_CONFLICT",
    "EVENT_NOT_OPEN",
    "VALIDATION_FAILED",
    "SERVICE_UNAVAILABLE",
    undefined,
  ])("%s provides distinct Korean feedback", (code) => {
    expect(attendanceActionError(code, "request")).not.toBe("");
    expect(attendanceActionError(code, "sheet")).not.toBe("");
  });
  it("duplicate response does not assert approved attendance", () => {
    expect(attendanceActionError("CONFLICT", "request")).toContain(
      "승인 여부를 알 수는 없으니",
    );
  });
  it("expired label preserves correction possibility", () => {
    expect(attendanceSessionLabel("expired")).toContain("기록 정정 가능");
  });
  it("date display is explicitly KST", () => {
    expect(attendanceDateLabel("2026-10-02T00:30:00Z")).toContain("오전 09:30");
  });
});
