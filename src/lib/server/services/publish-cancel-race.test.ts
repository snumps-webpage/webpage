import { beforeEach, describe, expect, it, vi } from "vitest";

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
 * 공개와 취소가 겹치는 순간을 **결정적으로** 재현한다.
 *
 * `publishSeminar`는 상태 전이를 CAS로 확정한 뒤 활동·이벤트를 만든다. 그
 * 사이에 취소가 끼어들면 취소의 이벤트 정리는 **아직 존재하지 않는** 이벤트를
 * 훑고 지나가고, 공개는 그 뒤에 `active` 이벤트를 만든다. 결과는 "취소된
 * 세미나에 살아 있는 출석 링크" — 링크를 가진 사람은 그대로 체크인할 수 있다.
 *
 * Promise.all로 두 호출을 던지면 이 창이 열리는 것은 운이다. 그래서 활동 생성
 * 직전에 훅을 걸어 창을 직접 연다.
 */
const hook = vi.hoisted(() => ({ fn: null as null | (() => Promise<void>) }));
vi.mock("$lib/server/data/idempotency", async () => {
  const actual = await vi.importActual<
    typeof import("$lib/server/data/idempotency")
  >("$lib/server/data/idempotency");
  return {
    ...actual,
    ensureCreated: async (...args: Parameters<typeof actual.ensureCreated>) => {
      const pending = hook.fn;
      hook.fn = null;
      if (pending) await pending();
      return actual.ensureCreated(...args);
    },
  };
});

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
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
    endsAt: null,
    location: "27동",
  });
  return seminar.id;
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  sentMail.length = 0;
  hook.fn = null;
  for (const t of ["seminars", "seminar-requests", "events", "activities"])
    await invalidateCache(`table_${t}`);
});

describe("공개 중 취소가 끼어들 때", () => {
  it("취소된 세미나에 살아 있는 출석 이벤트를 남기지 않는다", async () => {
    const id = await scheduledSeminar();
    hook.fn = async () => {
      await cancelSeminar(id, ADMIN);
    };

    await publishSeminar(id);

    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
    const events = await getTable("events");
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("cancelled");
  });

  // 링크를 가진 회원이 체크인할 수 있으면 취소가 취소가 아니다.
  it("회원에게 보이는 이벤트 목록에도 남지 않는다", async () => {
    const id = await scheduledSeminar();
    hook.fn = async () => {
      await cancelSeminar(id, ADMIN);
    };

    await publishSeminar(id);

    expect(await getMemberVisibleEvents()).toEqual([]);
  });

  // 이벤트만 덮는 것으로는 부족하다. 숨김 규칙은 전부 `seminars.activityId`를
  // 보는데, 그 칸을 채우는 것이 공개의 **마지막** 단계다 — 취소가 그 앞에
  // 끼어들면 활동은 만들어졌는데 아무도 그것을 세미나와 잇지 못한다.
  it("만들어진 활동이 공개 달력에 남지 않는다", async () => {
    const id = await scheduledSeminar();
    hook.fn = async () => {
      await cancelSeminar(id, ADMIN);
    };

    await publishSeminar(id);

    expect(await getPublicActivities()).toEqual([]);
    expect([...(await hiddenActivityIds())]).toHaveLength(1);
  });

  it("취소된 세미나의 공개 공지는 나가지 않는다", async () => {
    const id = await scheduledSeminar();
    hook.fn = async () => {
      await cancelSeminar(id, ADMIN);
    };

    await publishSeminar(id);

    expect(sentMail).not.toContain("seminar.published");
  });
});
