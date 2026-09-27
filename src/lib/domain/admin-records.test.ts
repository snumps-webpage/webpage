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
        externalPresenters: "",
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
