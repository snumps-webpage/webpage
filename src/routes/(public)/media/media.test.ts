import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock(
  "$lib/server/data/storage",
  () => import("$lib/server/data/storage-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import {
  __reset as __resetStorage,
  __stage,
  promoteToAssets,
} from "$lib/server/data/storage-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { GET } from "./[...key]/+server";

/**
 * 비공개 버킷의 유일한 읽기 통로. 여기서 새면 버킷을 잠근 의미가 없다.
 *
 * 규칙은 화면과 같다 — 공개된 세미나의 자료는 게스트도, 취소·미공개 세미나의
 * 자료는 관리자만. 그리고 **모르는 키는 404**다. 403이 아니라 404인 이유:
 * 403은 "그 파일은 있다"를 알려 준다.
 */

const seminarRow = (over: Record<string, unknown>) => ({
  id: newId(),
  title: "세미나",
  semester: "26-2",
  note: "",
  description: "",
  presenterIds: [],
  externalPresenters: "",
  publicationStatus: "published" as const,
  schedule: null,
  announcedAt: null,
  kind: null,
  durationMinutes: null,
  prerequisites: "",
  announce: true,
  semesterPinned: false,
  materials: [],
  photos: [],
  posterKey: "",
  preferredTiming: "",
  activityId: null,
  sourceRequestId: null,
  ...over,
});

const KEY = "seminars/s1/aa-slides.pdf";

async function storeFile(path = KEY) {
  __stage("pending/x-file.pdf", 10, "application/pdf");
  await promoteToAssets("pending/x-file.pdf", path);
}

/**
 * SvelteKit의 `redirect()`·`error()`는 값을 돌려주는 대신 **던진다**. 라우트를
 * 직접 부르는 테스트는 그것을 받아 상태로 환산해야 한다 — 돌려받은 Response만
 * 보면 모든 경로가 "응답 없음"으로 보인다.
 */
async function request(key: string, locals: Record<string, unknown> = {}) {
  const headers = new Headers();
  try {
    const response = await GET({
      params: { key },
      locals: { auth: async () => null, ...locals },
      setHeaders: (values: Record<string, string>) => {
        for (const [name, value] of Object.entries(values))
          headers.set(name, value);
      },
    } as never);
    for (const [name, value] of response.headers) headers.set(name, value);
    return {
      status: response.status,
      headers,
      location: response.headers.get("location"),
    };
  } catch (thrown) {
    const e = thrown as { status?: number; location?: string };
    return { status: e.status ?? 500, headers, location: e.location ?? null };
  }
}

const asAdmin = {
  member: { memberId: "a1", isAdmin: true, status: "active" },
  auth: async () => ({ user: { email: "admin@snu.ac.kr", name: "관리자" } }),
};

const asMember = {
  member: { memberId: "m1", isAdmin: false, status: "active" },
  auth: async () => ({ user: { email: "m@snu.ac.kr", name: "회원" } }),
};

beforeEach(async () => {
  __reset();
  __resetStorage();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "studies", "gallery-dinner"])
    await invalidateCache(`table_${t}`);
});

describe("GET /media/<key>", () => {
  it("공개된 세미나의 자료는 게스트에게 서명 URL로 넘긴다", async () => {
    await mutate("seminars", () => [seminarRow({ materials: [KEY] })]);
    await storeFile();

    const response = await request(KEY);

    expect(response.status).toBe(302);
    expect(response.location).toContain(KEY);
  });

  // 취소된 세미나의 자료가 URL만으로 계속 내려가면 취소가 취소가 아니다.
  it("취소된 세미나의 자료는 게스트에게 404다", async () => {
    await mutate("seminars", () => [
      seminarRow({ publicationStatus: "cancelled" as const, materials: [KEY] }),
    ]);
    await storeFile();

    expect((await request(KEY)).status).toBe(404);
  });

  it("회원이어도 취소된 세미나의 자료는 받지 못한다", async () => {
    await mutate("seminars", () => [
      seminarRow({ publicationStatus: "cancelled" as const, materials: [KEY] }),
    ]);
    await storeFile();

    expect((await request(KEY, asMember)).status).toBe(404);
  });

  it("관리자는 취소된 세미나의 자료도 받는다", async () => {
    await mutate("seminars", () => [
      seminarRow({ publicationStatus: "cancelled" as const, materials: [KEY] }),
    ]);
    await storeFile();

    const response = await request(KEY, asAdmin);

    expect(response.status).toBe(302);
    expect(response.location).toContain(KEY);
  });

  /**
   * 404는 캐시 헤더 없이 나가면 **공유 캐시가 저장할 수 있다**(RFC 9111은 404를
   * 휴리스틱 캐시 대상으로 둔다). 이 경로의 답은 요청자에 따라 다르므로, 게스트가
   * 받은 404가 관리자에게 재생되면 관리자가 자기 자료를 못 받는다. 이 저장소는
   * 경로 단위 엣지 재생을 실측한 적이 있다(hooks.server.ts).
   */
  it("404도 캐시 금지를 스스로 붙인다", async () => {
    const response = await request("seminars/none/zz.pdf");

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain(
      "no-store",
    );
  });

  // 서명 URL을 담은 302가 공유 캐시에 저장되면 남의 URL이 재생된다.
  it("302도 캐시 금지를 스스로 붙인다", async () => {
    await mutate("seminars", () => [seminarRow({ materials: [KEY] })]);
    await storeFile();

    const response = await request(KEY);

    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain(
      "no-store",
    );
  });

  it("어느 기록에도 없는 키는 404다", async () => {
    await storeFile("seminars/orphan/zz-slides.pdf");

    expect((await request("seminars/orphan/zz-slides.pdf")).status).toBe(404);
  });

  // 기록은 살아 있는데 바이트가 사라진 경우(관리자 삭제) — 깨진 링크가 아니라 404.
  it("기록에는 있지만 파일이 지워졌으면 404다", async () => {
    await mutate("seminars", () => [seminarRow({ materials: [KEY] })]);

    expect((await request(KEY)).status).toBe(404);
  });

  it("경로를 거슬러 올라가는 키는 거절한다", async () => {
    expect((await request("../../etc/passwd")).status).toBe(404);
  });
});
