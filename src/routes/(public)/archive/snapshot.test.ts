import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { load } from "./+layout.server";

/**
 * BE-64 for the path that actually renders.
 *
 * The archive pages read `data.archive.*` from THIS layout — the child page
 * loads feed nothing, and there is no other accessor for these lists. So the
 * guest-payload contract for seminars, studies, the calendar, the gallery and
 * the project board is asserted here, on the load itself. (The per-list
 * `getPublic*` accessors that used to be audited instead were never rendered
 * and had drifted from this path; they are gone — audit LB16-5.)
 */

const FORBIDDEN_KEYS = [
  "email",
  "phone",
  "background",
  "studentId",
  "mailPrefs",
  "isAdmin",
  "withdrawal",
  "privateInfoId",
  "attendeeIds",
  "applicantIds",
  "participantIds",
  "pendingParticipantIds",
  "pendingTransfer",
  "transferHistory",
  "attendCode",
  "pathId",
  "sourceRequestId",
  "alumniRevoked",
  "requesterId",
];

function forbiddenKeysIn(value: unknown): string[] {
  const json = JSON.stringify(value);
  return FORBIDDEN_KEYS.filter((k) => json.includes(`"${k}"`));
}

async function seedFixture() {
  await mutate("members", () => [
    {
      id: "m1",
      name: "김수학",
      department: "수리과학부",
      joinedAt: "2024-03-01",
      status: "regular" as const,
      statusChangedAt: nowKstIso(),
      withdrawal: null,
      isAlumni: true,
      alumniRevoked: false,
      roles: [],
      isAdmin: true,
      publicContact: "snumps0@gmail.com",
      alumniRevocationReason: null,
      project: { title: "정수론 시각화", url: "https://example.com" },
      legacyMemberId: null,
      sourceRequestId: "src-1",
    },
    {
      id: "m2",
      name: "이탈퇴",
      department: "수리과학부",
      joinedAt: "2023-03-01",
      status: "withdrawn" as const,
      statusChangedAt: nowKstIso(),
      withdrawal: {
        requestedAt: nowKstIso(),
        previousStatus: "regular" as const,
        holdBy: null,
        holdAt: null,
      },
      isAlumni: true,
      alumniRevoked: false,
      roles: [],
      isAdmin: false,
      publicContact: null,
      alumniRevocationReason: null,
      project: { title: "탈퇴자의 프로젝트" },
      legacyMemberId: null,
      sourceRequestId: null,
    },
  ]);
  await mutate("private-info", () => [
    {
      id: newId(),
      memberId: "m1",
      email: "secret@snu.ac.kr",
      phone: "010-0000-0000",
      studentId: "2020-00000",
      background: "비밀",
      mailPrefs: { announcements: true },
      hidePublicPhone: false,
      sourceRequestId: null,
    },
  ]);
  await mutate("seminars", () => [
    {
      id: "sem1",
      title: "위상수학",
      semester: "26-2",
      note: "비고",
      description: "",
      presenterIds: ["m1"],
      externalPresenters: "",
      publicationStatus: "published",
      kind: "irregular",
      durationMinutes: 90,
      prerequisites: "선형대수",
      announce: true,
      schedule: null,
      announcedAt: null,
      semesterPinned: false,
      materials: ["seminars/sem1/a.pdf"],
      photos: ["seminars/sem1/p.png"],
      posterKey: "",
      preferredTiming: "",
      activityId: "act1",
      sourceRequestId: "req1",
    },
  ]);
  // ZR-6: an operational table — nothing of it may reach the public load.
  await mutate("seminar-requests", () => [
    {
      id: "req1",
      title: "위상수학",
      description: "운영용 설명 — 공개되면 안 된다",
      prerequisites: "신청서의 선수지식 — 세미나 기록이 아니다",
      duration: "90분",
      preferredTiming: "",
      presenterIds: ["m1"],
      attachment: "https://internal.example/draft",
      posterKey: "",
      requesterId: "m1",
      status: "approved" as const,
      closedAs: null,
      kind: null,
      createdAt: nowKstIso(),
    },
  ]);
  await mutate("studies", () => [
    {
      id: "st1",
      title: "해석학",
      semester: "26-2",
      textbook: "",
      note: "",
      organizerIds: ["m1"],
      participantIds: ["m1", "m2"],
      pendingParticipantIds: ["hidden"],
      pendingTransfer: { toMemberId: "x", requestedAt: nowKstIso() },
      schedule: [],
      transferHistory: [],
      photos: ["studies/st1/p.png"],
      status: "ongoing" as const,
      sourceRequestId: null,
      description: "",
    },
  ]);
  await mutate("activities", () => [
    {
      id: "act1",
      title: "위상수학 세미나",
      date: { start: nowKstIso(), end: null },
      type: "세미나" as const,
      attendeeIds: ["m1", "m2"],
      sourceRequestId: null,
    },
  ]);
  await mutate("gallery-dinner", () => [
    {
      id: "g1",
      year: "2026",
      photos: ["gallery/g1/d.png"],
      activityId: "act1",
    },
  ]);
}

const TABLES = [
  "members",
  "private-info",
  "seminars",
  "seminar-requests",
  "studies",
  "activities",
  "gallery-dinner",
];

async function loadArchive() {
  // The load reads nothing off the event — it is a pure snapshot builder.
  return (await load({} as never)) as {
    archive: {
      seminars: {
        prerequisites: string;
        durationMinutes: number | null;
        description: string | null;
        presenterNames: string[];
        files: { url: string }[];
      }[];
      activities: Record<string, unknown>[];
      gallery: { thumbnailUrl: string; displayUrl: string }[];
      projects: { memberId: string; memberName: string }[];
    };
  };
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of TABLES) await invalidateCache(`table_${t}`);
  await seedFixture();
});

