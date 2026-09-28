import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { nowKstIso } from "$lib/server/core/time";
import { load } from "./+page.server";

/**
 * #7 / #12 — the detail page took prerequisites and duration from the
 * seminar's request, so a seminar without one (migrated, or made in the
 * record editor) showed "기록 없음" whatever the admin had entered. The
 * seminar's own values come first; the request's free-text duration is only
 * the fallback while no minutes are recorded.
 */

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "activities", "members"])
    await invalidateCache(`table_${t}`);
  await mutate("seminars", () => [
    {
      id: "sem1",
      title: "위상수학",
      semester: "26-2",
      note: "",
      description: "개요",
      presenterIds: [],
      externalPresenters: "",
      materials: [],
      photos: [],
      posterKey: "",
      preferredTiming: "",
      publicationStatus: "published" as const,
      kind: null,
      durationMinutes: 90,
      prerequisites: "선형대수",
      announce: true,
      schedule: null,
      announcedAt: null,
      semesterPinned: false,
      activityId: null,
      sourceRequestId: "req1",
    },
  ]);
  await mutate("seminar-requests", () => [
    {
      id: "req1",
      title: "위상수학",
      description: "",
      prerequisites: "신청서의 선수지식",
      duration: "한 시간 반",
      preferredTiming: "",
      presenterIds: [],
      attachment: "",
      posterKey: "",
      requesterId: "m1",
      status: "approved" as const,
      closedAs: null,
      kind: null,
      createdAt: nowKstIso(),
    },
  ]);
});

type Detail = { seminar: { prerequisites: string; duration: string } };
const detail = async () =>
  (await load({ params: { id: "sem1" } } as never)) as unknown as Detail;

describe("seminar detail", () => {
  it("shows the seminar's own prerequisites and minutes", async () => {
    expect((await detail()).seminar).toMatchObject({
      prerequisites: "선형대수",
      duration: "90분",
    });
  });

  it("falls back to the request's duration text while no minutes are recorded", async () => {
    await mutate("seminars", (rows) =>
      rows.map((s) => ({ ...s, durationMinutes: null })),
    );
    expect((await detail()).seminar.duration).toBe("한 시간 반");
  });
});
