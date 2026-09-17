import { describe, expect, it } from "vitest";
// 운영 스크립트의 순수 계획 함수. 스크립트는 src/를 import하지 않지만(독립 실행),
// **판정 로직만은** 테스트 아래 둔다 — 잘못 이으면 남의 세미나 날짜가 박힌다.
import { planSeminarRepairs } from "../../../../scripts/ops/ops-repair-seminar-schedules.mjs";

/**
 * 이주 사고의 복구 계획 (C-12).
 *
 * `20-export-tables.ts`가 세미나를 옮기며 `activityId: null`을 박아 넣어, 일시를
 * 가진 활동과의 연결이 끊겼다. 활동에는 날짜가 그대로 있으므로 **일시는 복구
 * 가능**하다. 장소는 노션 매핑 어디에도 없었으므로 복구 대상이 아니다.
 */

const seminar = (over = {}) => ({
  id: "s1",
  title: "정수론 입문",
  semester: "24-2",
  publicationStatus: "published",
  schedule: null,
  activityId: null,
  sourceRequestId: null, // 이주분 — 신청 흐름에서 온 것이 아니다
  ...over,
});

const activity = (over = {}) => ({
  id: "a1",
  title: "정수론 입문",
  type: "세미나",
  date: { start: "2024-10-15T19:00:00+09:00", end: null },
  ...over,
});

const plan = (input: Record<string, unknown>) =>
  planSeminarRepairs({
    seminars: [],
    activities: [],
    events: [],
    location: "기록 없음",
    ...input,
  });

