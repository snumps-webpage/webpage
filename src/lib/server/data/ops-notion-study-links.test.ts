import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async () => true,
}));

import { __reset, __sql } from "./store-memory";
import { expectTablesValid } from "./expect-tables-valid";
import { _resetDataLayerForTests, getTable, mutate } from "./tables";
import type { Study } from "./schemas";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { createActivity } from "$lib/server/services/records-admin";
import {
  appRowsFrom,
  currentSql,
  linkSql,
  matchStudyLinks,
} from "../../../../scripts/ops/lib-notion-study-links.mjs";

/**
 * scripts/ops/ops-notion-backfill-study-links.mjs — 노션 스터디 DB의 `활동 기록`
 * relation으로 앱 활동의 빈 `studyId`를 채운다(snumps-webpage/D-000045, D-000050).
 * 스터디는 제목+학기, 활동은 제목+시작일로 양쪽 모두 하나일 때만 짝짓는다.
 * 10/14 읽기 전용 조회: 노션 스터디 17건, 각각 relation 1개, 17/17 유일 일치.
 */

const nStudy = (
  id: string,
  title: string,
  semester: string,
  activityIds: string[],
) => ({ id, title, semester, activityIds, relationTruncated: false });
const nActivity = (id: string, title: string, start: string | null) => ({
  id,
  title,
  start,
  type: "스터디",
});
const aStudy = (id: string, title: string, semester: string) => ({
  id,
  title,
  semester,
});
const aActivity = (
  id: string,
  title: string,
  start: string | null,
  extra: { type?: string; studyId?: string | null } = {},
) => ({ id, title, start, type: "스터디", studyId: null, ...extra });

describe("matchStudyLinks", () => {
  it("pairs a study and its activity when both keys are unique on both sides", () => {
    const study = nStudy("ns1", " 해석학 ", "25-1", ["na1"]);
    const act = nActivity("na1", "해석학 1회 ", "2025-03-05");
    const result = matchStudyLinks(
      [study],
      [act],
      [aStudy("s1", "해석학", "25-1"), aStudy("s2", "해석학", "25-2")],
      [
        aActivity("a1", "해석학 1회", "2025-03-05T19:00:00+09:00"),
        aActivity("a2", "해석학 1회", "2025-03-12T19:00:00+09:00"),
      ],
    );
    expect(result).toEqual({
      pairs: [
        {
          studyId: "s1",
          activityId: "a1",
          notionStudy: study,
          notionActivity: act,
        },
      ],
      unmatched: [],
    });
  });

  it("reports duplicate keys on either side instead of guessing", () => {
    const result = matchStudyLinks(
      [
        nStudy("ns1", "같은 스터디", "25-1", ["na1"]),
        nStudy("ns2", "같은 스터디", "25-1", ["na2"]),
        nStudy("ns3", "앱 중복", "25-1", ["na3"]),
        nStudy("ns4", "활동 중복", "25-2", ["na4"]),
        nStudy("ns5", "노션 활동 중복", "25-2", ["na5"]),
      ],
      [
        nActivity("na1", "a", "2025-03-01"),
        nActivity("na2", "b", "2025-03-02"),
        nActivity("na3", "c", "2025-03-03"),
        nActivity("na4", "d", "2025-03-04"),
        nActivity("na5", "e", "2025-03-05"),
        nActivity("na6", "e", "2025-03-05T10:00:00.000+09:00"),
      ],
      [
        aStudy("s1", "같은 스터디", "25-1"),
        aStudy("s3", "앱 중복", "25-1"),
        aStudy("s3b", "앱 중복", "25-1"),
        aStudy("s4", "활동 중복", "25-2"),
        aStudy("s5", "노션 활동 중복", "25-2"),
      ],
      [
        aActivity("a4", "d", "2025-03-04T19:00:00+09:00"),
        aActivity("a4b", "d", "2025-03-04T21:00:00+09:00"),
        aActivity("a5", "e", "2025-03-05T19:00:00+09:00"),
      ],
    );
    expect(result.pairs).toEqual([]);
    expect(result.unmatched).toEqual([
      { title: "같은 스터디", reason: "노션에 같은 분야명·학기(25-1) 2개" },
      { title: "앱 중복", reason: "앱에 같은 제목·학기(25-1) 2개" },
      {
        title: "활동 중복",
        reason: "앱에 같은 제목·시작일 활동 2개: 「d」 2025-03-04",
      },
      {
        title: "노션 활동 중복",
        reason: "노션에 같은 활동명·일정 2개: 「e」 2025-03-05",
      },
    ]);
  });

  it("reports what is missing on either side", () => {
    const result = matchStudyLinks(
      [
        nStudy("ns1", "앱에 없음", "25-1", ["na1"]),
        nStudy("ns2", "활동 없음", "25-1", ["na2"]),
        nStudy("ns3", "relation 없음", "25-1", []),
        nStudy("ns4", "노션 활동 못 찾음", "25-1", ["gone"]),
        nStudy("ns5", "일정 없음", "25-1", ["na5"]),
        {
          ...nStudy("ns6", "relation 잘림", "25-1", ["na6"]),
          relationTruncated: true,
        },
      ],
      [
        nActivity("na1", "a", "2025-03-01"),
        nActivity("na2", "b", "2025-03-02"),
        nActivity("na5", "c", null),
        nActivity("na6", "d", "2025-03-04"),
      ],
      [
        aStudy("s2", "활동 없음", "25-1"),
        aStudy("s3", "relation 없음", "25-1"),
        aStudy("s4", "노션 활동 못 찾음", "25-1"),
        aStudy("s5", "일정 없음", "25-1"),
        aStudy("s6", "relation 잘림", "25-1"),
      ],
      [
        aActivity("a2", "b", "2025-03-03T19:00:00+09:00"), // another day
        aActivity("a6", "d", "2025-03-04T19:00:00+09:00"),
      ],
    );
    expect(result.pairs).toEqual([]);
    expect(result.unmatched).toEqual([
      { title: "앱에 없음", reason: "앱에 같은 제목·학기(25-1) 없음" },
      {
        title: "활동 없음",
        reason: "앱에 같은 제목·시작일 활동 없음: 「b」 2025-03-02",
      },
      { title: "relation 없음", reason: "노션 활동 기록 relation 없음" },
      {
        title: "노션 활동 못 찾음",
        reason: "relation의 활동을 노션 활동 DB에서 찾지 못함",
      },
      { title: "일정 없음", reason: "노션 활동에 일정 없음: 「c」" },
      {
        title: "relation 잘림",
        reason: "노션 활동 기록 relation이 일부만 읽힘 — 직접 확인",
      },
    ]);
  });

  it("fills only empty links and leaves non-study activities alone", () => {
    const result = matchStudyLinks(
      [
        nStudy("ns1", "이미 연결", "25-1", ["na1"]),
        nStudy("ns2", "남의 연결", "25-1", ["na2"]),
        nStudy("ns3", "세미나 활동", "25-1", ["na3"]),
      ],
      [
        nActivity("na1", "a", "2025-03-01"),
        nActivity("na2", "b", "2025-03-02"),
        nActivity("na3", "c", "2025-03-03"),
      ],
      [
        aStudy("s1", "이미 연결", "25-1"),
        aStudy("s2", "남의 연결", "25-1"),
        aStudy("s3", "세미나 활동", "25-1"),
      ],
      [
        aActivity("a1", "a", "2025-03-01T19:00:00+09:00", { studyId: "s1" }),
        aActivity("a2", "b", "2025-03-02T19:00:00+09:00", { studyId: "sX" }),
        aActivity("a3", "c", "2025-03-03T19:00:00+09:00", { type: "세미나" }),
      ],
    );
    expect(result.pairs).toEqual([]);
    expect(result.unmatched).toEqual([
      {
        title: "이미 연결",
        reason: "이미 이 스터디에 연결됨: 「a」 2025-03-01",
      },
      {
        title: "남의 연결",
        reason: "이미 다른 스터디에 연결됨: 「b」 2025-03-02",
      },
      {
        title: "세미나 활동",
        reason: "앱 활동 종류가 스터디가 아님(세미나): 「c」 2025-03-03",
      },
    ]);
  });

  it("refuses an app activity that two Notion studies point at", () => {
    const result = matchStudyLinks(
      [
        nStudy("ns1", "가", "25-1", ["na1"]),
        nStudy("ns2", "나", "25-1", ["na1"]),
      ],
      [nActivity("na1", "공동", "2025-03-01")],
      [aStudy("s1", "가", "25-1"), aStudy("s2", "나", "25-1")],
      [aActivity("a1", "공동", "2025-03-01T19:00:00+09:00")],
    );
    expect(result.pairs).toEqual([]);
    expect(result.unmatched).toEqual([
      {
        title: "가",
        reason: "노션 스터디 2개가 같은 앱 활동을 가리킴: 「공동」 2025-03-01",
      },
      {
        title: "나",
        reason: "노션 스터디 2개가 같은 앱 활동을 가리킴: 「공동」 2025-03-01",
      },
    ]);
  });
});

