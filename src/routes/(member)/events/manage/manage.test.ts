import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async () => true,
}));

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { toKstIso } from "$lib/server/core/time";
import {
  approveSeminar,
  submitSeminarRequest,
} from "$lib/server/services/seminar-requests";
import { publishSeminar, scheduleSeminar } from "$lib/server/services/seminars";
import { actions, load } from "./+page.server";

/**
 * 개설자의 취소 (결정 6). 이 페이지가 쥔 것은 **이벤트 id**이고 취소는
 * **세미나 id**로 한다 — 그 다리가 없으면 버튼은 그릴 수 있어도 동작하지 않는다.
 * 그리고 규칙("열리기 전까지만")은 서버가 강제하되, 화면도 같은 판정을 보여야
 * 누르면 거절당하는 버튼이 남지 않는다.
 */

const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => toKstIso(new Date(Date.now() + offsetMs));

async function publishedSeminar(startOffsetMs: number) {
  const presenterId = newId();
  const request = await submitSeminarRequest({
    title: "개설자 취소 테스트",
    description: "설명",
    prerequisites: "",
    duration: "60",
    preferredTiming: "",
    presenterIds: [presenterId],
    attachment: "",
    requesterId: presenterId,
  });
  await approveSeminar(request.id);
  const [seminar] = await getTable("seminars");
  await scheduleSeminar(seminar.id, {
    startsAt: at(startOffsetMs),
    startTime: null,
    endsAt: null,
    location: "27동",
  });
  await publishSeminar(seminar.id);
  return { seminarId: seminar.id, presenterId };
}

const asMember = (memberId: string) =>
  ({
    member: { memberId, isAdmin: false, status: "active" },
    auth: async () => ({ user: { email: "m@snu.ac.kr", name: "발표자" } }),
  }) as never;

const loadFor = (memberId: string) =>
  load({ locals: asMember(memberId) } as never) as Promise<{
    managedSeminars: {
      id: string;
      seminarId: string | null;
      canCancel: boolean;
    }[];
  }>;

const post = (memberId: string, fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return {
    request: { formData: async () => data },
    locals: asMember(memberId),
  } as never;
};

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "events", "activities"])
    await invalidateCache(`table_${t}`);
});

describe("발표자 관리 화면 — 취소 가능 여부", () => {
  it("아직 열리지 않은 세미나에는 취소할 세미나 id가 실린다", async () => {
    const { seminarId, presenterId } = await publishedSeminar(10 * 24 * HOUR);

    const { managedSeminars } = await loadFor(presenterId);

    expect(managedSeminars).toHaveLength(1);
    expect(managedSeminars[0].seminarId).toBe(seminarId);
    expect(managedSeminars[0].canCancel).toBe(true);
  });

  // 서버가 거절할 버튼을 그리면 개설자는 "왜 안 되지"만 얻는다.
  it("이미 시작된 세미나는 취소할 수 없다고 알려준다", async () => {
    const { presenterId } = await publishedSeminar(-2 * HOUR);

    const { managedSeminars } = await loadFor(presenterId);

    expect(managedSeminars[0].canCancel).toBe(false);
  });
});

describe("?/cancelSeminar — 개설자", () => {
  it("열리기 전이면 본인 세미나를 취소한다", async () => {
    const { seminarId, presenterId } = await publishedSeminar(10 * 24 * HOUR);

    const result = (await actions.cancelSeminar(
      post(presenterId, { seminarId }),
    )) as { operation?: string };

    expect(result.operation).toBe("seminarCancelled");
    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
    expect((await getTable("events"))[0].status).toBe("cancelled");
  });

  it("이미 열린 세미나는 거절한다 — 출석 기록이 조용히 사라지지 않는다", async () => {
    const { seminarId, presenterId } = await publishedSeminar(-2 * HOUR);

    const result = (await actions.cancelSeminar(
      post(presenterId, { seminarId }),
    )) as { status?: number };

    expect(result.status).toBe(403);
    expect((await getTable("seminars"))[0].publicationStatus).toBe("published");
  });

  it("남의 세미나는 취소할 수 없다", async () => {
    const { seminarId } = await publishedSeminar(10 * 24 * HOUR);

    const result = (await actions.cancelSeminar(
      post(newId(), { seminarId }),
    )) as { status?: number };

    expect(result.status).toBe(403);
    expect((await getTable("seminars"))[0].publicationStatus).toBe("published");
  });

  // 취소된 세미나는 개설자 자신의 화면에서도 사라진다 (결정 6).
  it("취소한 세미나는 본인 관리 목록에서도 사라진다", async () => {
    const { seminarId, presenterId } = await publishedSeminar(10 * 24 * HOUR);
    await actions.cancelSeminar(post(presenterId, { seminarId }));

    expect((await loadFor(presenterId)).managedSeminars).toEqual([]);
  });
});

/**
 * 두 액션 모두 폼의 id를 그대로 서비스에 넘겼다 — 빈 eventId는 NOT_FOUND로,
 * 빈 seminarId는 손으로 쓴 검사로 걸렸다. 이제 managedEventIdSchema가
 * 하나의 규칙이고, 잘못된 id는 400 VALIDATION_FAILED로 아무것도 쓰지 않는다.
 */
describe("id 검증 — managedEventIdSchema", () => {
  it("?/saveAttendance는 올바른 eventId로 저장한다", async () => {
    const { presenterId } = await publishedSeminar(10 * 24 * HOUR);
    const [event] = await getTable("events");

    const result = await actions.saveAttendance(
      post(presenterId, { eventId: ` ${event.id} ` }),
    );

    expect(result).toMatchObject({
      success: true,
      operation: "presenterAttendanceSaved",
      eventId: event.id,
    });
  });

  it.each([
    ["빈", ""],
    ["공백뿐인", "   "],
    ["너무 긴", "e".repeat(201)],
  ])(
    "?/saveAttendance는 %s eventId를 400으로 거절한다",
    async (_label, eventId) => {
      const { presenterId } = await publishedSeminar(10 * 24 * HOUR);
      const before = await getTable("activities");

      const result = await actions.saveAttendance(
        post(presenterId, { eventId }),
      );

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { eventId: expect.any(String) },
        },
      });
      expect(await getTable("activities")).toEqual(before);
    },
  );

  it.each([
    ["빈", ""],
    ["너무 긴", "s".repeat(201)],
  ])(
    "?/cancelSeminar는 %s seminarId를 400으로 거절한다",
    async (_label, seminarId) => {
      const { presenterId } = await publishedSeminar(10 * 24 * HOUR);

      const result = await actions.cancelSeminar(
        post(presenterId, { seminarId }),
      );

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { seminarId: expect.any(String) },
        },
      });
      expect((await getTable("seminars"))[0].publicationStatus).toBe(
        "published",
      );
    },
  );
});
