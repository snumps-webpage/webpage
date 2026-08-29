import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));

import { __auditRows, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso, toKstIso } from "$lib/server/core/time";
import { AppError } from "$lib/server/core/errors";
import type { Member } from "$lib/server/data/schemas";
import {
  getWithdrawnPending,
  holdWithdrawal,
  releaseWithdrawalHold,
  revokeAlumni,
  setAdmin,
  setStatus,
} from "./members-admin";
import { setOrganizer } from "./records-admin";

const makeMember = (over: Partial<Member> = {}): Member => ({
  id: newId(),
  name: "회원",
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "associate",
  statusChangedAt: nowKstIso(),
  withdrawal: null,
  isAlumni: false,
  alumniRevoked: false,
  roles: [],
  isAdmin: false,
  publicContact: null,
  project: null,
  sourceRequestId: null,
  ...over,
});

async function seedMember(over: Partial<Member> = {}): Promise<Member> {
  const m = makeMember(over);
  await mutate("members", (rows) => [...rows, m]);
  return m;
}

const auditKeyCount = () => __auditRows().length;

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "studies"]) await invalidateCache(`table_${t}`);
});

describe("status axis (D4 / §1-1)", () => {
  it("promotion to regular grants alumni automatically", async () => {
    const m = await seedMember();
    await setStatus(m.id, "regular", "admin-1");
    const updated = (await getTable("members"))[0];
    expect(updated.status).toBe("regular");
    expect(updated.isAlumni).toBe(true);
  });

  it("revocation is sticky — re-promotion must NOT restore alumni", async () => {
    const m = await seedMember({ status: "regular", isAlumni: true });
    await revokeAlumni(m.id, "유고 처분", "admin-1");
    await setStatus(m.id, "associate", "admin-1");
    await setStatus(m.id, "regular", "admin-1");
    const updated = (await getTable("members"))[0];
    expect(updated.isAlumni).toBe(false);
    expect(updated.alumniRevoked).toBe(true);
  });

  it("revocation without a reason is refused", async () => {
    const m = await seedMember({ status: "regular", isAlumni: true });
    await expect(revokeAlumni(m.id, "  ", "admin-1")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );
  });

  it("audits every status/privilege mutation", async () => {
    const m = await seedMember();
    const before = auditKeyCount();
    await setStatus(m.id, "regular", "admin-1");
    await setAdmin(m.id, true, "admin-1");
    expect(auditKeyCount()).toBe(before + 2);
  });
});

describe("admin flag", () => {
  it("refuses self-revocation — the last admin must not vanish", async () => {
    const admin = await seedMember({ isAdmin: true });
    await expect(setAdmin(admin.id, false, admin.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
    await setAdmin(admin.id, true, admin.id); // self no-op grant is fine
  });
});

describe("withdrawal hold (ADM-17)", () => {
  const withdrawn = () =>
    seedMember({
      status: "withdrawn",
      withdrawal: {
        requestedAt: toKstIso(new Date(Date.now() - 10 * 24 * 3600 * 1000)),
        previousStatus: "regular",
        holdBy: null,
        holdAt: null,
      },
    });

  it("hold stops the clock; release restarts it from now", async () => {
    const m = await withdrawn();
    await holdWithdrawal(m.id, "admin-1");
    let updated = (await getTable("members"))[0];
    expect(updated.withdrawal?.holdBy).toBe("admin-1");

    const oldRequestedAt = updated.withdrawal!.requestedAt;
    await releaseWithdrawalHold(m.id, "admin-1");
    updated = (await getTable("members"))[0];
    expect(updated.withdrawal?.holdBy).toBeNull();
    expect(updated.withdrawal!.requestedAt > oldRequestedAt).toBe(true); // re-based clock
  });

  it("hold on a non-withdrawn member is CONFLICT", async () => {
    const m = await seedMember();
    await expect(holdWithdrawal(m.id, "admin-1")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });

  it("dashboard listing shows grace members with deletion date and hold state", async () => {
    await withdrawn();
    const list = await getWithdrawnPending();
    expect(list).toHaveLength(1);
    expect(list[0].held).toBe(false);
    expect(new Date(list[0].deleteAfter).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("admin plenary organizer transfer (§7-4)", () => {
  it("replaces the organizer, clears a pending proposal, records byAdmin history", async () => {
    await seedMember({ id: "m-new" }); // setOrganizer validates the target (review M6)
    const study = {
      id: newId(), title: "해석학", semester: "26-2", textbook: "", description: "",
      note: "", organizerIds: ["m-old"], participantIds: ["m-old"],
      pendingParticipantIds: [],
      pendingTransfer: { toMemberId: "m-elsewhere", requestedAt: nowKstIso() },
      schedule: [], transferHistory: [], photos: [],
      status: "ongoing" as const, sourceRequestId: null,
    };
    await mutate("studies", (rows) => [...rows, study]);

    await setOrganizer(study.id, "m-new", "admin-1");

    const updated = (await getTable("studies"))[0];
    expect(updated.organizerIds).toEqual(["m-new"]);
    expect(updated.pendingTransfer).toBeNull(); // stale proposal cannot undo this later
    expect(updated.participantIds).toContain("m-new");
    expect(updated.transferHistory.at(-1)).toMatchObject({
      from: "m-old",
      to: "m-new",
      byAdmin: true,
    });
  });
});
