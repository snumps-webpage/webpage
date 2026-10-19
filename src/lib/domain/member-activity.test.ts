import { describe, expect, it } from "vitest";
import {
  REGULAR_RECORD_THRESHOLD,
  STUDY_MIN_SESSIONS,
  inMemberView,
  memberActivity,
  memberActivityData,
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
 *   숨김 활동과 아직 시작하지 않은 활동은 세지 않는다(D-000090).
 * - 지위(회칙 제4·5조): 이번 학기 등록이면 정회원(저장 regular, 기록 3회 이상, 또는
 *   박탈되지 않은 isAlumni — 제5조 ②, D-000092)/준회원, 미등록이면 동문(기록 3회
 *   이상 또는 isAlumni, 단 alumniRevoked면 아님 — D-000091)/이전 회원.
 */

/** 기준 시각 — 아래 고정 활동(2026-09 이전)은 모두 이미 시작했다. */
const NOW = new Date("2026-10-16T12:00:00+09:00");
const FUTURE = "2026-10-20T19:00:00+09:00";

const activityOf = (ids: ReadonlySet<string>, data: MemberActivityData) =>
  memberActivity(ids, data, NOW);

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
    startsAt: null,
    published: true,
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
    const result = activityOf(me, {
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
    const result = activityOf(me, {
      ...empty,
      seminars: [seminar("s1", ["m1"], "a1")],
      activities: [activity("a1", "세미나", "2026-09-01T19:00:00+09:00", [])],
    });
    expect(result.records).toBe(1);
    // 발표는 기록이지만 참석 목록에는 올리지 않는다
    expect(result.attended).toEqual([]);
  });

  it("counts a plain attendee once per seminar activity", () => {
    const result = activityOf(me, {
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
    const result = activityOf(me, {
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
    const result = activityOf(me, {
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
      activityOf(me, { ...empty, activities: sessions(2, 4) }).records,
    ).toBe(0);
  });

  it("gives nothing for a study of 3 sessions, all attended", () => {
    expect(
      activityOf(me, { ...empty, activities: sessions(3, 3) }).records,
    ).toBe(0);
  });

  it("gives one record for 5 sessions all attended — once per study", () => {
    expect(
      activityOf(me, { ...empty, activities: sessions(5, 5) }).records,
    ).toBe(1);
  });

  it("leaves cancelled (hidden) sessions out of the session count", () => {
    // 5세션 중 2개 취소 → 진행 3세션: 인정되지 않는 스터디
    const five = sessions(3, 5).map((a, i) =>
      i >= 3 ? { ...a, hidden: true } : a,
    );
    expect(activityOf(me, { ...empty, activities: five }).records).toBe(0);

    // 6세션 중 1개 취소 → 진행 5세션 중 3 참석: 과반
    const six = sessions(3, 6).map((a, i) =>
      i === 5 ? { ...a, hidden: true } : a,
    );
    expect(activityOf(me, { ...empty, activities: six }).records).toBe(1);
  });

  it("groups sessions per study", () => {
    const result = activityOf(me, {
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

  // snumps-webpage/D-000137: a 회식 linked to a study is one 회식 record only
  it("never counts a linked 회식 as a session, only as one 회식", () => {
    const dinner = (id: string, sourceRequestId: string | null) =>
      activity(id, "회식", "2026-09-05T21:00:00+09:00", ["m1"], {
        studyId: "st1",
        sourceRequestId,
      });
    // 4세션 중 2 참석(과반 아님) — 회식이 세션으로 들어가면 5세션 중 3 참석이 된다
    const result = activityOf(me, {
      ...empty,
      activities: [
        ...sessions(2, 4),
        dinner("d1", "st1:2026-09-05T21:00:00+09:00"),
      ],
    });
    expect(result.recordsByType).toEqual({ 회식: 1 });
    expect(result.records).toBe(1);

    const plain = activityOf(me, {
      ...empty,
      activities: [...sessions(2, 4), dinner("d2", null)],
    });
    expect(plain.recordsByType).toEqual({ 회식: 1 });
  });

  it("counts a migrated study activity (no session key) once per attendance", () => {
    const result = activityOf(me, {
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
    const result = activityOf(me, {
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

  // 회칙 제18조의 특위참여·임원진 사업 (snumps-webpage/D-000076·136·139·140)
  it("counts 특위 활동·임원진 사업 once per attendance", () => {
    const result = activityOf(me, {
      ...empty,
      activities: [
        activity("a1", "특위 활동", "2026-09-01T19:00:00+09:00", ["m1"]),
        activity("a2", "특위 활동", "2026-09-02T19:00:00+09:00", ["m1"]),
        activity("a3", "임원진 사업", "2026-09-03T19:00:00+09:00", ["m1"]),
        activity("a4", "임원진 사업", "2026-09-04T19:00:00+09:00", ["m9"]),
      ],
    });
    expect(result.records).toBe(3);
    expect(result.recordsByType).toEqual({ "특위 활동": 2, "임원진 사업": 1 });
  });

  it("never counts a hidden activity but still lists it as attended", () => {
    const result = activityOf(me, {
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
    expect(activityOf(me, empty)).toEqual({
      hostedSeminars: [],
      hostedStudies: [],
      attended: [],
      records: 0,
      recordsByType: {},
    });
  });
});

describe("memberActivity — hosted seminars not yet held (D-000240)", () => {
  it("leaves a seminar that has not started out of the hosted list", () => {
    const result = activityOf(me, {
      ...empty,
      seminars: [
        {
          ...seminar("s-held", ["m1"], null),
          startsAt: "2026-10-01T19:00:00+09:00",
        },
        { ...seminar("s-now", ["m1"], null), startsAt: NOW.toISOString() },
        { ...seminar("s-next", ["m1"], null), startsAt: FUTURE },
        // 일정이 기록되지 않은 게시된 이주 세미나는 열린 것으로 본다
        seminar("s-undated", ["m1"], null),
        // 날짜도 없는 미게시 세미나는 아직 열리지 않았다(D-000243)
        { ...seminar("s-pending", ["m1"], null), published: false },
      ],
    });
    expect(result.hostedSeminars.map((s) => s.id).sort()).toEqual([
      "s-held",
      "s-undated",
    ]);
  });
});

describe("memberActivityData — seminar start", () => {
  const tables = (schedule: { startsAt: string } | null) => ({
    seminars: [
      {
        id: "s1",
        title: "세미나",
        semester: "26-2",
        presenterIds: ["m1"],
        activityId: "a1",
        publicationStatus: "published",
        schedule,
      },
    ],
    studies: [],
    activities: [
      {
        id: "a1",
        title: "세미나",
        type: "세미나",
        date: { start: "2026-11-01T19:00:00+09:00", end: null },
        attendeeIds: [],
        studyId: null,
        sourceRequestId: null,
      },
    ],
    events: [],
  });

  it("takes the schedule's start, then the seminar activity's", () => {
    const start = (schedule: { startsAt: string } | null) =>
      memberActivityData(tables(schedule), { publicOnly: false }).data
        .seminars[0].startsAt;
    expect(start({ startsAt: "2026-10-30T19:00:00+09:00" })).toBe(
      "2026-10-30T19:00:00+09:00",
    );
    expect(start(null)).toBe("2026-11-01T19:00:00+09:00");
  });
});

describe("memberActivity — activities that have not started (D-000090)", () => {
  // D-000113·116: the list marks what has not started yet (start >= now),
  // the same rule that keeps it out of the records
  it("marks an attended activity that has not started as upcoming", () => {
    const result = activityOf(me, {
      ...empty,
      activities: [
        activity("a-past", "회식", "2026-10-16T11:59:00+09:00", ["m1"]),
        activity("a-now", "회식", NOW.toISOString(), ["m1"]),
        activity("a-next", "회식", FUTURE, ["m1"]),
      ],
    });
    expect(
      Object.fromEntries(result.attended.map((a) => [a.id, a.upcoming])),
    ).toEqual({ "a-past": false, "a-now": true, "a-next": true });
  });

  it("does not count a future seminar, attended or presented, but still lists the attended one", () => {
    const result = activityOf(me, {
      ...empty,
      seminars: [seminar("s1", ["m1"], "a1"), seminar("s2", ["m9"], "a2")],
      activities: [
        // 발표 예정 세미나
        activity("a1", "세미나", FUTURE, []),
        // 참석 명단에 오른 예정 세미나
        activity("a2", "세미나", FUTURE, ["m1"]),
      ],
    });
    expect(result.records).toBe(0);
    expect(result.recordsByType).toEqual({});
    expect(result.attended.map((a) => a.id)).toEqual(["a2"]);
  });

  it("does not count a future 회식·회의·기타 or migrated study activity", () => {
    const result = activityOf(me, {
      ...empty,
      activities: [
        activity("a1", "회식", FUTURE, ["m1"]),
        activity("a2", "회의", FUTURE, ["m1"]),
        activity("a3", "기타", FUTURE, ["m1"]),
        activity("a4", "스터디", FUTURE, ["m1"], { studyId: "st-old" }),
        activity("a5", "회식", "2026-10-16T11:59:00+09:00", ["m1"]),
      ],
    });
    expect(result.records).toBe(1);
    expect(result.recordsByType).toEqual({ 회식: 1 });
  });

  it("counts only started sessions toward the 4-session majority rule", () => {
    const future = (no: number, attendeeIds: string[]) =>
      session("st1", no, attendeeIds, { start: FUTURE });
    // 시작한 4세션 중 3 참석 + 예정 1세션 → 1 (예정 세션은 회차에 넣지 않는다)
    expect(
      activityOf(me, {
        ...empty,
        activities: [
          session("st1", 1, ["m1"]),
          session("st1", 2, ["m1"]),
          session("st1", 3, ["m1"]),
          session("st1", 4, ["m9"]),
          future(5, ["m9"]),
          future(6, ["m9"]),
        ],
      }).records,
    ).toBe(1);
    // 시작한 3세션 모두 참석 + 예정 1세션 → 아직 4회 진행 전이라 0
    expect(
      activityOf(me, {
        ...empty,
        activities: [
          session("st1", 1, ["m1"]),
          session("st1", 2, ["m1"]),
          session("st1", 3, ["m1"]),
          future(4, ["m1"]),
        ],
      }).records,
    ).toBe(0);
    // 시작한 4세션 중 2 참석(과반 아님) + 예정 세션 출석 명단 → 0
    expect(
      activityOf(me, {
        ...empty,
        activities: [
          session("st1", 1, ["m1"]),
          session("st1", 2, ["m1"]),
          session("st1", 3, ["m9"]),
          session("st1", 4, ["m9"]),
          future(5, ["m1"]),
        ],
      }).records,
    ).toBe(0);
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

    const result = activityOf(new Set(["m1", "L1"]), data);

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
    const result = activityOf(me, {
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
        upcoming: false,
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
  type Row = Parameters<typeof selectPromotionCandidates>[0]["members"][number];
  const pick = (
    members: Row[],
    registrations: { memberId: string; term: string }[],
    activities: Act[],
  ) =>
    selectPromotionCandidates({
      members,
      registrations,
      term: TERM,
      data: { ...empty, activities },
      now: NOW,
    });
  const row = (id: string, status: string, over: Partial<Row> = {}): Row => ({
    id,
    legacyMemberId: null,
    status,
    isAlumni: false,
    alumniRevoked: false,
    ...over,
  });
  const assoc = (id: string, legacyMemberId: string | null = null) =>
    row(id, "associate", { legacyMemberId });

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
          row("m1", "regular"),
          row("m2", "withdrawn"),
          row("m3", "regular", { isAlumni: true }),
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

  it("does not count activities that have not started (D-000090)", () => {
    const acts = [
      ...dinners(2, ["m1"]),
      activity("later", "회식", FUTURE, ["m1"]),
    ];
    expect(pick([assoc("m1")], [{ memberId: "m1", term: TERM }], acts)).toEqual(
      [],
    );
  });

  it("picks a registered isAlumni associate with 1 record (제5조 ②, D-000092)", () => {
    expect(
      pick(
        [row("m1", "associate", { isAlumni: true })],
        [{ memberId: "m1", term: TERM }],
        dinners(1, ["m1"]),
      ),
    ).toEqual(["m1"]);
  });

  it("leaves a registered associate whose alumni standing was revoked, at 1 record", () => {
    expect(
      pick(
        [row("m1", "associate", { isAlumni: true, alumniRevoked: true })],
        [{ memberId: "m1", term: TERM }],
        dinners(1, ["m1"]),
      ),
    ).toEqual([]);
  });

  it("leaves an unregistered isAlumni associate", () => {
    expect(
      pick(
        [row("m1", "associate", { isAlumni: true })],
        [{ memberId: "m1", term: "26-1" }],
        dinners(1, ["m1"]),
      ),
    ).toEqual([]);
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
      alumniRevoked: false,
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

  it("makes a registered isAlumni member regular with 1 record — 제5조 ② (D-000092)", () => {
    expect(standing({ isAlumni: true, records: 1 })).toBe("regular");
    expect(standing({ isAlumni: true, records: 0 })).toBe("regular");
  });

  it("does not let a revoked alumni flag make a registered member regular", () => {
    expect(standing({ isAlumni: true, alumniRevoked: true, records: 1 })).toBe(
      "associate",
    );
    // 기록 기준은 박탈과 무관하다 (제4조 ②)
    expect(standing({ alumniRevoked: true, records: 3 })).toBe("regular");
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

  it("never makes an unregistered revoked person alumni (D-000091)", () => {
    expect(
      standing({ registeredThisTerm: false, alumniRevoked: true, records: 3 }),
    ).toBe("former");
    expect(
      standing({
        registeredThisTerm: false,
        isAlumni: true,
        alumniRevoked: true,
        records: 5,
      }),
    ).toBe("former");
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
