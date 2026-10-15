import { describe, expect, it } from "vitest";
import {
  REGULAR_RECORD_THRESHOLD,
  STUDY_MIN_SESSIONS,
  inMemberView,
  memberActivity,
  memberStanding,
  selectPromotionCandidates,
  type MemberActivityData,
} from "./member-activity";

/**
 * 회칙 기준 활동 기록·회원 지위 (snumps-webpage/D-000070·071·074·075·076·078).
 *
 * - 활동 기록(회칙 제18~20조): 세미나는 참석하거나 발표한 활동 1건당 1회(둘 다여도
 *   1회), 스터디 세션은 스터디별로 묶어 취소되지 않은 세션 4개 이상 중 과반 참석이면
 *   그 스터디로 1회, 그 밖의 스터디 활동(이주분)·회식·회의·기타는 참석 1건당 1회.
 *   숨김 활동은 세지 않는다.
 * - 지위(회칙 제4·5조): 이번 학기 등록이면 정회원(저장 regular 또는 기록 3회 이상)
 *   /준회원, 미등록이면 동문(기록 3회 이상 또는 isAlumni)/이전 회원.
 */

type Act = MemberActivityData["activities"][number];

function activity(
  id: string,
  type: string,
  start: string,
  attendeeIds: string[],
  over: Partial<Act> = {},
): Act {
  return {
    id,
    title: `${type} ${id}`,
    type,
    start,
    end: null,
    attendeeIds,
    studyId: null,
    sourceRequestId: null,
    ...over,
  };
}

/** 스터디 세션 활동 — flow_create_study_session이 만드는 모양(`<studyId>:<date>`). */
function session(
  studyId: string,
  no: number,
  attendeeIds: string[],
  over: Partial<Act> = {},
): Act {
  const start = `2026-09-${String(no).padStart(2, "0")}T19:00:00+09:00`;
  return activity(`${studyId}-s${no}`, "스터디", start, attendeeIds, {
    studyId,
    sourceRequestId: `${studyId}:${start}`,
    ...over,
  });
}

function seminar(
  id: string,
  presenterIds: string[],
  activityId: string | null,
): MemberActivityData["seminars"][number] {
  return {
    id,
    title: `세미나 ${id}`,
    semester: "26-2",
    presenterIds,
    activityId,
  };
}

const empty: MemberActivityData = { seminars: [], studies: [], activities: [] };
const me = new Set(["m1"]);

describe("constants", () => {
  it("follow the charter (제4조 ②, 제20조 ②)", () => {
    expect(REGULAR_RECORD_THRESHOLD).toBe(3);
    expect(STUDY_MIN_SESSIONS).toBe(4);
  });
});

