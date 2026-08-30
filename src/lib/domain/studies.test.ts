import { describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";
import {
  localKstDateTimeToIso,
  mergeStudyAttendance,
  nextStudyStatuses,
  operationIdSchema,
  studyRequestInputSchema,
  studySessionCorrectionSchema,
} from "./studies";

describe("study domain", () => {
  it("only permits the documented forward and reversible status transitions", () => {
    expect(nextStudyStatuses("recruiting")).toEqual(["ongoing"]);
    expect(nextStudyStatuses("ongoing")).toEqual(["recruiting", "finished"]);
    expect(nextStudyStatuses("finished")).toEqual([]);
  });

  it("accepts UUIDv7 operation IDs and rejects UUIDv4", () => {
    expect(operationIdSchema.safeParse(uuidv7()).success).toBe(true);
    expect(
      operationIdSchema.safeParse("b3a5ed30-ef48-4cd8-913a-6a0d3bc97b86")
        .success,
    ).toBe(false);
  });

  it("preserves attendance outside the organizer-managed participant set", () => {
    expect(
      mergeStudyAttendance(
        ["member-1", "external-checkin"],
        ["member-2"],
        ["member-1", "member-2"],
      ),
    ).toEqual({
      success: true,
      attendeeIds: ["external-checkin", "member-2"],
    });
  });

  it("rejects attendance for a non-participant", () => {
    expect(mergeStudyAttendance([], ["unknown"], ["member-1"])).toMatchObject({
      success: false,
      error: "VALIDATION_FAILED",
    });
  });

  it("validates correction fields and stores KST explicitly", () => {
    expect(
      studySessionCorrectionSchema.safeParse({
        title: "3회차",
        startedAtLocal: "2026-09-15T18:30",
      }).success,
    ).toBe(true);
    expect(localKstDateTimeToIso("2026-09-15T18:30")).toBe(
      "2026-09-15T18:30:00+09:00",
    );
  });

  it("validates a study request without a schedule field", () => {
    const result = studyRequestInputSchema.safeParse({
      title: "범주론 읽기 모임",
      textbook: "Mac Lane, Categories for the Working Mathematician",
      description: "정의와 예제를 함께 읽고 매주 핵심 연습문제를 토론합니다.",
      semester: "26-2",
      schedule: "매주 수요일",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("schedule");
    }
  });

  it("returns field-specific issues for an invalid study request", () => {
    const result = studyRequestInputSchema.safeParse({
      title: "A",
      textbook: "",
      description: "짧음",
      semester: "2026-2",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        title: expect.any(Array),
        textbook: expect.any(Array),
        description: expect.any(Array),
        semester: expect.any(Array),
      });
    }
  });
});
