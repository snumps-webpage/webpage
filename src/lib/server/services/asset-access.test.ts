import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { resolveAssetAccess } from "./asset-access";

/**
 * 버킷을 비공개로 돌리면 **누가 어떤 파일을 받을 수 있는지**를 앱이 정해야 한다.
 * 규칙은 화면과 같다: 공개된 세미나의 자료는 게스트도, 취소·미공개 세미나의
 * 자료는 관리자만. 그리고 **어느 레코드에도 속하지 않는 키는 거절한다** —
 * 기본값이 허용이면 삭제된 기록의 파일이나 오타 경로가 조용히 새어 나간다.
 */

const seminarRow = (over: Record<string, unknown>) => ({
  id: newId(),
  title: "세미나",
  semester: "26-2",
  note: "",
  presenterIds: [],
  externalPresenters: "",
  publicationStatus: "published" as const,
  schedule: null,
  announcedAt: null,
  semesterPinned: false,
  materials: [],
  photos: [],
  posterKey: "",
  preferredTiming: "",
  activityId: null,
  sourceRequestId: null,
  ...over,
});

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "studies", "gallery-dinner"])
    await invalidateCache(`table_${t}`);
});

describe("resolveAssetAccess", () => {
  it("공개된 세미나의 자료·사진·포스터는 게스트도 받는다", async () => {
    await mutate("seminars", () => [
      seminarRow({
        materials: ["seminars/s1/aa-slides.pdf"],
        photos: ["seminars/s1/bb-photo.jpg"],
        posterKey: "seminars/posters/s1/cc-poster.png",
      }),
    ]);

    expect(await resolveAssetAccess("seminars/s1/aa-slides.pdf")).toBe(
      "public",
    );
    expect(await resolveAssetAccess("seminars/s1/bb-photo.jpg")).toBe("public");
    expect(await resolveAssetAccess("seminars/posters/s1/cc-poster.png")).toBe(
      "public",
    );
  });

  // 취소는 페이로드에서만 감추는 것이 아니라 바이트에도 걸려야 한다.
  it("취소된 세미나의 자료는 관리자에게만 남는다", async () => {
    await mutate("seminars", () => [
      seminarRow({
        publicationStatus: "cancelled" as const,
        materials: ["seminars/s2/aa-slides.pdf"],
      }),
    ]);

    expect(await resolveAssetAccess("seminars/s2/aa-slides.pdf")).toBe("admin");
  });

  it("아직 공개하지 않은 세미나의 자료도 관리자 전용이다", async () => {
    await mutate("seminars", () => [
      seminarRow({
        publicationStatus: "scheduled" as const,
        photos: ["seminars/s3/aa-photo.jpg"],
      }),
    ]);

    expect(await resolveAssetAccess("seminars/s3/aa-photo.jpg")).toBe("admin");
  });

  // 신청 포스터는 심사 화면(관리자)에만 그려진다.
  it("세미나 신청의 포스터는 관리자 전용이다", async () => {
    await mutate("seminar-requests", () => [
      {
        id: newId(),
        title: "신청",
        description: "",
        prerequisites: "",
        duration: "60",
        preferredTiming: "",
        presenterIds: [],
        attachment: "",
        posterKey: "seminars/posters/r1/dd-poster.png",
        requesterId: newId(),
        status: "pending",
        createdAt: nowKstIso(),
      },
    ]);

    expect(await resolveAssetAccess("seminars/posters/r1/dd-poster.png")).toBe(
      "admin",
    );
  });

  it("스터디와 회식 사진은 공개 갤러리의 일부다", async () => {
    await mutate("studies", () => [
      {
        id: newId(),
        title: "스터디",
        semester: "26-2",
        textbook: "",
        description: "",
        note: "",
        status: "finished",
        organizerIds: [newId()],
        participantIds: [],
        pendingParticipantIds: [],
        pendingTransfer: null,
        schedule: [],
        transferHistory: [],
        photos: ["studies/st1/ee-photo.jpg"],
        sourceRequestId: null,
      },
    ]);
    await mutate("gallery-dinner", () => [
      {
        id: newId(),
        year: "2026",
        photos: ["gallery/g1/ff-photo.jpg"],
        activityId: null,
      },
    ]);

    expect(await resolveAssetAccess("studies/st1/ee-photo.jpg")).toBe("public");
    expect(await resolveAssetAccess("gallery/g1/ff-photo.jpg")).toBe("public");
  });

  /**
   * 같은 키를 두 기록이 가리키는 일은 실제로 있다 — 승인은 신청의 포스터 키를
   * 그대로 물려받는다. 먼저 찾은 행으로 답하면 표의 순서가 정책을 정하게 되고,
   * 그 방향이 하필 "공개"다. 가장 엄격한 쪽을 택한다.
   */
  it("한 키를 여러 기록이 가리키면 더 엄격한 쪽을 따른다", async () => {
    const shared = "seminars/posters/x/shared-poster.png";
    await mutate("seminars", () => [
      seminarRow({
        publicationStatus: "published" as const,
        posterKey: shared,
      }),
      seminarRow({
        publicationStatus: "cancelled" as const,
        posterKey: shared,
      }),
    ]);

    expect(await resolveAssetAccess(shared)).toBe("admin");
  });

  // 기본값이 허용이면 지워진 기록의 파일과 오타 경로가 그대로 나간다.
  it("어느 기록에도 속하지 않는 키는 거절한다", async () => {
    expect(await resolveAssetAccess("seminars/gone/zz-slides.pdf")).toBe(
      "none",
    );
    expect(await resolveAssetAccess("")).toBe("none");
    expect(await resolveAssetAccess("../../etc/passwd")).toBe("none");
  });
});
