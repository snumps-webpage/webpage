import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { currentTerm } from "$lib/server/core/semester";
import {
  getPublicActivities,
  getPublicExecutives,
  getPublicGallery,
  getPublicMembers,
  getPublicProjects,
  getPublicSeminar,
  getPublicSeminars,
  getPublicStudies,
} from "./archive";

/**
 * BE-64: the public-response audit. No public payload may ever contain a
 * PII or operational key — this suite serializes every public read over a
 * fully-populated fixture and asserts the forbidden keys are absent.
 */

const FORBIDDEN_KEYS = [
  "email",
  "phone",
  "background",
  "mailPrefs",
  "isAdmin",
  "withdrawal",
  "privateInfoId",
  "attendeeIds",
  "applicantIds",
  "pendingParticipantIds",
  "pendingTransfer",
  "transferHistory",
  "attendCode",
  "pathId",
  "sourceRequestId",
  "alumniRevoked",
];

function forbiddenKeysIn(value: unknown): string[] {
  const json = JSON.stringify(value);
  return FORBIDDEN_KEYS.filter((k) => json.includes(`"${k}"`));
}

async function seedFixture() {
  const term = currentTerm();
  await mutate("members", () => [
    {
      id: "m1", name: "김수학", department: "수리과학부", joinedAt: "2024-03-01",
      status: "regular" as const, statusChangedAt: nowKstIso(), withdrawal: null,
      isAlumni: true, alumniRevoked: false,
      roles: [{ term, title: "기획부장" }, { term, title: "회장" }],
      isAdmin: true, publicContact: "snumps0@gmail.com",
      project: { title: "정수론 시각화", url: "https://example.com" },
      legacyMemberId: null, sourceRequestId: "src-1",
    },
    {
      id: "m2", name: "이탈퇴", department: "수리과학부", joinedAt: "2023-03-01",
      status: "withdrawn" as const, statusChangedAt: nowKstIso(),
      withdrawal: {
        requestedAt: nowKstIso(), previousStatus: "regular" as const,
        holdBy: null, holdAt: null,
      },
      isAlumni: true, alumniRevoked: false, roles: [], isAdmin: false,
      publicContact: null, project: { title: "숨겨야 함" }, legacyMemberId: null,
      sourceRequestId: null,
    },
  ]);
  await mutate("private-info", () => [
    {
      id: newId(), memberId: "m1", email: "secret@snu.ac.kr", phone: "010-0000-0000",
      studentId: "2020-00000", background: "비밀", mailPrefs: { announcements: true },
      sourceRequestId: null,
    },
  ]);
  await mutate("seminars", () => [
    {
      id: "sem1", title: "위상수학", semester: "26-2", note: "비고",
      presenterIds: ["m1"], externalPresenters: "", materials: ["seminars/sem1/a.pdf"],
      photos: ["seminars/sem1/p.png"], activityId: "act1", sourceRequestId: "req1",
    },
  ]);
  await mutate("studies", () => [
    {
      id: "st1", title: "해석학", semester: "26-2", textbook: "", description: "",
      note: "", organizerIds: ["m1"], participantIds: ["m1", "m2"],
      pendingParticipantIds: ["hidden"], pendingTransfer: { toMemberId: "x", requestedAt: nowKstIso() },
      schedule: [], transferHistory: [], photos: ["studies/st1/p.png"],
      status: "ongoing" as const, sourceRequestId: null,
    },
  ]);
  await mutate("activities", () => [
    {
      id: "act1", title: "위상수학 세미나", date: { start: nowKstIso(), end: null },
      type: "세미나" as const, attendeeIds: ["m1", "m2"], sourceRequestId: null,
    },
  ]);
  await mutate("gallery-dinner", () => [
    { id: "g1", year: "2026", photos: ["gallery/g1/d.png"], activityId: "act1" },
  ]);
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "private-info", "seminars", "studies", "activities", "gallery-dinner"]) {
    await invalidateCache(`table_${t}`);
  }
  await seedFixture();
});

describe("public payloads carry no PII or operational fields (BE-64)", () => {
  it("audits every public read against the forbidden-key list", async () => {
    const payloads: Record<string, unknown> = {
      members: await getPublicMembers(),
      executives: await getPublicExecutives(),
      seminars: await getPublicSeminars(),
      seminar: await getPublicSeminar("sem1"),
      studies: await getPublicStudies(),
      activities: await getPublicActivities(),
      gallery: await getPublicGallery(),
      projects: await getPublicProjects(),
    };
    for (const [name, payload] of Object.entries(payloads)) {
      expect(forbiddenKeysIn(payload), `leak in ${name}`).toEqual([]);
    }
  });

  it("excludes withdrawn members from the roster and the project board", async () => {
    const roster = await getPublicMembers();
    expect(roster.map((m) => m.name)).toEqual(["김수학"]);
    const projects = await getPublicProjects();
    expect(projects.map((p) => p.project.title)).toEqual(["정수론 시각화"]);
  });

  it("exposes the consented publicContact for the current term only", async () => {
    const [latest] = await getPublicExecutives();
    expect(latest.holders[0]).toMatchObject({
      name: "김수학",
      title: "회장",
      contact: "snumps0@gmail.com",
    });
  });

  it("keeps only 회장/부회장 and drops other roles from the public roster", async () => {
    const [latest] = await getPublicExecutives();
    expect(latest.holders.map((h) => h.title)).not.toContain("기획부장");
    expect(latest.holders.every((h) => ["회장", "부회장"].includes(h.title))).toBe(true);
  });

  it("publishes the calendar without attendee lists", async () => {
    const activities = await getPublicActivities();
    expect(activities[0]).toEqual({
      title: "위상수학 세미나",
      date: expect.any(Object),
      type: "세미나",
    });
  });

  it("resolves asset keys to URLs, never raw keys alone", async () => {
    const seminar = await getPublicSeminar("sem1");
    expect(seminar!.materials[0]).toMatch(/seminars\/sem1\/a\.pdf$/);
    const gallery = await getPublicGallery();
    expect(gallery).toHaveLength(3); // seminar + study + dinner photos
  });
});
