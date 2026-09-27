import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

const sentMail = vi.hoisted(() => [] as string[]);
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async (event: string) => {
    sentMail.push(event);
    return true;
  },
}));

/**
 * 공개와 취소가 겹칠 때.
 *
 * 예전 `publishSeminar`는 상태 전이를 확정한 뒤 활동·이벤트를 따로 만들었고,
 * 그 사이에 취소가 끼어들면 "취소된 세미나에 살아 있는 출석 링크"가 남았다.
 * 이제 공개와 취소는 각각 한 트랜잭션(flow_publish_seminar /
 * flow_cancel_seminar)이라 둘 중 하나가 먼저 **통째로** 커밋된다. 남은
 * 순서는 둘뿐이고, 여기서 둘 다 확인한다.
 */
import { __reset } from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { toKstIso } from "$lib/server/core/time";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import { cancelSeminar, publishSeminar, scheduleSeminar } from "./seminars";
import { getMemberVisibleEvents, hiddenActivityIds } from "./visibility";
import { getPublicActivities } from "$lib/server/public/archive";

const HOUR = 60 * 60 * 1000;
const ADMIN = { memberId: "admin-1", isAdmin: true };

async function scheduledSeminar() {
  const request = await submitSeminarRequest({
    title: "경합 세미나",
    description: "설명",
    prerequisites: "",
    duration: "60",
    preferredTiming: "",
    presenterIds: [newId()],
    attachment: "",
    requesterId: newId(),
  });
  await approveSeminar(request.id);
  const [seminar] = await getTable("seminars");
  await scheduleSeminar(seminar.id, {
    startsAt: toKstIso(new Date(Date.now() + 10 * 24 * HOUR)),
    startTime: null,
    endsAt: null,
    location: "27동",
  });
  return seminar.id;
}

// Rows the SQL flows wrote must decode exactly as TS-written ones.
afterEach(expectTablesValid);

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  sentMail.length = 0;
  for (const t of ["seminars", "seminar-requests", "events", "activities"])
    await invalidateCache(`table_${t}`);
});

const isConflict = (e: unknown) =>
  e instanceof AppError && e.code === "CONFLICT";

describe("취소가 먼저 커밋되면", () => {
  it("공개는 CONFLICT — 활동·이벤트도, 공지도 없다", async () => {
    const id = await scheduledSeminar();
    await cancelSeminar(id, ADMIN);

    await expect(publishSeminar(id)).rejects.toSatisfy(isConflict);

    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
    expect(await getTable("events")).toEqual([]);
    expect(await getTable("activities")).toEqual([]);
    expect(sentMail).not.toContain("seminar.published");
  });
});

describe("공개가 먼저 커밋되면", () => {
  it("취소가 방금 만들어진 출석 이벤트까지 덮는다", async () => {
    const id = await scheduledSeminar();
    await publishSeminar(id);
    await cancelSeminar(id, ADMIN);

    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
    const events = await getTable("events");
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("cancelled");
    // 링크를 가진 회원이 체크인할 수 있으면 취소가 취소가 아니다.
    expect(await getMemberVisibleEvents()).toEqual([]);
    // 숨김 규칙은 `seminars.activityId`를 본다 — 공개가 그 칸을 같은
    // 트랜잭션에서 채우므로 활동은 세미나와 이어진 채로 숨는다.
    expect(await getPublicActivities()).toEqual([]);
    expect([...(await hiddenActivityIds())]).toHaveLength(1);
  });
});

describe("동시에 던지면", () => {
  it("어느 쪽이 이기든 취소된 세미나에 살아 있는 것이 남지 않는다", async () => {
    const id = await scheduledSeminar();

    const [pub, can] = await Promise.allSettled([
      publishSeminar(id),
      cancelSeminar(id, ADMIN),
    ]);

    expect(can.status).toBe("fulfilled");
    if (pub.status === "rejected") expect(isConflict(pub.reason)).toBe(true);
    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
    expect(
      (await getTable("events")).filter((e) => e.status !== "cancelled"),
    ).toEqual([]);
    expect(await getMemberVisibleEvents()).toEqual([]);
    expect(await getPublicActivities()).toEqual([]);
  });
});
