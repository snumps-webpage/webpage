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
import {
  approveSeminar,
  submitSeminarRequest,
} from "$lib/server/services/seminar-requests";
import { actions } from "./+page.server";

/**
 * 액션 계층에는 테스트가 하나도 없었고, 그래서 검증 실패가 `success: true`로
 * 나가는 결함이 살아 있었다 — `runAction`은 `status >= 400`인 객체만 실패로
 * 통과시키는데 도메인 검증기의 실패 객체에는 `status`가 없다. 다이얼로그는
 * 저장된 것처럼 닫히고 오류 문구는 화면에 도달하지 못했다.
 */

const HOUR = 60 * 60 * 1000;
const admin = {
  member: { memberId: "a1", isAdmin: true, status: "active" },
  auth: async () => ({ user: { email: "admin@snu.ac.kr" } }),
};

const post = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return {
    request: { formData: async () => data },
    locals: admin,
  } as never;
};

const localInput = (ms: number) => {
  const d = new Date(Date.now() + ms + 9 * HOUR);
  return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm" (KST 입력 형식)
};

async function approvedSeminarId() {
  const request = await submitSeminarRequest({
    title: "액션 테스트 세미나",
    description: "설명",
    prerequisites: "",
    duration: "60",
    preferredTiming: "",
    presenterIds: [newId()],
    attachment: "",
    requesterId: newId(),
  });
  await approveSeminar(request.id);
  return (await getTable("seminars"))[0].id;
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "events", "activities"])
    await invalidateCache(`table_${t}`);
});

describe("?/scheduleSeminar", () => {
  it("일정을 저장하고 scheduled로 옮긴다", async () => {
    const seminarId = await approvedSeminarId();

    const result = await actions.scheduleSeminar(
      post({
        seminarId,
        startsAtLocal: localInput(20 * 24 * HOUR),
        endsAtLocal: localInput(20 * 24 * HOUR + 2 * HOUR),
        location: "27동 325호",
      }),
    );

    expect(result).toMatchObject({ success: true, operation: "scheduled" });
    const [seminar] = await getTable("seminars");
    expect(seminar.publicationStatus).toBe("scheduled");
    expect(seminar.schedule?.location).toBe("27동 325호");
  });

  it("장소가 비면 저장하지 않고 실패로 응답한다", async () => {
    const seminarId = await approvedSeminarId();

    const result = (await actions.scheduleSeminar(
      post({
        seminarId,
        startsAtLocal: localInput(20 * 24 * HOUR),
        endsAtLocal: "",
        location: "",
      }),
    )) as { status?: number; data?: { issues?: Record<string, string> } };

    // 성공으로 포장되면 다이얼로그가 저장된 것처럼 닫힌다.
    expect(result.status).toBe(400);
    expect(result.data?.issues?.location).toBeTruthy();
    expect((await getTable("seminars"))[0].publicationStatus).toBe(
      "unscheduled",
    );
  });

  it("종료가 시작보다 이르면 거절한다", async () => {
    const seminarId = await approvedSeminarId();

    const result = (await actions.scheduleSeminar(
      post({
        seminarId,
        startsAtLocal: localInput(20 * 24 * HOUR),
        endsAtLocal: localInput(20 * 24 * HOUR - HOUR),
        location: "27동",
      }),
    )) as { status?: number };

    expect(result.status).toBe(400);
  });
});

describe("?/publishSeminar · ?/cancelSeminar", () => {
  async function scheduled() {
    const seminarId = await approvedSeminarId();
    await actions.scheduleSeminar(
      post({
        seminarId,
        startsAtLocal: localInput(20 * 24 * HOUR),
        endsAtLocal: "",
        location: "27동",
      }),
    );
    return seminarId;
  }

  it("공개하면 활동·이벤트가 생기고 결과에 id가 실린다", async () => {
    const seminarId = await scheduled();

    const result = (await actions.publishSeminar(post({ seminarId }))) as {
      operation?: string;
      activityId?: string;
      mailFailed?: boolean;
    };

    expect(result.operation).toBe("published");
    expect(result.activityId).toBeTruthy();
    expect(result.mailFailed).toBe(false);
    expect((await getTable("events"))[0].status).toBe("active");
  });

  it("취소하면 세미나와 이벤트가 취소된다", async () => {
    const seminarId = await scheduled();
    await actions.publishSeminar(post({ seminarId }));

    const result = (await actions.cancelSeminar(post({ seminarId }))) as {
      operation?: string;
    };

    expect(result.operation).toBe("cancelled");
    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
    expect((await getTable("events"))[0].status).toBe("cancelled");
  });

  it("세미나 id가 없으면 검증 실패다", async () => {
    await expect(actions.publishSeminar(post({}))).resolves.toMatchObject({
      status: 400,
    });
  });
});
