import { describe, expect, it } from "vitest";
import { planSessionLinks } from "../../../../scripts/ops/ops-notion-backfill-seminars.mjs";

/**
 * 세미나↔활동을 **정확히** 잇는다.
 *
 * 노션 세미나 페이지의 `활동 내역` 본문에는 활동 페이지 링크(mention)가 들어 있다.
 * 이주 스크립트는 속성만 읽었으므로 이 링크를 한 번도 보지 못했고, 그래서
 * `activityId: null`이 됐다. 제목 대조는 추측이지만 이 링크는 **원본이 직접 말하는
 * 답**이다 — 출석 기록이 달린 활동이 어느 세미나의 것인지가 여기 적혀 있다.
 *
 * 노션 활동 페이지 ↔ 앱 활동 행은 제목+시작시각으로 잇는다(같은 페이지에서
 * 이주됐으므로 둘 다 일치한다).
 */

const notionSeminar = (over = {}) => ({
  title: "해석개론",
  semester: "24-W",
  sessions: [
    { title: "해석개론 1회차", startsAt: "2025-02-20T19:00:00+09:00" },
  ],
  ...over,
});

const appSeminar = (over = {}) => ({
  id: "s1",
  title: "해석개론",
  semester: "24-W",
  schedule: null,
  activityId: null,
  ...over,
});

const appActivity = (over = {}) => ({
  id: "a1",
  title: "해석개론 1회차",
  type: "세미나",
  date: { start: "2025-02-20T19:00:00+09:00", end: null },
  ...over,
});

const plan = (input: Record<string, unknown>) =>
  planSessionLinks({
    notionSeminars: [],
    appSeminars: [],
    appActivities: [],
    location: "기록 없음",
    ...input,
  });

describe("planSessionLinks", () => {
  it("본문 링크가 가리키는 활동을 세미나에 잇는다", () => {
    const result = plan({
      notionSeminars: [notionSeminar()],
      appSeminars: [appSeminar()],
      appActivities: [appActivity()],
    });

    expect(result.rows[0].activityId).toBe("a1");
    expect(result.rows[0].schedule).toEqual({
      startsAt: "2025-02-20T19:00:00+09:00",
      endsAt: null,
      location: "기록 없음",
    });
    expect(result.planned[0].sessions).toBe(1);
  });

  // 회차가 여럿이면 세미나의 시작은 **가장 이른** 회차다.
  it("여러 회차 중 가장 이른 것을 세미나 일정으로 삼는다", () => {
    const result = plan({
      notionSeminars: [
        notionSeminar({
          sessions: [
            { title: "해석개론 2회차", startsAt: "2025-02-21T19:00:00+09:00" },
            { title: "해석개론 1회차", startsAt: "2025-02-20T19:00:00+09:00" },
          ],
        }),
      ],
      appSeminars: [appSeminar()],
      appActivities: [
        appActivity(),
        appActivity({
          id: "a2",
          title: "해석개론 2회차",
          date: { start: "2025-02-21T19:00:00+09:00", end: null },
        }),
      ],
    });

    expect(result.rows[0].activityId).toBe("a1");
    expect(result.planned[0].sessions).toBe(2);
  });

  it("종료 시각이 있으면 함께 옮긴다", () => {
    const result = plan({
      notionSeminars: [notionSeminar()],
      appSeminars: [appSeminar()],
      appActivities: [
        appActivity({
          date: {
            start: "2025-02-20T19:00:00+09:00",
            end: "2025-02-20T21:00:00+09:00",
          },
        }),
      ],
    });

    expect(result.rows[0].schedule?.endsAt).toBe("2025-02-20T21:00:00+09:00");
  });

  // 이미 이어져 있거나 일정이 있는 행은 운영진이 손댔을 수 있다.
  it("이미 일정이 있는 세미나는 건드리지 않는다", () => {
    const existing = {
      startsAt: "2025-03-02T18:00:00+09:00",
      endsAt: null,
      location: "27동",
    };
    const result = plan({
      notionSeminars: [notionSeminar()],
      appSeminars: [appSeminar({ schedule: existing })],
      appActivities: [appActivity()],
    });

    expect(result.rows[0].schedule).toEqual(existing);
    expect(result.planned).toEqual([]);
  });

  it("앱에 짝이 없는 활동은 잇지 않고 보고한다", () => {
    const result = plan({
      notionSeminars: [notionSeminar()],
      appSeminars: [appSeminar()],
      appActivities: [],
    });

    expect(result.rows[0].activityId).toBeNull();
    expect(result.unresolved[0].reason).toBe("앱에 활동 없음");
  });

  it("본문에 링크가 없는 세미나는 대상이 아니다", () => {
    const result = plan({
      notionSeminars: [notionSeminar({ sessions: [] })],
      appSeminars: [appSeminar()],
      appActivities: [appActivity()],
    });

    expect(result.planned).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  // 제목·학기가 겹치면 어느 앱 세미나인지 알 수 없다 — 날짜를 잘못 박지 않는다.
  it("제목·학기가 겹치면 건드리지 않는다", () => {
    const result = plan({
      notionSeminars: [notionSeminar()],
      appSeminars: [appSeminar(), appSeminar({ id: "s2" })],
      appActivities: [appActivity()],
    });

    expect(result.rows.every((r) => r.activityId === null)).toBe(true);
    expect(result.unresolved[0].reason).toBe("제목·학기 중복");
  });
});