describe("archive layout snapshot (BE-64, the rendered path)", () => {
  it("carries no PII or operational key", async () => {
    const data = await loadArchive();
    expect(forbiddenKeysIn(data.archive)).toEqual([]);
  });

  it("keeps member row ids out of the public payload (D2)", async () => {
    const { archive } = await loadArchive();
    const json = JSON.stringify(archive.projects);
    expect(json).not.toContain('"m1"');
    expect(
      archive.projects.every((p) => /^project-\d+$/.test(p.memberId)),
    ).toBe(true);
  });

  it("omits withdrawn members from the project roster", async () => {
    const { archive } = await loadArchive();
    expect(archive.projects.map((p) => p.memberName)).toEqual(["김수학"]);
    expect(JSON.stringify(archive.projects)).not.toContain("탈퇴자의 프로젝트");
  });

  // #7 / #12: prerequisites and duration are the seminar's own record now
  // (approval copies them) — the request table is not read at all (ZR-6).
  it("takes prerequisites and duration from the seminar, nothing from its request", async () => {
    const { archive } = await loadArchive();
    expect(archive.seminars[0]).toMatchObject({
      prerequisites: "선형대수",
      durationMinutes: 90,
    });
    const json = JSON.stringify(archive);
    expect(json).not.toContain("운영용 설명");
    expect(json).not.toContain("internal.example");
    expect(json).not.toContain("신청서의 선수지식");
  });

  // PUB-11: the calendar is the schedule only — the fixture's activity has an
  // attendee list, and the entry carries exactly these four fields.
  it("publishes the calendar without attendee lists", async () => {
    const { archive } = await loadArchive();
    expect(archive.activities).toEqual([
      {
        id: "act1",
        title: "위상수학 세미나",
        type: "세미나",
        date: expect.any(String),
      },
    ]);
  });

  // 기본값은 앱 경로다 — 버킷이 비공개이므로 그것만이 유효한 링크다(C-22).
  it("resolves asset keys to guarded app paths", async () => {
    const { archive } = await loadArchive();
    expect(archive.seminars[0].files[0].url).toBe("/media/seminars/sem1/a.pdf");
    // seminar + study + dinner photos
    expect(archive.gallery.map((g) => g.displayUrl)).toEqual([
      "/media/seminars/sem1/p.png",
      "/media/studies/st1/p.png",
      "/media/gallery/g1/d.png",
    ]);
  });

  // #4/#20, LB31-3: a cancelled study never ran. The public list shows no
  // status, so it would read as a study that was held — it stays out.
  it("keeps a cancelled study out of the public list and gallery", async () => {
    await mutate("studies", (rows) => [
      ...rows,
      {
        ...rows[0],
        id: "st2",
        title: "열리지 않은 스터디",
        photos: ["studies/st2/p.png"],
        status: "cancelled" as const,
      },
    ]);
    const { archive } = (await loadArchive()) as unknown as {
      archive: { studies: { title: string }[] };
    };
    expect(archive.studies.map((s) => s.title)).toEqual(["해석학"]);
    expect(JSON.stringify(archive)).not.toContain("st2");
  });

  // W-8: with no CDN the payload must carry nothing usable — and nothing that
  // looks usable either, or the consumer's `{#if url}` guard renders a broken
  // image instead of its placeholder. (직접 CDN 모드에서만 해당한다.)
  it("emits empty URLs, not raw keys, when direct mode has no CDN", async () => {
    testEnv.ASSETS_ACCESS = "public";
    delete testEnv.ASSETS_CDN_URL;
    try {
      const { archive } = await loadArchive();
      expect(archive.seminars[0].files[0].url).toBe("");
      expect(archive.gallery).toHaveLength(3);
      for (const g of archive.gallery) {
        expect(g.displayUrl).toBe("");
        expect(g.thumbnailUrl).toBe("");
      }
      expect(JSON.stringify(archive.gallery)).not.toContain("seminars/sem1");
    } finally {
      delete testEnv.ASSETS_ACCESS;
    }
  });
});

// Migrated seminars name presenters by their legacy id; the de-duplicated
// roster drops that row once its person re-joins. The list resolves through
// the directory index, so it names them by their current row (audit LB16-4).
describe("presenters who re-joined", () => {
  it("are named by their current row in the archive list", async () => {
    await invalidateCache("table_legacy-members");
    __putRawDoc("table", "legacy-members", {
      schemaVersion: 1,
      rows: [
        {
          id: "L1",
          name: "옛이름",
          department: "수리과학부",
          joinedAt: "2019-03-01",
          status: "regular",
          statusChangedAt: nowKstIso(),
          withdrawal: null,
          isAlumni: true,
          alumniRevoked: false,
          roles: [],
          isAdmin: false,
          publicContact: null,
          alumniRevocationReason: null,
          project: null,
          legacyMemberId: null,
          sourceRequestId: null,
        },
      ],
    });
    await mutate("members", (rows) =>
      rows.map((m) => (m.id === "m1" ? { ...m, legacyMemberId: "L1" } : m)),
    );
    await mutate("seminars", (rows) =>
      rows.map((s) => ({ ...s, presenterIds: ["L1"] })),
    );

    const { archive } = await loadArchive();
    expect(archive.seminars[0].presenterNames).toEqual(["김수학"]);
  });
});
