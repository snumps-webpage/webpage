import { describe, expect, it } from "vitest";
import {
  seminarRequestProgress,
  seminarScheduleLabel,
} from "./seminar-progress";
import { seminarOperationError } from "./admin-seminars";

describe("seminar presentation progress", () => {
  it.each([
    ["pending", null, "심사 대기", 0],
    ["approved", "unscheduled", "승인 · 일정 조율", 1],
    ["approved", "scheduled", "일정 저장 · 공개 대기", 2],
    ["approved", "published", "공개됨", 3],
    ["approved", null, "승인됨", null],
    ["rejected", null, "반려", null],
    ["withdrawn", null, "철회", null],
    ["cancelled", "published", "취소됨", null],
    ["approved", "cancelled", "취소됨", null],
  ] as const)(
    "%s/%s uses existing lifecycle without a fabricated completed state",
    (status, publicationStatus, label, step) => {
      expect(
        seminarRequestProgress({ status, publicationStatus }),
      ).toMatchObject({ label, step });
    },
  );
  const schedule = {
    startsAt: "2026-10-10T00:00:00+09:00",
    startTime: null,
    endsAt: null,
    location: "장소",
  };
  it("unknown time renders date only, never midnight", () => {
    const label = seminarScheduleLabel(schedule);
    expect(label).toContain("2026");
    expect(label).toContain("10월");
    expect(label).toContain("10일");
    expect(label).not.toMatch(/오전|오후|12:00|00:00/);
  });
  it("known time uses KST independent of source offset", () => {
    const label = seminarScheduleLabel({
      ...schedule,
      startsAt: "2026-10-10T06:30:00Z",
      startTime: "15:30",
    });
    expect(label).toContain("03:30");
    expect(label).toContain("오후");
  });
  it("cross-day end time carries its real date", () => {
    const label = seminarScheduleLabel({
      ...schedule,
      startsAt: "2026-10-10T23:30:00+09:00",
      startTime: "23:30",
      endsAt: "2026-10-11T00:30:00+09:00",
    });
    expect(label).toContain("10일");
    expect(label).toContain("11일");
  });
  it.each(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", undefined])(
    "%s reports a useful action failure",
    (code) => {
      expect(seminarOperationError(code, "일정 저장")).not.toBe("");
    },
  );
});
