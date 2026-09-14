import { describe, expect, it } from "vitest";
import { SEMINAR_PUBLICATION_STATUSES } from "$lib/domain/admin-seminars";
import { SeminarSchema } from "./seminar";

/**
 * 세미나는 승인 즉시 공개되지 않는다 (FRONTEND-DECISIONS §3-1):
 * 승인 → 일정 미정 → 일정 확정 → 공개. 그 상태와 확정된 일정이 저장돼야
 * 관리자 화면이 단계를 구분할 수 있다 — 지금은 `activityId` 유무로 추측하고
 * 있어 승인된 것이 전부 "공개"로 보인다.
 */

const base = {
  id: "sem1",
  title: "정수론 세미나",
  semester: "26-2",
  note: "설명",
  presenterIds: ["m1"],
  externalPresenters: "",
  materials: [],
  photos: [],
  activityId: null,
  sourceRequestId: null,
};

describe("SeminarSchema — 공개 상태와 일정", () => {
  // 이주 규칙: 필드가 없는 기존 행은 이미 공개된 세미나다.
  it("기존 행은 published · 일정 없음으로 읽힌다", () => {
    const parsed = SeminarSchema.parse(base);

    expect(parsed.publicationStatus).toBe("published");
    expect(parsed.schedule).toBeNull();
  });

  it("새 세미나는 일정 미정으로 만들 수 있다", () => {
    const parsed = SeminarSchema.parse({
      ...base,
      publicationStatus: "unscheduled",
    });

    expect(parsed.publicationStatus).toBe("unscheduled");
  });

  it("확정된 일정은 시작·종료·장소를 함께 보관한다", () => {
    const schedule = {
      startsAt: "2026-10-15T19:00:00+09:00",
      endsAt: "2026-10-15T21:00:00+09:00",
      location: "27동 325호",
    };

    expect(
      SeminarSchema.parse({ ...base, publicationStatus: "scheduled", schedule })
        .schedule,
    ).toEqual(schedule);
  });

  it("종료 시각은 비워 둘 수 있다", () => {
    const schedule = {
      startsAt: "2026-10-15T19:00:00+09:00",
      endsAt: null,
      location: "27동",
    };

    expect(
      SeminarSchema.parse({ ...base, schedule }).schedule?.endsAt,
    ).toBeNull();
  });

  it("상태 집합은 도메인과 같은 목록이다", () => {
    for (const status of SEMINAR_PUBLICATION_STATUSES) {
      expect(
        SeminarSchema.parse({ ...base, publicationStatus: status })
          .publicationStatus,
      ).toBe(status);
    }
    expect(() =>
      SeminarSchema.parse({ ...base, publicationStatus: "draft" }),
    ).toThrow();
  });

  it("일정의 시각은 오프셋을 가진 ISO여야 한다", () => {
    expect(() =>
      SeminarSchema.parse({
        ...base,
        schedule: { startsAt: "2026-10-15 19:00", endsAt: null, location: "x" },
      }),
    ).toThrow();
  });
});
