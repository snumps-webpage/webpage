import { describe, expect, it } from "vitest";
import {
  seminarSchedulesEqual,
  seminarScheduleInputSchema,
  validateSeminarScheduleForm,
} from "./admin-seminars";

describe("seminarSchedulesEqual", () => {
  const schedule = {
    startsAt: "2026-09-09T18:30:00+09:00",
    startTime: "18:30",
    endsAt: "2026-09-09T20:00:00+09:00",
    location: "27동 220호",
  };

  it("treats an identical schedule retry as unchanged", () => {
    expect(seminarSchedulesEqual({ ...schedule }, schedule)).toBe(true);
  });

  // 시각 미상(null)과 시각 있음은 다른 일정이다 — 아니면 복구 후 다시 저장할 때
  // "바뀐 것 없음"으로 읽혀 변경 공지가 나가지 않는다.
  it("detects a time that became known", () => {
    expect(
      seminarSchedulesEqual({ ...schedule, startTime: null }, schedule),
    ).toBe(false);
  });

  it("detects a location change", () => {
    expect(
      seminarSchedulesEqual(schedule, { ...schedule, location: "56동 105호" }),
    ).toBe(false);
  });
});

describe("seminarScheduleInputSchema", () => {
  it("accepts a valid KST-local schedule form", () => {
    const result = seminarScheduleInputSchema.safeParse({
      startsAtLocal: "2026-09-09T18:30",
      endsAtLocal: "2026-09-09T20:00",
      location: "27동 220호",
    });

    expect(result.success).toBe(true);
  });

  it("allows an omitted end time", () => {
    const result = seminarScheduleInputSchema.safeParse({
      startsAtLocal: "2026-09-09T18:30",
      endsAtLocal: "",
      location: "27동 220호",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an end time that is not after the start", () => {
    const result = seminarScheduleInputSchema.safeParse({
      startsAtLocal: "2026-09-09T18:30",
      endsAtLocal: "2026-09-09T18:00",
      location: "27동 220호",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endsAtLocal"]);
    }
  });
});

describe("validateSeminarScheduleForm", () => {
  it("returns field issues and submitted values", () => {
    const formData = new FormData();
    formData.set("startsAtLocal", "");
    formData.set("endsAtLocal", "");
    formData.set("location", "");

    const result = validateSeminarScheduleForm(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.issues).toMatchObject({
        startsAtLocal: expect.any(String),
        location: expect.any(String),
      });
      expect(result.failure.values.location).toBe("");
    }
  });
});
