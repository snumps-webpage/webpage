import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { toKstIso } from "$lib/server/core/time";
import { getActivitiesOf } from "$lib/server/data/repos";
import {
  getPublicActivities,
  getPublicSeminars,
} from "$lib/server/public/archive";
import { getManagedSeminars, hasPresenterEvents } from "./events";
import { cancelSeminar, publishSeminar, scheduleSeminar } from "./seminars";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import { getMemberVisibleEvents } from "./visibility";

/**
 * 취소된 세미나는 **회원과 게스트 양쪽에서 사라지고 관리자에게만 남는다**.
 *
 * 화면에서 안 그리는 것으로는 부족하다 — SvelteKit은 서버 로드 반환값을
 * 컴포넌트가 읽든 말든 통째로 SSR HTML에 직렬화한다(감사 ZR-8). 그래서 단언은
 * "보이지 않는다"가 아니라 **"페이로드에 없다"**여야 한다.
 */

const PRESENTER = "m-presenter";
const HOUR = 60 * 60 * 1000;
const future = (ms: number) => toKstIso(new Date(Date.now() + ms));

async function cancelledSeminar() {
  const request = await submitSeminarRequest({
    title: "취소될 세미나",
    description: "설명",
    prerequisites: "",
    duration: "60",
    preferredTiming: "",
    presenterIds: [PRESENTER],
    attachment: "",
    requesterId: newId(),
  });
  await approveSeminar(request.id);
  const [seminar] = await getTable("seminars");
  await scheduleSeminar(seminar.id, {
    startsAt: future(10 * 24 * HOUR),
    endsAt: future(10 * 24 * HOUR + 2 * HOUR),
    location: "27동",
  });
  await publishSeminar(seminar.id);
  await cancelSeminar(seminar.id);
  return seminar.id;
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "seminars",
    "seminar-requests",
    "events",
    "activities",
    "members",
  ])
    await invalidateCache(`table_${t}`);
});

describe("공개 면", () => {
  it("아카이브 목록에서 사라진다", async () => {
    await cancelledSeminar();

    expect(await getPublicSeminars()).toEqual([]);
  });

  it("공개 활동 목록에서도 사라진다 — 출석 활동이 남아 있어도", async () => {
    await cancelledSeminar();

    expect(await getPublicActivities()).toEqual([]);
    expect(await getTable("activities")).toHaveLength(1); // 기록 자체는 보존된다
  });
});

describe("회원 면", () => {
  it("발표자의 관리 목록에서 사라진다", async () => {
    await cancelledSeminar();

    expect(await getManagedSeminars(PRESENTER)).toEqual([]);
    expect(await hasPresenterEvents(PRESENTER)).toBe(false);
  });

  it("본인 참가 기록에서 사라진다", async () => {
    await cancelledSeminar();

    expect(await getActivitiesOf(PRESENTER)).toEqual([]);
  });

  it("회원에게 보이는 이벤트 목록에 없다", async () => {
    await cancelledSeminar();

    expect(await getMemberVisibleEvents()).toEqual([]);
  });
});

describe("관리자 면 — 기록은 남는다", () => {
  it("세미나·활동·이벤트가 모두 보존되고 상태만 취소다", async () => {
    await cancelledSeminar();

    const [seminar] = await getTable("seminars");
    const [event] = await getTable("events");
    expect(seminar.publicationStatus).toBe("cancelled");
    expect(event.status).toBe("cancelled");
    expect(await getTable("activities")).toHaveLength(1);
  });
});

describe("공개되지 않은 세미나도 게스트에게 보이지 않는다", () => {
  it("승인만 된 세미나는 아카이브에 없다", async () => {
    const request = await submitSeminarRequest({
      title: "미확정 세미나",
      description: "",
      prerequisites: "",
      duration: "",
      preferredTiming: "",
      presenterIds: [],
      attachment: "",
      requesterId: newId(),
    });
    await approveSeminar(request.id);

    expect(await getPublicSeminars()).toEqual([]);
  });
});
