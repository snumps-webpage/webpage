import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import type { MailBroadcast } from "$lib/server/data/schemas";
import {
  claimBroadcast,
  finishBroadcast,
  findBroadcast,
  recentBroadcasts,
} from "./store";

function row(over: Partial<MailBroadcast> = {}): MailBroadcast {
  return {
    id: "b1",
    messageId: "<m1@example.com>",
    subject: "제목",
    sentBy: "admin",
    startedAt: "2026-10-17T10:00:00+09:00",
    finishedAt: null,
    recipientCount: 0,
    batchesSent: 0,
    batchesFailed: 0,
    status: "sending",
    ...over,
  };
}

async function reset() {
  __reset();
  _resetDataLayerForTests();
  await invalidateCache("table_mail-broadcasts");
}

describe("mail-broadcasts store", () => {
  beforeEach(reset);

  it("claims a new messageId and finds it", async () => {
    expect(await claimBroadcast(row())).toEqual({ ok: true });
    expect((await findBroadcast("<m1@example.com>"))?.id).toBe("b1");
    expect(await findBroadcast("<none>")).toBeNull();
  });

  it("rejects a second claim while sending, sent or partial", async () => {
    for (const status of ["sending", "sent", "partial"] as const) {
      await reset();
      await claimBroadcast(row({ status }));
      const r = await claimBroadcast(row({ id: "b2" }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.existing.id).toBe("b1");
    }
  });

  it("replaces a failed row with the new claim", async () => {
    await claimBroadcast(row({ status: "failed" }));
    expect(await claimBroadcast(row({ id: "b2" }))).toEqual({ ok: true });
    expect((await findBroadcast("<m1@example.com>"))?.id).toBe("b2");
    expect(await recentBroadcasts(10)).toHaveLength(1);
  });

  it("lets exactly one of two concurrent claims win", async () => {
    const results = await Promise.all([
      claimBroadcast(row({ id: "a" })),
      claimBroadcast(row({ id: "b" })),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await recentBroadcasts(10)).toHaveLength(1);
  });

  it("finishBroadcast patches the row", async () => {
    await claimBroadcast(row());
    await finishBroadcast("b1", {
      status: "partial",
      batchesSent: 2,
      batchesFailed: 1,
      recipientCount: 200,
      finishedAt: "2026-10-17T10:05:00+09:00",
    });
    expect(await findBroadcast("<m1@example.com>")).toMatchObject({
      status: "partial",
      batchesSent: 2,
      batchesFailed: 1,
      recipientCount: 200,
      finishedAt: "2026-10-17T10:05:00+09:00",
    });
  });

  it("recentBroadcasts sorts by startedAt descending and limits", async () => {
    const at = (id: string, d: string) =>
      row({
        id,
        messageId: `<${id}>`,
        startedAt: `2026-10-${d}T00:00:00+09:00`,
      });
    await claimBroadcast(at("old", "15"));
    await claimBroadcast(at("new", "17"));
    await claimBroadcast(at("mid", "16"));
    expect((await recentBroadcasts(10)).map((r) => r.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
    expect(await recentBroadcasts(2)).toHaveLength(2);
  });
});
