import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import {
  __auditRows,
  __docs,
  __putRawDoc,
  __reset,
} from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { nowKstIso } from "$lib/server/core/time";
import type { Member, Study } from "$lib/server/data/schemas";
import { setStudyParticipants } from "$lib/server/services/records-admin";
import { actions, load } from "./+page.server";

/**
 * 관리자 스터디 참가자 편집기(계획 2026-10-14 Task 4, snumps-webpage/
 * D-000043·057). 관리자는 종료·취소 스터디까지 참가자를 넣고 뺀다. 선택지는
 * 통합 명부 전원(탈퇴자 포함), 재가입 회원은 새 행 하나. 주최자를 뺀 목록은
 * 거부하고 아무것도 쓰지 않는다. '출석자에서 채우기'의 후보는 그 스터디에
 * 연결된 '스터디' 종류 활동의 출석자 합집합이다(연결된 회식 제외, D-000137).
 */

const admin = {
  member: {
    memberId: "admin",
    privateInfoId: null,
    name: "관리자",
    status: "regular",
    isAdmin: true,
    isAlumni: false,
    registered: true,
    capabilities: [],
  },
  auth: async () => ({ user: { email: "admin@snu.ac.kr", name: "관리자" } }),
} as unknown as App.Locals;

function member(over: Partial<Member> & Pick<Member, "id" | "name">): Member {
  return {
    department: "수리과학부",
    joinedAt: "2024-03-01",
    status: "regular",
    statusChangedAt: nowKstIso(),
    withdrawal: null,
    isAlumni: false,
    alumniRevoked: false,
    alumniRevocationReason: null,
    roles: [],
    isAdmin: false,
    publicContact: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
    ...over,
  };
}

function study(over: Partial<Study> & Pick<Study, "id">): Study {
  return {
    title: "해석학",
    semester: "25-1",
    textbook: "",
    description: "",
    note: "",
    organizerIds: ["m1"],
    participantIds: ["m1"],
    pendingParticipantIds: [],
    pendingTransfer: null,
    schedule: [],
    transferHistory: [],
    photos: [],
    status: "finished",
    sourceRequestId: null,
    ...over,
  };
}

const activity = (
  id: string,
  studyId: string | null,
  attendeeIds: string[],
  type = "스터디",
) => ({
  id,
  title: id,
  date: { start: "2025-03-01T19:00:00+09:00", end: null },
  type,
  attendeeIds,
  studyId,
  sourceRequestId: null,
});

function post(fields: Record<string, string | string[]>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields))
    for (const one of [v].flat()) body.append(k, one);
  return {
    request: new Request("http://localhost/admin/studies", {
      method: "POST",
      body,
    }),
    locals: admin,
  } as never;
}

const codeOf = (e: unknown) => (e instanceof AppError ? e.code : String(e));
const version = async () => (await __docs("table")).get("studies")?.version;
const studyRow = async (id: string) =>
  (await getTable("studies")).find((s) => s.id === id)!;

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "activities",
    "events",
    "members",
    "legacy-members",
    "studies",
    "study-requests",
  ])
    await invalidateCache(`table_${t}`);
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [
      member({ id: "m1", name: "주최" }),
      member({ id: "m2", name: "재가입", legacyMemberId: "L2" }),
      member({ id: "w1", name: "탈퇴", status: "withdrawn" }),
    ],
  });
  await __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [
      member({ id: "L1", name: "옛회원", department: "물리천문학부" }),
      member({ id: "L2", name: "재가입" }),
    ],
  });
  await __putRawDoc("table", "studies", {
    schemaVersion: 1,
    rows: [
      study({ id: "s1", participantIds: ["m1", "L2"] }),
      study({
        id: "s2",
        status: "recruiting",
        pendingParticipantIds: ["L1", "w1"],
      }),
    ],
  });
  await __putRawDoc("table", "activities", {
    schemaVersion: 1,
    rows: [
      activity("a1", "s1", ["m1", "L1"]),
      activity("a2", "s1", ["L1", "w1", "L2"]),
      activity("a3", null, ["m2"]),
      activity("a4", "s2", ["m2"]),
      // 스터디에 연결된 회식 — 출석자 채우기 후보가 아니다(D-000137)
      activity("a5", "s1", ["m2"], "회식"),
    ],
  });
});

