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
import { _resetDataLayerForTests, getTable } from "./tables";
import { invalidateCache } from "$lib/server/cache";
import { createSeminar } from "$lib/server/services/records-admin";
import { SEMINAR_VIDEO_LIMITS } from "$lib/domain/seminar-videos";
import { SEMINAR_DURATION_MINUTES } from "$lib/domain/seminars";
import {
  LIMITS,
  candidatesFrom,
  currentSql,
  matchSeminars,
  patchIssue,
  patchSql,
} from "../../../../scripts/ops/lib-notion-body.mjs";

/**
 * scripts/ops/ops-notion-backfill-body.mjs — 노션 세미나 페이지 **본문**에만 있던
 * 영상 링크·선수지식·소요시간을 후보로 뽑아 운영자가 하나씩 채택한다
 * (snumps-webpage/D-000007, D-000011). 9/30 본문 스캔 실측: YouTube 링크 6쪽
 * 13개, `선수지식: 값` 2쪽·문장 속 2쪽, 소요시간은 문장 속 2쪽.
 */

const block = (text: string, links: { href: string; text: string }[] = []) => ({
  type: "paragraph",
  text,
  links,
});

describe("limits mirror the app's rules", () => {
  it("uses the same video and duration bounds as the domain", () => {
    expect(LIMITS.video).toEqual(SEMINAR_VIDEO_LIMITS);
    expect(LIMITS.duration).toEqual(SEMINAR_DURATION_MINUTES);
  });
});

describe("candidatesFrom", () => {
  it("collects YouTube links from text and from link marks, once each", () => {
    const c = candidatesFrom([
      block("녹화: https://www.youtube.com/watch?v=abc."),
      block("1부 녹화", [{ href: "https://youtu.be/xyz", text: "1부 녹화" }]),
      block("다시 https://www.youtube.com/watch?v=abc"),
      block("자료", [{ href: "https://example.com/a.pdf", text: "자료" }]),
    ]);
    expect(c.videos).toEqual([
      { url: "https://www.youtube.com/watch?v=abc", title: "" },
      { url: "https://youtu.be/xyz", title: "1부 녹화" },
    ]);
  });

  it("takes the title from the link text only when it is not the URL itself", () => {
    const url = "https://youtu.be/xyz";
    expect(
      candidatesFrom([block(url, [{ href: url, text: url }])]).videos,
    ).toEqual([{ url, title: "" }]);
  });

  it("reads '선수지식: 값' as a value and a mention inside a sentence as that sentence", () => {
    const c = candidatesFrom([
      block("선수 지식: 선형대수, 군론 기초"),
      block("이 세미나는 선수지식으로 미적분 정도만 있으면 충분합니다."),
    ]);
    expect(c.prerequisites).toEqual([
      { value: "선형대수, 군론 기초", kind: "label" },
      {
        value: "이 세미나는 선수지식으로 미적분 정도만 있으면 충분합니다.",
        kind: "sentence",
      },
    ]);
  });

  it.each([
    ["소요시간: 90분", 90, "label"],
    ["소요 시간은 약 1시간 30분입니다.", 90, "sentence"],
    ["소요시간 2시간", 120, "sentence"],
    ["소요시간은 미정입니다.", null, "sentence"],
    ["소요시간: 5분", null, "label"], // below the app's range
  ])("duration %j → %s minutes (%s)", (text, minutes, kind) => {
    const [d] = candidatesFrom([block(text)]).duration;
    expect(d).toEqual({ minutes, text, kind });
  });

  it("finds nothing in an unrelated page", () => {
    expect(
      candidatesFrom([block("개요"), block("군론의 기초를 다룬다.")]),
    ).toEqual({
      videos: [],
      prerequisites: [],
      duration: [],
    });
  });
});

describe("matchSeminars", () => {
  it("pairs by trimmed title + semester and reports duplicates and misses", () => {
    const result = matchSeminars(
      [
        { id: "n1", title: "군론 ", semester: "25-1" },
        { id: "n2", title: "측도론", semester: "25-2" },
        { id: "n3", title: "같은 제목", semester: "25-2" },
        { id: "n4", title: "같은 제목", semester: "25-2" },
      ],
      [
        { id: "s1", title: "군론", semester: "25-1" },
        { id: "s3", title: "같은 제목", semester: "25-2" },
      ],
    );
    expect(result.pairs).toEqual([{ notionId: "n1", seminarId: "s1" }]);
    expect(result.unmatched).toEqual([
      { title: "측도론", semester: "25-2", reason: "앱에 같은 제목·학기 없음" },
      {
        title: "같은 제목",
        semester: "25-2",
        reason: "노션에 같은 제목·학기 2개",
      },
    ]);
  });
});

describe("currentSql / patchSql", () => {
  beforeEach(async () => {
    await __reset();
    _resetDataLayerForTests({ backoffBaseMs: 1 });
    for (const t of ["seminars", "activities", "events"])
      await invalidateCache(`table_${t}`);
  });
  afterEach(expectTablesValid);

  it("reads the fields that decide what is still empty, then fills them", async () => {
    const s = await createSeminar({
      title: "군론",
      semester: "25-1",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    const [row] = await __sql<Record<string, unknown>>(currentSql());
    expect(row).toEqual({
      id: s.id,
      title: "군론",
      semester: "25-1",
      videos: [],
      prerequisites: "",
      duration_minutes: null,
    });

    await __sql(
      patchSql(s.id, {
        videos: [{ url: "https://youtu.be/xyz", title: "녹화" }],
        prerequisites: "선형대수",
        durationMinutes: 90,
      }),
    );
    await invalidateCache("table_seminars");
    const [stored] = await getTable("seminars");
    expect(stored).toMatchObject({
      videos: [{ url: "https://youtu.be/xyz", title: "녹화" }],
      prerequisites: "선형대수",
      durationMinutes: 90,
      title: "군론",
    });
  });
});

describe("patchIssue", () => {
  it("passes a patch within the app's rules", () => {
    expect(
      patchIssue({
        videos: [{ url: "https://youtu.be/xyz", title: "녹화" }],
        prerequisites: "선형대수",
        durationMinutes: 90,
      }),
    ).toBeNull();
  });

  it.each([
    ["http link", { videos: [{ url: "http://youtu.be/xyz", title: "" }] }],
    ["blank prerequisites", { prerequisites: "  " }],
    ["minutes out of range", { durationMinutes: 5 }],
    ["fractional minutes", { durationMinutes: 90.5 }],
  ])("refuses %s", (_label, patch) => {
    expect(patchIssue(patch)).not.toBeNull();
  });
});
