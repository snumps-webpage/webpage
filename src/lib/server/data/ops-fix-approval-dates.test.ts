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
import { invalidateCache } from "$lib/server/cache";
import { toKstIso } from "$lib/server/core/time";
import {
  approveSeminar,
  submitSeminarRequest,
} from "$lib/server/services/seminar-requests";
import { publishSeminar, scheduleSeminar } from "$lib/server/services/seminars";
import { createSeminar } from "$lib/server/services/records-admin";
import {
  applySql,
  resultSql,
  scheduleFrom,
  targetsSql,
} from "../../../../scripts/ops/lib-fix-approval-dates.mjs";

/**
 * scripts/ops/ops-fix-approval-dates.mjs — 승인을 누른 시각이 일정으로 박힌
 * 신청 경유 세미나(9/15 수정 전 코드가 남긴 것)를 운영자가 입력한 실제 일시로
 * 고친다(snumps-webpage/D-000012). 같은 마이그레이션을 쓰는 PGlite에서
 * 검출 SQL과 적용 SQL을 돌린다. 메일은 서비스 계층만 보내므로 SQL 흐름을
 * 직접 부르는 적용은 메일을 보내지 않는다.
 */

const HOUR = 60 * 60 * 1000;
const at = (h: number) => toKstIso(new Date(Date.now() + h * HOUR));

async function requestBorn(title: string) {
  const req = await submitSeminarRequest({
    title,
    description: "",
    prerequisites: "",
    duration: "60분",
    preferredTiming: "",
    presenterIds: ["m-a"],
    attachment: "",
    requesterId: "m-a",
  });
  await approveSeminar(req.id);
  return (await getTable("seminars")).find((s) => s.title === title)!;
}

/** 옛 승인 코드가 남긴 모양: 공개됨, 일정 없음, 활동·이벤트는 승인 시각. */
async function oldBugSeminar(title: string, stampedAt: string) {
  const s = await requestBorn(title);
  await scheduleSeminar(s.id, {
    startsAt: stampedAt,
    startTime: stampedAt.slice(11, 16),
    endsAt: null,
    location: "임시",
  });
  await publishSeminar(s.id);
  await mutate("seminars", (rows) =>
    rows.map((r) => (r.id === s.id ? { ...r, schedule: null } : r)),
  );
  return s.id;
}

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "activities", "events"])
    await invalidateCache(`table_${t}`);
});
afterEach(expectTablesValid);

describe("targetsSql", () => {
  it("finds only request-born, published seminars with no schedule whose activity and event share the stamped time", async () => {
    const stamped = at(-24 * 30);
    const target = await oldBugSeminar("옛 승인", stamped);

    // controls
    const fine = await requestBorn("정상 공개");
    await scheduleSeminar(fine.id, {
      startsAt: at(24),
      startTime: at(24).slice(11, 16),
      endsAt: null,
      location: "27동",
    });
    await publishSeminar(fine.id);
    await requestBorn("일정 미정");
    await createSeminar({
      title: "이주 기록",
      semester: "24-1",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });

    const rows = await __sql<Record<string, unknown>>(targetsSql());
    expect(rows).toEqual([
      { id: target, title: "옛 승인", wrong_start: stamped },
    ]);
  });
});

describe("scheduleFrom", () => {
  it("builds a KST schedule from the operator's input", () => {
    expect(
      scheduleFrom({
        date: "2026-09-20",
        start: "19:00",
        end: "21:00",
        location: "27동 325호",
      }),
    ).toEqual({
      ok: true,
      schedule: {
        startsAt: "2026-09-20T19:00:00+09:00",
        startTime: "19:00",
        endsAt: "2026-09-20T21:00:00+09:00",
        location: "27동 325호",
      },
    });
  });

  it("keeps the time unknown when the start is blank (the end is dropped)", () => {
    expect(
      scheduleFrom({
        date: "2026-09-20",
        start: "",
        end: "21:00",
        location: "27동",
      }),
    ).toEqual({
      ok: true,
      schedule: {
        startsAt: "2026-09-20T00:00:00+09:00",
        startTime: null,
        endsAt: null,
        location: "27동",
      },
    });
  });

  it.each([
    ["no such day", { date: "2026-02-30", start: "", end: "", location: "x" }],
    ["bad date", { date: "26-9-20", start: "", end: "", location: "x" }],
    [
      "bad time",
      { date: "2026-09-20", start: "25:00", end: "", location: "x" },
    ],
    [
      "end before start",
      { date: "2026-09-20", start: "19:00", end: "18:00", location: "x" },
    ],
    ["no location", { date: "2026-09-20", start: "", end: "", location: "  " }],
    [
      "long location",
      { date: "2026-09-20", start: "", end: "", location: "가".repeat(161) },
    ],
  ])("refuses %s", (_label, input) => {
    expect(scheduleFrom(input).ok).toBe(false);
  });
});

describe("applySql", () => {
  it("moves the seminar, its activity and its event to the given schedule — and nothing else", async () => {
    const stamped = at(-24 * 30);
    const target = await oldBugSeminar("옛 승인", stamped);
    const other = await oldBugSeminar("다른 옛 승인", at(-24 * 29));
    const before = {
      activities: await getTable("activities"),
      events: await getTable("events"),
    };

    const built = scheduleFrom({
      date: "2026-09-20",
      start: "19:00",
      end: "21:00",
      location: "27동 325호",
    });
    if (!built.ok) throw new Error(built.issue);
    await __sql(applySql(target, built.schedule, at(0)));
    for (const t of ["seminars", "activities", "events"])
      await invalidateCache(`table_${t}`);

    const seminars = await getTable("seminars");
    const moved = seminars.find((s) => s.id === target)!;
    expect(moved.schedule).toEqual(built.schedule);
    const activity = (await getTable("activities")).find(
      (a) => a.id === moved.activityId,
    )!;
    expect(activity.date).toEqual({
      start: "2026-09-20T19:00:00+09:00",
      end: "2026-09-20T21:00:00+09:00",
    });
    const event = (await getTable("events")).find(
      (e) => e.activityId === moved.activityId,
    )!;
    expect(event.date).toEqual(activity.date);

    // the other old row is untouched
    const untouched = seminars.find((s) => s.id === other)!;
    expect(untouched.schedule).toBeNull();
    const otherActivity = (await getTable("activities")).find(
      (a) => a.id === untouched.activityId,
    );
    expect(otherActivity).toEqual(
      before.activities.find((a) => a.id === untouched.activityId),
    );

    // and it no longer counts as a target
    const rows = await __sql<{ id: string }>(targetsSql());
    expect(rows.map((r) => r.id)).toEqual([other]);

    // the re-read the CLI prints after applying
    const [read] = await __sql<Record<string, unknown>>(resultSql([target]));
    expect(read).toMatchObject({
      id: target,
      schedule: built.schedule,
      activity_date: activity.date,
      event_dates: [activity.date],
    });
  });
});
