import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));

const sent: Array<{ recipients: string[]; bcc: boolean; body: string }> = [];
vi.mock("./client", () => ({
  getAdminAccessToken: async () => "token",
  dispatchEmail: async (
    _t: string,
    recipients: string[],
    _s: string,
    body: string,
    opts?: { bcc?: boolean },
  ) => {
    sent.push({ recipients, bcc: !!opts?.bcc, body });
  },
}));

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { chunk, sendSeminarAnnouncement } from "./announcements";

async function seedInfo(email: string, announcements: boolean) {
  await mutate("private-info", (rows) => [
    ...rows,
    {
      id: newId(), memberId: newId(), email, phone: "", background: "",
      mailPrefs: { announcements }, sourceRequestId: null,
    },
  ]);
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  sent.length = 0;
  await invalidateCache("table_private-info");
});

describe("seminar announcement (SEM-04 / BE-45)", () => {
  it("sends Bcc-only to opted-in members, deduped, with the opt-out link", async () => {
    await seedInfo("a@snu.ac.kr", true);
    await seedInfo("A@snu.ac.kr", true); // duplicate after normalization
    await seedInfo("optout@snu.ac.kr", false);

    const ok = await sendSeminarAnnouncement({ title: "정수론", description: "설명" });

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].bcc).toBe(true); // never a To: list
    expect(sent[0].recipients).toEqual(["a@snu.ac.kr"]);
    expect(sent[0].body).toContain("/settings/notifications");
  });

  it("splits large recipient lists into batches", async () => {
    for (let i = 0; i < 170; i++) await seedInfo(`m${i}@snu.ac.kr`, true);
    await sendSeminarAnnouncement({ title: "T", description: "D" });
    expect(sent.length).toBe(3); // 80 + 80 + 10
    expect(sent.every((s) => s.bcc)).toBe(true);
  });

  it("chunk splits exactly", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
