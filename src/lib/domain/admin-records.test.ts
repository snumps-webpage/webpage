import { describe, expect, it } from "vitest";
import {
  adminActivityRecordSchema,
  adminGalleryRecordSchema,
  adminSeminarRecordSchema,
  adminStudyRecordSchema,
  zodFieldIssues,
} from "./admin-records";

describe("admin record validation", () => {
  it("accepts the closed activity type contract", () => {
    expect(
      adminActivityRecordSchema.safeParse({
        title: "문제 풀이 모임",
        type: "문제 풀이",
        date: "2026-08-28",
      }).success,
    ).toBe(true);
    expect(
      adminActivityRecordSchema.safeParse({
        title: "문제 풀이 모임",
        type: "workshop",
        date: "2026-08-28",
      }).success,
    ).toBe(false);
  });

  it("requires gallery alt text and returns field issues", () => {
    const result = adminGalleryRecordSchema.safeParse({
      title: "세미나 사진",
      category: "seminar",
      date: "2026-08-28",
      alt: "",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(zodFieldIssues(result.error).alt).toContain("대체 텍스트");
  });

  it("validates seminar and study editor fields", () => {
    expect(
      adminSeminarRecordSchema.safeParse({
        title: "조합론 세미나",
        term: "26-2",
        kind: "regular",
        description: "확률적 방법의 기본 예제를 설명합니다.",
        prerequisites: "이산수학",
        durationMinutes: "90",
      }).success,
    ).toBe(true);
    expect(
      adminStudyRecordSchema.safeParse({
        title: "수론 스터디",
        term: "2026-2",
        description: "소수의 분포를 예제와 함께 공부합니다.",
        material: "Apostol",
      }).success,
    ).toBe(false);
  });
});
