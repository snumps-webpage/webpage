import { describe, expect, it } from "vitest";
import {
  ACTIVE_WINDOW_DAYS,
  memberActivity,
  type MemberActivityData,
} from "./member-activity";

/**
 * 멤버별 활동 정도 (snumps-webpage/D-000042). 활동회원 규칙은 노션 회원 DB의
 * 공식 `dateBetween(now(), dateEnd(일정), "days") <= 183`을 옮긴 것이다 —
 * 참석한 세미나·스터디 활동 가운데 끝(없으면 시작)이 지금으로부터 183일
 * 이내(미래 포함)인 것이 하나라도 있으면 활동회원.
 */

const DAY = 86_400_000;
const NOW = new Date("2026-10-14T12:00:00+09:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

function activity(
  id: string,
  type: string,
  start: string,
  attendeeIds: string[],
  end: string | null = null,
) {
  return { id, title: `${type} ${id}`, type, start, end, attendeeIds };
}

const empty: MemberActivityData = { seminars: [], studies: [], activities: [] };

describe("memberActivity", () => {
  it("keeps the Notion window of 183 days", () => {
    expect(ACTIVE_WINDOW_DAYS).toBe(183);
  });

  it("is active at exactly 183 days and inactive at 184", () => {
    const at = (days: number) =>
      memberActivity(
        new Set(["m1"]),
        {
          ...empty,
          activities: [activity("a1", "세미나", daysAgo(days), ["m1"])],
        },
        NOW,
      ).active;
    expect(at(183)).toBe(true);
    expect(at(184)).toBe(false);
  });

  it("measures from the end of the activity when it has one", () => {
    const result = memberActivity(
      new Set(["m1"]),
      {
        ...empty,
        activities: [
          activity("a1", "스터디", daysAgo(300), ["m1"], daysAgo(100)),
        ],
      },
      NOW,
    );
    expect(result.active).toBe(true);
  });

  it("counts a future activity as active", () => {
    const result = memberActivity(
      new Set(["m1"]),
      {
        ...empty,
        activities: [activity("a1", "스터디", daysAgo(-30), ["m1"])],
      },
      NOW,
    );
    expect(result.active).toBe(true);
  });

  it("is inactive with only recent 회식·회의 activities", () => {
    const result = memberActivity(
      new Set(["m1"]),
      {
        ...empty,
        activities: [
          activity("a1", "회식", daysAgo(1), ["m1"]),
          activity("a2", "회의", daysAgo(2), ["m1"]),
          activity("a3", "기타", daysAgo(3), ["m1"]),
        ],
      },
      NOW,
    );
    expect(result.active).toBe(false);
    expect(result.countsByType).toEqual({ 회식: 1, 회의: 1, 기타: 1 });
  });

  it("is inactive with no attended activity", () => {
    expect(memberActivity(new Set(["m1"]), empty, NOW)).toEqual({
      hostedSeminars: [],
      hostedStudies: [],
      attended: [],
      countsByType: {},
      active: false,
    });
  });

  it("merges a person's two ids without counting a record twice", () => {
    const data: MemberActivityData = {
      seminars: [
        {
          id: "s-old",
          title: "옛 세미나",
          semester: "22-1",
          presenterIds: ["L1"],
        },
        {
          id: "s-new",
          title: "새 세미나",
          semester: "26-2",
          presenterIds: ["m1", "L1"],
        },
        {
          id: "s-other",
          title: "남의 세미나",
          semester: "26-2",
          presenterIds: ["m9"],
        },
      ],
      studies: [
        {
          id: "st1",
          title: "해석학",
          semester: "23-2",
          organizerIds: ["L1"],
        },
        {
          id: "st2",
          title: "대수학",
          semester: "26-1",
          organizerIds: ["m9"],
        },
      ],
      activities: [
        activity("a-old", "세미나", daysAgo(900), ["L1"]),
        activity("a-both", "스터디", daysAgo(400), ["m1", "L1"]),
        activity("a-new", "회식", daysAgo(10), ["m1"]),
        activity("a-other", "세미나", daysAgo(5), ["m9"]),
      ],
    };

    const result = memberActivity(new Set(["m1", "L1"]), data, NOW);

    expect(result.hostedSeminars).toEqual([
      { id: "s-new", title: "새 세미나", semester: "26-2" },
      { id: "s-old", title: "옛 세미나", semester: "22-1" },
    ]);
    expect(result.hostedStudies).toEqual([
      { id: "st1", title: "해석학", semester: "23-2" },
    ]);
    // 최신순, 같은 활동은 한 번
    expect(result.attended.map((a) => a.id)).toEqual([
      "a-new",
      "a-both",
      "a-old",
    ]);
    expect(result.countsByType).toEqual({ 회식: 1, 스터디: 1, 세미나: 1 });
    expect(result.active).toBe(false);
  });

  it("carries only the activity reference, not the attendee list", () => {
    const result = memberActivity(
      new Set(["m1"]),
      {
        ...empty,
        activities: [
          activity("a1", "세미나", daysAgo(1), ["m1", "m2"], daysAgo(0)),
        ],
      },
      NOW,
    );
    expect(result.attended).toEqual([
      {
        id: "a1",
        title: "세미나 a1",
        type: "세미나",
        start: daysAgo(1),
        end: daysAgo(0),
      },
    ]);
  });
});
