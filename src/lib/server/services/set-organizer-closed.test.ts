import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import {
  __auditRows,
  __putRawDoc,
  __reset,
} from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { nowKstIso } from "$lib/server/core/time";
import type { Member, Study } from "$lib/server/data/schemas";
import { setOrganizer } from "./records-admin";

/**
 * 종료·취소 스터디의 주최자는 기록 정정이라 통합 명부 전원(탈퇴자·옛 회원
 * 포함)에서 고른다(snumps-webpage/D-000044·054). 모집·진행 스터디는 기존
 * 규칙(운영 명단의 비탈퇴 회원)만. 어느 쪽이든 handOver로 쓴다 — 참가자에
 * 넣고 관리자 변경 이력을 남긴다.
 */

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

const study = (id: string, status: Study["status"]): Study => ({
  id,
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
  status,
  sourceRequestId: null,
});

const codeOf = (e: unknown) => (e instanceof AppError ? e.code : String(e));
const row = async (id: string) =>
  (await getTable("studies")).find((s) => s.id === id)!;

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "legacy-members", "studies"])
    await invalidateCache(`table_${t}`);
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [
      member({ id: "m1", name: "주최" }),
      member({ id: "w1", name: "탈퇴", status: "withdrawn" }),
    ],
  });
  await __putRawDoc("table", "legacy-members", {
    schemaVersion: 1,
    rows: [member({ id: "L1", name: "옛회원" })],
  });
  await __putRawDoc("table", "studies", {
    schemaVersion: 1,
    rows: [
      study("fin", "finished"),
      study("can", "cancelled"),
      study("ong", "ongoing"),
      study("rec", "recruiting"),
    ],
  });
});
afterEach(expectTablesValid);

describe("setOrganizer on a closed study", () => {
  it.each([
    ["fin", "L1"],
    ["can", "w1"],
  ])(
    "lets %s take anyone in the merged directory (%s)",
    async (studyId, to) => {
      await setOrganizer(studyId, to, "admin");

      const s = await row(studyId);
      expect(s.organizerIds).toEqual([to]);
      expect(s.participantIds).toEqual(["m1", to]);
      expect(s.transferHistory).toEqual([
        expect.objectContaining({ from: "m1", to, byAdmin: true }),
      ]);
      expect((await __auditRows())[0]).toMatchObject({
        action: "study.set-organizer",
        target_id: studyId,
      });
    },
  );

  it("still refuses an id no directory knows", async () => {
    await expect(setOrganizer("fin", "ghost", "admin")).rejects.toSatisfy(
      (e) => codeOf(e) === "VALIDATION_FAILED",
    );
    expect((await row("fin")).organizerIds).toEqual(["m1"]);
  });
});

describe("setOrganizer on an open study", () => {
  it.each([
    ["ong", "L1"],
    ["rec", "w1"],
  ])("keeps the operating-roster rule: %s refuses %s", async (studyId, to) => {
    await expect(setOrganizer(studyId, to, "admin")).rejects.toSatisfy(
      (e) => codeOf(e) === "VALIDATION_FAILED",
    );
    expect((await row(studyId)).organizerIds).toEqual(["m1"]);
    expect(await __auditRows()).toEqual([]);
  });

  it("refuses a study that does not exist", async () => {
    await expect(setOrganizer("nope", "m1", "admin")).rejects.toSatisfy(
      (e) => codeOf(e) === "NOT_FOUND",
    );
  });
});