describe("currentSql / linkSql", () => {
  beforeEach(async () => {
    await __reset();
    _resetDataLayerForTests({ backoffBaseMs: 1 });
    for (const t of ["activities", "studies", "events"])
      await invalidateCache(`table_${t}`);
  });
  afterEach(expectTablesValid);

  async function seedStudy(): Promise<Study> {
    const s: Study = {
      id: newId(),
      title: "해석학",
      semester: "25-1",
      textbook: "",
      description: "",
      note: "",
      organizerIds: ["org"],
      participantIds: ["org"],
      pendingParticipantIds: [],
      pendingTransfer: null,
      schedule: [],
      transferHistory: [],
      photos: [],
      status: "finished",
      sourceRequestId: null,
    };
    await mutate("studies", (rows) => [...rows, s]);
    return s;
  }

  it("reads the app rows, then links an empty activity to its study", async () => {
    const study = await seedStudy();
    const act = await createActivity({
      title: "해석학 1회",
      date: { start: "2025-03-05T19:00:00+09:00", end: null },
      type: "스터디",
    });

    const before = appRowsFrom(
      await __sql<Record<string, unknown>>(currentSql()),
    );
    expect(before).toEqual({
      studies: [{ id: study.id, title: "해석학", semester: "25-1" }],
      activities: [
        {
          id: act.id,
          title: "해석학 1회",
          start: "2025-03-05T19:00:00+09:00",
          type: "스터디",
          studyId: null,
        },
      ],
    });

    const [{ result }] = await __sql<{ result: unknown }>(
      linkSql(act.id, study.id),
    );
    expect(result).toEqual({ touched: ["activities"] });
    await invalidateCache("table_activities");
    const [stored] = await getTable("activities");
    expect(stored).toMatchObject({ id: act.id, studyId: study.id });

    const after = appRowsFrom(
      await __sql<Record<string, unknown>>(currentSql()),
    );
    expect(after.activities[0].studyId).toBe(study.id);
  });

  it("raises NOT_FOUND for an activity that is gone", async () => {
    const study = await seedStudy();
    await expect(__sql(linkSql("gone", study.id))).rejects.toThrow(/NOT_FOUND/);
  });
});
