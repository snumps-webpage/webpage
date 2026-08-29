import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));

import { __auditRows, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { AppError } from "$lib/server/core/errors";
import type { Member, Study } from "$lib/server/data/schemas";
import { cancelWithdrawal, getWithdrawalState, requestWithdrawal } from "./withdrawal";

const makeMember = (over: Partial<Member> = {}): Member => ({
  id: newId(),
  name: "홍길동",
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "regular",
  statusChangedAt: nowKstIso(),
  withdrawal: null,
  isAlumni: true,
  alumniRevoked: false,
  roles: [],
  isAdmin: false,
  publicContact: null,
  project: null,
  sourceRequestId: null,
  ...over,
});

const ok = (name: string) => ({ ackInfo: true, ackDataPolicy: true, confirmName: name });

async function seed(over: Partial<Member> = {}): Promise<Member> {
  const m = makeMember(over);
  await mutate("members", (rows) => [...rows, m]);
  return m;
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "studies"]) await invalidateCache(`table_${t}`);
});

describe("requestWithdrawal — triple confirmation (MEM-07)", () => {
  it("refuses when any of the three factors is missing or wrong", async () => {
    const m = await seed();
    for (const bad of [
      { ...ok(m.name), ackInfo: false },
      { ...ok(m.name), ackDataPolicy: false },
      { ...ok("다른이름") },
    ]) {
      await expect(requestWithdrawal(m.id, bad)).rejects.toSatisfy(
        (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
      );
    }
    expect((await getTable("members"))[0].status).toBe("regular");
  });

  it("withdraws with previousStatus preserved and audits the destruction trigger", async () => {
    const m = await seed({ status: "associate" });
    const auditBefore = __auditRows().length;

    await requestWithdrawal(m.id, ok(m.name));

    const updated = (await getTable("members"))[0];
    expect(updated.status).toBe("withdrawn");
    expect(updated.withdrawal?.previousStatus).toBe("associate");
    expect(updated.withdrawal?.holdBy).toBeNull();
    expect(__auditRows().length).toBe(auditBefore + 1);

    const state = await getWithdrawalState(m.id);
    expect(state).not.toBeNull();
    expect(new Date(state!.deleteAfter).getTime()).toBeGreaterThan(Date.now());
  });

  it("blocks an active organizer until the study is handed over", async () => {
    const m = await seed();
    const study: Study = {
      id: newId(), title: "해석학", semester: "26-2", textbook: "", description: "",
      note: "", organizerIds: [m.id], participantIds: [m.id], pendingParticipantIds: [],
      pendingTransfer: null, schedule: [], transferHistory: [], photos: [],
      status: "ongoing", sourceRequestId: null,
    };
    await mutate("studies", (rows) => [...rows, study]);

    await expect(requestWithdrawal(m.id, ok(m.name))).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );

    // A FINISHED study no longer blocks.
    await mutate("studies", (rows) =>
      rows.map((s) => ({ ...s, status: "finished" as const })),
    );
    await requestWithdrawal(m.id, ok(m.name));
    expect((await getTable("members"))[0].status).toBe("withdrawn");
  });

  it("double request is CONFLICT", async () => {
    const m = await seed();
    await requestWithdrawal(m.id, ok(m.name));
    await expect(requestWithdrawal(m.id, ok(m.name))).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });
});

describe("cancelWithdrawal", () => {
  it("restores the pre-withdrawal status — with no deadline (anonymization deferred)", async () => {
    const m = await seed({ status: "associate" });
    await requestWithdrawal(m.id, ok(m.name));

    // Simulate the grace deadline passing long ago: cancellation still works.
    await mutate("members", (rows) =>
      rows.map((row) => ({
        ...row,
        withdrawal: row.withdrawal
          ? { ...row.withdrawal, requestedAt: "2020-01-01T00:00:00+09:00" }
          : null,
      })),
    );

    await cancelWithdrawal(m.id);
    const updated = (await getTable("members"))[0];
    expect(updated.status).toBe("associate");
    expect(updated.withdrawal).toBeNull();
  });

  it("cancelling without a request is NOT_FOUND", async () => {
    const m = await seed();
    await expect(cancelWithdrawal(m.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "NOT_FOUND",
    );
  });
});
