import { beforeEach, describe, expect, it } from "vitest";
import {
  __exists,
  __reset,
  __stage,
  createSignedAssetUrl,
  listBackups,
  listStaged,
  promoteToAssets,
  removeAssets,
  uploadToBackups,
} from "./storage-memory";

/**
 * The memory backend stands in for Supabase Storage in every service test, so
 * its listing must behave like the real `.list(prefix)`: ONE level deep, names
 * relative to the prefix, and sub-folders surfaced as rows with no timestamp
 * (real rows carry `created_at: null`; the seam maps that to ""). A recursive
 * stand-in once let cleanupStaging pass its tests while deleting nothing in
 * production — see docs/code-audit/PRIORITY.md W-2.
 */

beforeEach(() => __reset());

describe("listStaged (Supabase .list semantics)", () => {
  it("returns only the direct children of the prefix, sub-folders as empty-timestamp rows", async () => {
    __stage(
      "pending/seminar-photo/a.png",
      1,
      "image/png",
      "2026-09-01T00:00:00.000Z",
    );
    __stage(
      "pending/gallery-photo/b.jpg",
      1,
      "image/jpeg",
      "2026-09-01T00:00:00.000Z",
    );

    const rows = await listStaged("pending");

    expect(rows).toEqual([
      { name: "gallery-photo", createdAt: "" },
      { name: "seminar-photo", createdAt: "" },
    ]);
  });

  it("names files relative to the prefix", async () => {
    __stage(
      "pending/seminar-photo/a.png",
      1,
      "image/png",
      "2026-09-01T00:00:00.000Z",
    );

    const rows = await listStaged("pending/seminar-photo");

    expect(rows).toEqual([
      { name: "a.png", createdAt: "2026-09-01T00:00:00.000Z" },
    ]);
  });

  it("does not match sibling prefixes that merely share a string prefix", async () => {
    __stage("pending-old/x.png", 1, "image/png", "2026-09-01T00:00:00.000Z");

    expect(await listStaged("pending")).toEqual([]);
  });
});

describe("listBackups (same semantics as listStaged)", () => {
  it("names dump files relative to the prefix", async () => {
    await uploadToBackups("dumps/2026-09-06.json", "{}");

    const rows = await listBackups("dumps");

    expect(rows.map((r) => r.name)).toEqual(["2026-09-06.json"]);
  });
});

/**
 * 공개 버킷을 비공개로 돌리는 작업이 이 두 함수를 요구한다 — 서명 URL(읽기의
 * 유일한 통로)과 삭제(관리자가 파일을 지울 수 있어야 한다). 메모리 백엔드가
 * 같은 모양을 제공하지 않으면 서비스 테스트가 실제 seam을 못 흉내 낸다.
 */
describe("assets 버킷 — 서명 URL과 삭제", () => {
  async function promoted(path: string) {
    __stage("pending/x-file.pdf", 10, "application/pdf");
    await promoteToAssets("pending/x-file.pdf", path);
  }

  it("승격된 자산에 서명 URL을 낸다", async () => {
    await promoted("seminars/s1/aa-slides.pdf");

    const url = await createSignedAssetUrl("seminars/s1/aa-slides.pdf", 60);

    expect(url).toContain("seminars/s1/aa-slides.pdf");
  });

  it("없는 자산에는 서명 URL을 내지 않는다", async () => {
    expect(await createSignedAssetUrl("seminars/gone/zz.pdf", 60)).toBeNull();
  });

  it("관리자 삭제는 바이트를 지운다", async () => {
    await promoted("seminars/s1/aa-slides.pdf");

    await removeAssets(["seminars/s1/aa-slides.pdf"]);

    expect(__exists("assets", "seminars/s1/aa-slides.pdf")).toBe(false);
  });

  it("빈 목록은 아무것도 하지 않는다", async () => {
    await promoted("seminars/s1/aa-slides.pdf");

    await removeAssets([]);

    expect(__exists("assets", "seminars/s1/aa-slides.pdf")).toBe(true);
  });
});
