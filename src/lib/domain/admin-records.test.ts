import { describe, expect, it } from "vitest";
import {
  adminActivityRecordSchema,
  adminActivityRecordUpdateSchema,
  adminGalleryRecordSchema,
  adminSeminarRecordSchema,
  adminStudyRecordCreateSchema,
  adminStudyRecordSchema,
} from "./admin-records";
import { fieldIssues } from "$lib/domain/form-data";

describe("admin record validation", () => {
  it("accepts only the activity types a record can store", () => {
    const activity = (type: string) =>
      adminActivityRecordSchema.safeParse({
        title: "정기 회의",
        type,
        start: "2026-08-28T19:00",
        end: "",
      }).success;
    expect(activity("회의")).toBe(true);
    expect(activity("workshop")).toBe(false);
    // display vocabulary only — activities.type cannot store it
    expect(activity("문제 풀이")).toBe(false);
  });

  it("requires the activity start on create but not on update", () => {
    const input = { title: "회의", type: "회의", start: "", end: "" };
    expect(adminActivityRecordSchema.safeParse(input).success).toBe(false);
    expect(adminActivityRecordUpdateSchema.safeParse(input).success).toBe(true);
  });

  // Audit LC03-1: activity dates had no order rule, so a range ending before
  // it starts was stored — and copied onto any session connected to it.
  it.each([
    ["before", "2026-08-28T18:00"],
    ["equal to", "2026-08-28T19:00"],
  ])("refuses an activity end %s its start", (_, end) => {
    const input = {
      title: "회의",
      type: "회의",
      start: "2026-08-28T19:00",
      end,
    };
    for (const schema of [
      adminActivityRecordSchema,
      adminActivityRecordUpdateSchema,
    ]) {
      const result = schema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(Object.keys(fieldIssues(result.error))).toEqual(["end"]);
    }
  });

  // Audit LC03-1: an update with an end but no start passed the schema, and
  // the action then dropped the end without a word.
  it("refuses an update that sends an end without a start", () => {
    const result = adminActivityRecordUpdateSchema.safeParse({
      title: "회의",
      type: "회의",
      start: "",
      end: "2026-08-28T21:00",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(Object.keys(fieldIssues(result.error))).toEqual(["start"]);
  });

  // Audit LC02-2 via LC03-1: an impossible date is refused, not ordered.
  it("refuses an impossible activity date", () => {
    const result = adminActivityRecordSchema.safeParse({
      title: "회의",
      type: "회의",
      start: "2026-02-30T10:00",
      end: "2026-03-01T12:00",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(Object.keys(fieldIssues(result.error))).toEqual(["start"]);
  });

  it("requires a gallery year and returns field issues", () => {
    const result = adminGalleryRecordSchema.safeParse({
      year: " ",
      activityId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldIssues(result.error).year).toContain("연도");
  });

  it("validates seminar and study editor fields", () => {
    expect(
      adminSeminarRecordSchema.safeParse({
        title: "조합론 세미나",
        term: "26-2",
        description: "",
        note: "",
        externalPresenters: "",
        kind: "",
        durationMinutes: "",
        prerequisites: "",
      }).success,
    ).toBe(true);
    expect(
      adminStudyRecordSchema.safeParse({
        title: "수론 스터디",
        term: "2026-2",
        description: "소수의 분포를 예제와 함께 공부합니다.",
        material: "Apostol",
        note: "",
      }).success,
    ).toBe(false);
  });

  it("validates a date-only activity without inventing a datetime input", () => {
    const input = {
      title: "회의",
      type: "회의",
      start: "",
      end: "",
      date: "2026-09-01",
    };
    expect(adminActivityRecordSchema.safeParse(input).success).toBe(true);
    expect(adminActivityRecordUpdateSchema.safeParse(input).success).toBe(true);
  });

  it.each(["2026-02-30", "2026-09-31", "2026-13-01", "2026-9-1", "tomorrow"])(
    "refuses raw invalid date-only input %s",
    (date) => {
      for (const schema of [
        adminActivityRecordSchema,
        adminActivityRecordUpdateSchema,
      ]) {
        const result = schema.safeParse({
          title: "회의",
          type: "회의",
          start: "",
          end: "",
          date,
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(fieldIssues(result.error)).toHaveProperty("date");
      }
    },
  );

  it.each(["1999-12-31", "2100-01-01"])(
    "only permits %s as an update candidate for an unchanged stored day",
    (date) => {
      const input = { title: "회의", type: "회의", start: "", end: "", date };
      expect(adminActivityRecordSchema.safeParse(input).success).toBe(false);
      expect(adminActivityRecordUpdateSchema.safeParse(input).success).toBe(
        true,
      );
    },
  );

  it("validates seminar description and note independently", () => {
    const input = {
      title: "세미나",
      term: "26-2",
      description: "",
      note: "",
      externalPresenters: "",
      kind: "",
      durationMinutes: "",
      prerequisites: "",
    };
    const result = adminSeminarRecordSchema.safeParse({
      ...input,
      description: "가".repeat(2401),
      note: "나".repeat(2401),
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(Object.keys(fieldIssues(result.error)).sort()).toEqual([
        "description",
        "note",
      ]);
  });

  it("bounds free text and requires an organizer on study create", () => {
    const result = adminStudyRecordCreateSchema.safeParse({
      title: "수론 스터디",
      term: "26-2",
      description: "가".repeat(2401),
      material: "",
      note: "",
      organizerId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(Object.keys(fieldIssues(result.error)).sort()).toEqual([
        "description",
        "organizerId",
      ]);
  });
});