describe("planSeminarRepairs", () => {
  it("연결된 활동의 날짜를 세미나 일정으로 복구한다", () => {
    const result = plan({
      seminars: [seminar({ activityId: "a1" })],
      activities: [activity()],
    });

    expect(result.rows[0].schedule).toEqual({
      startsAt: "2024-10-15T19:00:00+09:00",
      startTime: "19:00",
      endsAt: null,
      location: "기록 없음",
    });
    expect(result.planned).toHaveLength(1);
  });

  it("연결이 끊긴 행은 공개 앵커로 되찾는다", () => {
    const result = plan({
      seminars: [seminar()],
      activities: [activity()],
      events: [{ id: "e1", sourceRequestId: "seminar:s1", activityId: "a1" }],
    });

    expect(result.rows[0].activityId).toBe("a1");
    expect(result.rows[0].schedule?.startsAt).toBe("2024-10-15T19:00:00+09:00");
    expect(result.planned[0].via).toBe("anchor");
  });

  // 이주분에는 앵커도 activityId도 없다 — 제목이 유일한 실마리다.
  it("앵커도 없으면 제목으로 잇는다", () => {
    const result = plan({
      seminars: [seminar()],
      activities: [activity({ title: "정수론 입문 1회차" })],
    });

    expect(result.rows[0].activityId).toBe("a1");
    expect(result.planned[0].via).toBe("title");
  });

  it("여러 회차면 가장 이른 날짜를 앵커로 삼고 회차 수를 보고한다", () => {
    const result = plan({
      seminars: [seminar()],
      activities: [
        activity({
          id: "a2",
          title: "정수론 입문 2회차",
          date: { start: "2024-10-22T19:00:00+09:00", end: null },
        }),
        activity({ id: "a1", title: "정수론 입문 1회차" }),
      ],
    });

    expect(result.rows[0].activityId).toBe("a1");
    expect(result.planned[0].sessions).toBe(2);
  });

  it("종료 시각이 있으면 함께 옮긴다", () => {
    const result = plan({
      seminars: [seminar({ activityId: "a1" })],
      activities: [
        activity({
          date: {
            start: "2024-10-15T19:00:00+09:00",
            end: "2024-10-15T21:00:00+09:00",
          },
        }),
      ],
    });

    expect(result.rows[0].schedule?.endsAt).toBe("2024-10-15T21:00:00+09:00");
  });

  // 이미 일정이 있는 행을 덮으면 운영자가 손으로 고친 값을 되돌려 놓는다.
  it("이미 일정이 있는 세미나는 건드리지 않는다", () => {
    const existing = {
      startsAt: "2025-03-02T18:00:00+09:00",
      endsAt: null,
      location: "27동",
    };
    const result = plan({
      seminars: [seminar({ activityId: "a1", schedule: existing })],
      activities: [activity()],
    });

    expect(result.rows[0].schedule).toEqual(existing);
    expect(result.planned).toHaveLength(0);
  });

  it("세미나가 아닌 활동에는 잇지 않는다", () => {
    const result = plan({
      seminars: [seminar()],
      activities: [activity({ type: "회의" })],
    });

    expect(result.rows[0].schedule).toBeNull();
    expect(result.unresolved[0].reason).toBe("활동 없음");
  });

  /**
   * 신청 흐름으로 만들어진 세미나는 **이주 사고의 피해자가 아니다.** 그 행의
   * 활동은 예전 승인 경로가 만든 것이고, 그 시작 시각은 "승인을 누른 순간"이다
   * (회장이 처음 신고한 그 버그). 그것을 일정으로 복사하면 버그를 데이터에
   * 고착시킨다 — 이 행들의 일정은 관리자가 화면에서 직접 넣어야 한다.
   */
  it("신청에서 온 세미나는 복구 대상이 아니다", () => {
    const result = plan({
      seminars: [seminar({ activityId: "a1", sourceRequestId: "req1" })],
      activities: [activity()],
    });

    expect(result.rows[0].schedule).toBeNull();
    expect(result.planned).toEqual([]);
    expect(result.unresolved[0].reason).toBe("신청 흐름 — 관리자가 입력");
  });

  it("이주분(신청 없음)은 그대로 복구한다", () => {
    const result = plan({
      seminars: [seminar({ activityId: "a1", sourceRequestId: null })],
      activities: [activity()],
    });

    expect(result.planned).toHaveLength(1);
  });

  // 모르는 시각을 자정으로 적으면 화면이 "오전 12:00"을 사실처럼 말한다.
  it("시각을 모르면 일정의 시각도 null이다", () => {
    const result = plan({
      seminars: [seminar({ activityId: "a1" })],
      activities: [
        activity({ date: { start: "2025-02-20T00:00:00+09:00", end: null } }),
      ],
    });

    expect(result.rows[0].schedule?.startTime).toBeNull();
  });

  // 노션 `일정`이 날짜만인 경우가 많다 — 자정은 "시각 미상"이라는 뜻이다.
  it("시각이 없는 날짜는 시각 미상으로 표시한다", () => {
    const result = plan({
      seminars: [seminar({ activityId: "a1" })],
      activities: [
        activity({ date: { start: "2025-02-20T00:00:00+09:00", end: null } }),
      ],
    });

    expect(result.planned[0].timeUnknown).toBe(true);
  });

  it("시각이 있으면 미상이 아니다", () => {
    const result = plan({
      seminars: [seminar({ activityId: "a1" })],
      activities: [activity()],
    });

    expect(result.planned[0].timeUnknown).toBe(false);
  });

  it("짝이 없으면 손댈 목록으로 남긴다", () => {
    const result = plan({ seminars: [seminar()], activities: [] });

    expect(result.rows[0]).toEqual(seminar());
    expect(result.unresolved).toEqual([
      { id: "s1", title: "정수론 입문", semester: "24-2", reason: "활동 없음" },
    ]);
  });

  // 날짜 없는 활동은 복구할 것이 없다 — 빈 일정을 박으면 스키마가 거절한다.
  it("활동에 시작 시각이 없으면 손대지 않는다", () => {
    const result = plan({
      seminars: [seminar({ activityId: "a1" })],
      activities: [activity({ date: { start: "", end: null } })],
    });

    expect(result.rows[0].schedule).toBeNull();
    expect(result.unresolved[0].reason).toBe("활동에 날짜 없음");
  });

  it("아무것도 바꾸지 않으면 변경 없음으로 보고한다", () => {
    const result = plan({ seminars: [], activities: [] });

    expect(result.planned).toEqual([]);
    expect(result.changed).toBe(false);
  });
});
