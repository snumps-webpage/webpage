import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { load } from "./+layout.server";

/**
 * BE-64 for the path that actually renders.
 *
 * `lib/server/public/archive.test.ts` audits the `getPublic*` functions, but the
 * archive pages read `data.archive.*` from THIS layout — the child page loads
 * feed nothing. So the forbidden-key contract has to be asserted here too, or
 * the suite guards a payload no visitor receives while the one they do receive
 * is unchecked.
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
      presenterIds: ["m1"],
      externalPresenters: "",
      publicationStatus: "published",
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
  // ZR-6: the public load reads this operational table for exactly one field.
  await mutate("seminar-requests", () => [
    {
      id: "req1",
      title: "위상수학",
      description: "운영용 설명 — 공개되면 안 된다",
      prerequisites: "선형대수",
      duration: "90분",
      preferredTiming: "",
      presenterIds: ["m1"],
      attachment: "https://internal.example/draft",
      posterKey: "",
      requesterId: "m1",
      status: "approved" as const,
      createdAt: nowKstIso(),
    },
  ]);
  await mutate("studies", () => [
    {
      id: "st1",
      title: "해석학",
      semester: "26-2",
      textbook: "",
      description: "",
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
      seminars: { prerequisites: string; description: string | null }[];
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

  it("takes only prerequisites from the seminar-requests table (ZR-6)", async () => {
    const { archive } = await loadArchive();
    expect(archive.seminars[0].prerequisites).toBe("선형대수");
    const json = JSON.stringify(archive);
    expect(json).not.toContain("운영용 설명");
    expect(json).not.toContain("internal.example");
  });
});