describe("memberActivity — seminar records", () => {
  it("counts a presenter who also attended once", () => {
    const result = memberActivity(me, {
      ...empty,
      seminars: [seminar("s1", ["m1"], "a1")],
      activities: [
        activity("a1", "세미나", "2026-09-01T19:00:00+09:00", ["m1"]),
      ],
    });
    expect(result.records).toBe(1);
    expect(result.recordsByType).toEqual({ 세미나: 1 });
  });

  it("counts a presenter who is not on the attendance list", () => {
    const result = memberActivity(me, {
      ...empty,
      seminars: [seminar("s1", ["m1"], "a1")],
      activities: [activity("a1", "세미나", "2026-09-01T19:00:00+09:00", [])],
    });
    expect(result.records).toBe(1);
    // 발표는 기록이지만 참석 목록에는 올리지 않는다
    expect(result.attended).toEqual([]);
  });

  it("counts a plain attendee once per seminar activity", () => {
    const result = memberActivity(me, {
      ...empty,
      seminars: [seminar("s1", ["m9"], "a1")],
      activities: [
        activity("a1", "세미나", "2026-09-01T19:00:00+09:00", ["m1"]),
        activity("a2", "세미나", "2026-09-08T19:00:00+09:00", ["m1"]),
      ],
    });
    expect(result.records).toBe(2);
  });

  it("gives a presenter nothing for a seminar with no activity", () => {
    const result = memberActivity(me, {
      ...empty,
      seminars: [seminar("s1", ["m1"], null)],
    });
    expect(result.records).toBe(0);
    expect(result.hostedSeminars.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("memberActivity — study sessions", () => {
  const sessions = (attendedOf: number, total: number, over = {}) =>
    Array.from({ length: total }, (_, i) =>
      session("st1", i + 1, i < attendedOf ? ["m1"] : ["m9"], over),
    );

  it("gives one record for attending 3 of 4 sessions", () => {
    const result = memberActivity(me, {
      ...empty,
      activities: sessions(3, 4),
    });
    expect(result.records).toBe(1);
    expect(result.recordsByType).toEqual({ 스터디: 1 });
    // 참석 목록은 세션마다
    expect(result.attended).toHaveLength(3);
  });

  it("gives nothing for 2 of 4 sessions — half is not a majority", () => {
    expect(
      memberActivity(me, { ...empty, activities: sessions(2, 4) }).records,
    ).toBe(0);
  });

  it("gives nothing for a study of 3 sessions, all attended", () => {
    expect(
      memberActivity(me, { ...empty, activities: sessions(3, 3) }).records,
    ).toBe(0);
  });

  it("gives one record for 5 sessions all attended — once per study", () => {
    expect(
      memberActivity(me, { ...empty, activities: sessions(5, 5) }).records,
    ).toBe(1);
  });

  it("leaves cancelled (hidden) sessions out of the session count", () => {
    // 5세션 중 2개 취소 → 진행 3세션: 인정되지 않는 스터디
    const five = sessions(3, 5).map((a, i) =>
      i >= 3 ? { ...a, hidden: true } : a,
    );
    expect(memberActivity(me, { ...empty, activities: five }).records).toBe(0);

    // 6세션 중 1개 취소 → 진행 5세션 중 3 참석: 과반
    const six = sessions(3, 6).map((a, i) =>
      i === 5 ? { ...a, hidden: true } : a,
    );
    expect(memberActivity(me, { ...empty, activities: six }).records).toBe(1);
  });

  it("groups sessions per study", () => {
    const result = memberActivity(me, {
      ...empty,
      activities: [
        ...sessions(4, 4),
        ...Array.from({ length: 4 }, (_, i) =>
          session("st2", i + 1, i < 3 ? ["m1"] : []),
        ),
      ],
    });
    expect(result.records).toBe(2);
  });

  it("counts a migrated study activity (no session key) once per attendance", () => {
    const result = memberActivity(me, {
      ...empty,
      activities: [
        activity("a1", "스터디", "2023-09-01T00:00:00+09:00", ["m1"], {
          studyId: "st-old",
          sourceRequestId: null,
        }),
        activity("a2", "스터디", "2022-09-01T00:00:00+09:00", ["m1"], {
          studyId: null,
          sourceRequestId: null,
        }),
      ],
    });
    expect(result.records).toBe(2);
    expect(result.recordsByType).toEqual({ 스터디: 2 });
  });
});

describe("memberActivity — other records", () => {
  it("counts 회식·회의·기타 once per attendance", () => {
    const result = memberActivity(me, {
      ...empty,
      activities: [
        activity("a1", "회식", "2026-09-01T19:00:00+09:00", ["m1"]),
        activity("a2", "회의", "2026-09-02T19:00:00+09:00", ["m1"]),
        activity("a3", "기타", "2026-09-03T19:00:00+09:00", ["m1"]),
        activity("a4", "회식", "2026-09-04T19:00:00+09:00", ["m9"]),
      ],
    });
    expect(result.records).toBe(3);
    expect(result.recordsByType).toEqual({ 회식: 1, 회의: 1, 기타: 1 });
  });

  it("never counts a hidden activity but still lists it as attended", () => {
    const result = memberActivity(me, {
      ...empty,
      seminars: [seminar("s1", ["m1"], "a1")],
      activities: [
        activity("a1", "세미나", "2026-09-01T19:00:00+09:00", ["m1"], {
          hidden: true,
        }),
        activity("a2", "회식", "2026-09-02T19:00:00+09:00", ["m1"], {
          hidden: true,
        }),
      ],
    });
    expect(result.records).toBe(0);
    expect(result.recordsByType).toEqual({});
    expect(result.attended.map((a) => a.id)).toEqual(["a2", "a1"]);
  });

  it("is empty with no record at all", () => {
    expect(memberActivity(me, empty)).toEqual({
      hostedSeminars: [],
      hostedStudies: [],
      attended: [],
      records: 0,
      recordsByType: {},
    });
  });
});

describe("memberActivity — one person, two ids", () => {
  it("merges a person's two ids without counting a record twice", () => {
    const data: MemberActivityData = {
      seminars: [
        { ...seminar("s-old", ["L1"], "a-old"), semester: "22-1" },
        { ...seminar("s-new", ["m1", "L1"], null), title: "새 세미나" },
        seminar("s-other", ["m9"], "a-other"),
      ],
      studies: [
        { id: "st1", title: "해석학", semester: "23-2", organizerIds: ["L1"] },
        { id: "st2", title: "대수학", semester: "26-1", organizerIds: ["m9"] },
      ],
      activities: [
        activity("a-old", "세미나", "2022-03-10T19:00:00+09:00", ["L1"]),
        activity("a-both", "스터디", "2023-09-10T19:00:00+09:00", ["m1", "L1"]),
        activity("a-new", "회식", "2026-09-10T19:00:00+09:00", ["m1"]),
        activity("a-other", "세미나", "2026-09-11T19:00:00+09:00", ["m9"]),
      ],
    };

    const result = memberActivity(new Set(["m1", "L1"]), data);

    expect(result.hostedSeminars).toEqual([
      { id: "s-new", title: "새 세미나", semester: "26-2" },
      { id: "s-old", title: "세미나 s-old", semester: "22-1" },
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
    expect(result.records).toBe(3);
    expect(result.recordsByType).toEqual({ 회식: 1, 스터디: 1, 세미나: 1 });
  });

  it("carries only the activity reference, not the attendee list", () => {
    const result = memberActivity(me, {
      ...empty,
      activities: [
        activity("a1", "세미나", "2026-09-01T19:00:00+09:00", ["m1", "m2"], {
          end: "2026-09-01T21:00:00+09:00",
        }),
      ],
    });
    expect(result.attended).toEqual([
      {
        id: "a1",
        title: "세미나 a1",
        type: "세미나",
        start: "2026-09-01T19:00:00+09:00",
        end: "2026-09-01T21:00:00+09:00",
      },
    ]);
  });
});

describe("selectPromotionCandidates", () => {
  const TERM = "26-2";
  const dinners = (n: number, attendeeIds: string[]) =>
    Array.from({ length: n }, (_, i) =>
      activity(
        `d${i}`,
        "회식",
        `2026-09-0${i + 1}T19:00:00+09:00`,
        attendeeIds,
      ),
    );
  const pick = (
    members: { id: string; legacyMemberId: string | null; status: string }[],
    registrations: { memberId: string; term: string }[],
    activities: Act[],
  ) =>
    selectPromotionCandidates({
      members,
      registrations,
      term: TERM,
      data: { ...empty, activities },
    });
  const assoc = (id: string, legacyMemberId: string | null = null) => ({
    id,
    legacyMemberId,
    status: "associate",
  });

  it("picks a registered associate with 3 records", () => {
    expect(
      pick([assoc("m1")], [{ memberId: "m1", term: TERM }], dinners(3, ["m1"])),
    ).toEqual(["m1"]);
  });

  it("leaves a registered associate with 2 records", () => {
    expect(
      pick([assoc("m1")], [{ memberId: "m1", term: TERM }], dinners(2, ["m1"])),
    ).toEqual([]);
  });

  it("leaves an associate registered only in another term", () => {
    expect(
      pick(
        [assoc("m1")],
        [{ memberId: "m1", term: "26-1" }],
        dinners(3, ["m1"]),
      ),
    ).toEqual([]);
  });

  it("leaves regular and withdrawn members alone — no demotion either", () => {
    const regs = ["m1", "m2", "m3"].map((memberId) => ({
      memberId,
      term: TERM,
    }));
    expect(
      pick(
        [
          { id: "m1", legacyMemberId: null, status: "regular" },
          { id: "m2", legacyMemberId: null, status: "withdrawn" },
          { id: "m3", legacyMemberId: null, status: "regular" },
        ],
        regs,
        dinners(3, ["m1", "m2"]),
      ),
    ).toEqual([]);
  });

  it("counts the legacy id's records and registration as the person's", () => {
    expect(
      pick(
        [assoc("m1", "L1")],
        [{ memberId: "L1", term: TERM }],
        [
          ...dinners(2, ["L1"]),
          activity("x", "회의", "2026-09-09T19:00:00+09:00", ["m1"]),
        ],
      ),
    ).toEqual(["m1"]);
  });

  it("does not count hidden activities toward promotion", () => {
    const acts = dinners(3, ["m1"]).map((a, i) =>
      i === 0 ? { ...a, hidden: true } : a,
    );
    expect(pick([assoc("m1")], [{ memberId: "m1", term: TERM }], acts)).toEqual(
      [],
    );
  });
});

describe("inMemberView", () => {
  it("puts regular and associate in the current view, regular alone in the regular view", () => {
    const of = (view: "current" | "regular" | "all") =>
      (["regular", "associate", "alumni", "former", null] as const).filter(
        (s) => inMemberView(s, view),
      );
    expect(of("current")).toEqual(["regular", "associate"]);
    expect(of("regular")).toEqual(["regular"]);
    expect(of("all")).toEqual([
      "regular",
      "associate",
      "alumni",
      "former",
      null,
    ]);
  });
});

describe("memberStanding", () => {
  const standing = (over: Partial<Parameters<typeof memberStanding>[0]>) =>
    memberStanding({
      registeredThisTerm: true,
      storedStatus: "associate",
      isAlumni: false,
      records: 0,
      ...over,
    });

  it("makes a registered member regular at 3 records, associate at 2", () => {
    expect(standing({ records: 2 })).toBe("associate");
    expect(standing({ records: 3 })).toBe("regular");
  });

  it("keeps a stored regular regular whatever the count", () => {
    expect(standing({ storedStatus: "regular", records: 0 })).toBe("regular");
  });

  it("does not let isAlumni alone make a registered member regular", () => {
    expect(standing({ isAlumni: true, records: 0 })).toBe("associate");
  });

  it("makes an unregistered person alumni at 3 records, former at 2", () => {
    expect(standing({ registeredThisTerm: false, records: 2 })).toBe("former");
    expect(standing({ registeredThisTerm: false, records: 3 })).toBe("alumni");
  });

  it("makes an unregistered isAlumni person alumni with no records", () => {
    expect(
      standing({ registeredThisTerm: false, isAlumni: true, records: 0 }),
    ).toBe("alumni");
  });

  it("does not let a stored regular status outlast the registration", () => {
    expect(
      standing({
        registeredThisTerm: false,
        storedStatus: "regular",
        records: 0,
      }),
    ).toBe("former");
  });
});
