import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { toKstIso } from "$lib/server/core/time";
import { getActivitiesOf } from "$lib/server/data/repos";
import {
  getPublicActivities,
  getPublicGallery,
  getPublicSeminars,
} from "$lib/server/public/archive";
import { getManagedSeminars, hasPresenterEvents } from "./events";
import { cancelSeminar, publishSeminar, scheduleSeminar } from "./seminars";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import { getMemberVisibleEvents } from "./visibility";
import { load as dashboardLoad } from "../../../routes/(public)/+page.server";

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
    startTime: null,
    endsAt: future(10 * 24 * HOUR + 2 * HOUR),
    location: "27동",
  });
  await publishSeminar(seminar.id);
  await cancelSeminar(seminar.id, { memberId: "admin-1", isAdmin: true });
  return seminar.id;
}

async function scheduledOnlySeminar() {
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
  return (await getTable("seminars")).find((s) => s.title === "미확정 세미나")!
    .id;
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
  it("공개 아카이브 접근자에서 사라진다", async () => {
    await cancelledSeminar();

    expect(await getPublicSeminars()).toEqual([]);
    expect(await getPublicActivities()).toEqual([]);
    expect(await getTable("activities")).toHaveLength(1); // 기록 자체는 보존된다
  });

  // 사진 격자는 세미나 표를 직접 읽는다 — 형제 접근자의 상태 필터가 여기에만
  // 빠져 있으면 취소된 세미나의 제목과 사진이 그대로 나간다.
  it("공개 갤러리에서도 사라진다", async () => {
    const id = await cancelledSeminar();
    await mutate("seminars", (rows) =>
      rows.map((s) => (s.id === id ? { ...s, photos: ["photo-key.jpg"] } : s)),
    );

    expect(await getPublicGallery()).toEqual([]);
  });

  // 위 접근자들은 **게스트에게 실제로 나가는 경로가 아니다.** 아카이브
  // 레이아웃이 표를 직접 읽어 스냅샷을 따로 만든다 — 필터를 접근자에만 걸면
  // 아무도 안 보는 페이로드를 지키게 된다(ZR-8과 같은 형태의 재발).
  // 그래서 단언은 실제 로드의 **직렬화된 반환값**을 본다.
  it("아카이브 레이아웃이 실제로 내보내는 페이로드에 없다", async () => {
    await cancelledSeminar();
    const { load } =
      await import("../../../routes/(public)/archive/+layout.server");

    const payload = JSON.stringify(await load({} as never));

    expect(payload).not.toContain("취소될 세미나");
  });

  it("미공개 세미나도 그 페이로드에 없다", async () => {
    await scheduledOnlySeminar();
    const { load } =
      await import("../../../routes/(public)/archive/+layout.server");

    const payload = JSON.stringify(await load({} as never));

    expect(payload).not.toContain("미확정 세미나");
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

// 이벤트 자신의 상태만 보면 새 세션을 붙여 되살릴 수 있다.
describe("되살아나는 경로", () => {
  it("취소된 세미나의 활동에 새 출석 세션을 붙여도 회원 면에 나타나지 않는다", async () => {
    await cancelledSeminar();
    const [activity] = await getTable("activities");
    const { connectActivity } = await import("./events");

    await connectActivity(activity.id);

    expect(await getMemberVisibleEvents()).toEqual([]);
    expect(await getManagedSeminars(PRESENTER)).toEqual([]);
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
    await scheduledOnlySeminar();

    expect(await getPublicSeminars()).toEqual([]);
  });
});

/**
 * 대시보드는 세미나 행과 **신청 행**을 따로 싣는다. 취소는 세미나 쪽만 건드리므로
 * 신청 행은 "승인됨"인 채로 남아, 개설자와 공동 발표자의 첫 화면에 취소된
 * 세미나가 계속 보인다 — 관리자에게만 남기기로 한 결정과 어긋난다.
 */
describe("개설자 본인의 대시보드", () => {
  const locals = {
    member: { memberId: PRESENTER, isAdmin: false, status: "active" },
    auth: async () => ({ user: { email: "p@snu.ac.kr", name: "발표자" } }),
  };

  async function dashboardOf() {
    const result = (await dashboardLoad({
      locals,
      url: new URL("https://example.test/"),
      cookies: { get: () => undefined },
    } as never)) as {
      streamed: {
        dashboard: Promise<{
          seminarRequests: { title: string }[];
          approvedSeminars: { title: string }[];
        } | null>;
      };
    };
    return (await result.streamed.dashboard)!;
  }

  it("취소된 세미나는 신청 목록에서도 사라진다", async () => {
    await cancelledSeminar();

    const dashboard = await dashboardOf();

    expect(dashboard.approvedSeminars).toEqual([]);
    expect(dashboard.seminarRequests.map((r) => r.title)).toEqual([]);
  });

  it("취소되지 않은 세미나의 신청은 그대로 보인다", async () => {
    await submitSeminarRequest({
      title: "살아 있는 세미나",
      description: "",
      prerequisites: "",
      duration: "60",
      preferredTiming: "",
      presenterIds: [PRESENTER],
      attachment: "",
      requesterId: PRESENTER,
    });

    const dashboard = await dashboardOf();

    expect(dashboard.seminarRequests.map((r) => r.title)).toEqual([
      "살아 있는 세미나",
    ]);
  });
});