describe("setStudyParticipants", () => {
  afterEach(expectTablesValid);

  it("adds and removes people on a finished study, former and withdrawn included", async () => {
    await setStudyParticipants("s1", ["m1", "L1", "w1", "L1"], "admin");

    expect((await studyRow("s1")).participantIds).toEqual(["m1", "L1", "w1"]);
    const [row] = await __auditRows();
    expect(row).toMatchObject({
      actor: "admin",
      action: "study.set-participants",
      target_tb: "studies",
      target_id: "s1",
    });
    expect(row.detail).toEqual({ added: ["L1", "w1"], removed: ["L2"] });
  });

  it("takes the saved people off the waiting list", async () => {
    await setStudyParticipants("s2", ["m1", "L1"], "admin");

    const s2 = await studyRow("s2");
    expect(s2.participantIds).toEqual(["m1", "L1"]);
    expect(s2.pendingParticipantIds).toEqual(["w1"]);
  });

  it("refuses a list without the organizer, writing nothing", async () => {
    const before = await version();
    await expect(
      setStudyParticipants("s1", ["L2", "L1"], "admin"),
    ).rejects.toSatisfy((e) => codeOf(e) === "VALIDATION_FAILED");
    expect(await version()).toBe(before);
    expect(await __auditRows()).toEqual([]);
  });

  it("refuses an id no directory knows, writing nothing", async () => {
    const before = await version();
    await expect(
      setStudyParticipants("s1", ["m1", "ghost"], "admin"),
    ).rejects.toSatisfy((e) => codeOf(e) === "VALIDATION_FAILED");
    expect(await version()).toBe(before);
  });

  it("keeps an id the study already records even when no directory knows it", async () => {
    await __putRawDoc("table", "studies", {
      schemaVersion: 1,
      rows: [study({ id: "s1", participantIds: ["m1", "lost"] })],
    });
    await invalidateCache("table_studies");

    await setStudyParticipants("s1", ["m1", "lost", "L1"], "admin");

    expect((await studyRow("s1")).participantIds).toEqual(["m1", "lost", "L1"]);
  });

  it("refuses a study that does not exist", async () => {
    await expect(
      setStudyParticipants("nope", ["m1"], "admin"),
    ).rejects.toSatisfy((e) => codeOf(e) === "NOT_FOUND");
  });
});

describe("?/setParticipants", () => {
  it("saves the checked people", async () => {
    const result = await actions.setParticipants(
      post({ id: "s1", participantIds: ["m1", "L2", "L1"] }),
    );
    expect(result).toMatchObject({
      success: true,
      operation: "studyParticipantsSet",
    });
    expect((await studyRow("s1")).participantIds).toEqual(["m1", "L2", "L1"]);
  });

  it("answers a refused list with its reason", async () => {
    const result = await actions.setParticipants(
      post({ id: "s1", participantIds: ["L1"] }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: { error: "VALIDATION_FAILED", message: expect.any(String) },
    });
  });
});

describe("participant editor load", () => {
  type Loaded = {
    records: {
      id: string;
      participantIds: string[];
      participantPeople: { id: string; name: string }[];
      attendeeCandidates: string[];
    }[];
    directoryPickers: {
      id: string;
      name: string;
      legacyMemberId: string | null;
      former: boolean;
    }[];
  };
  const loaded = async () =>
    (await load({ locals: admin } as never)) as unknown as Loaded;

  it("offers the whole directory, withdrawn included, a rejoined person once", async () => {
    const { directoryPickers } = await loaded();
    expect(
      directoryPickers.map((p) => [p.id, p.legacyMemberId, p.former]),
    ).toEqual([
      ["m1", null, false],
      ["m2", "L2", false],
      ["w1", null, true],
      ["L1", null, true],
    ]);
  });

  it("names the study's participants, a legacy id as that person", async () => {
    const { records } = await loaded();
    const s1 = records.find((r) => r.id === "s1")!;
    expect(s1.participantIds).toEqual(["m1", "L2"]);
    expect(s1.participantPeople.map((p) => [p.id, p.name])).toEqual([
      ["m1", "주최"],
      ["L2", "재가입"],
    ]);
  });

  // D-000054: the organizer choices follow the study's status
  it("carries each study's status", async () => {
    const data = (await load({ locals: admin } as never)) as unknown as {
      records: { id: string; status: string }[];
    };
    expect(data.records.map((r) => [r.id, r.status])).toEqual([
      ["s2", "recruiting"],
      ["s1", "finished"],
    ]);
  });

  it("collects the attendees of the study's linked '스터디' activities, once each — not of a linked 회식 (D-000137)", async () => {
    const { records } = await loaded();
    expect(records.find((r) => r.id === "s1")!.attendeeCandidates).toEqual([
      "m1",
      "L1",
      "w1",
      "L2",
    ]);
    expect(records.find((r) => r.id === "s2")!.attendeeCandidates).toEqual([
      "m2",
    ]);
  });
});
