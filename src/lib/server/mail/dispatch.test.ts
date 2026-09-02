import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const sent = vi.hoisted(
  () => [] as { to: string[]; subject: string; body: string; bcc: boolean }[],
);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));
vi.mock("./client", () => ({
  getAdminAccessToken: async () => "token",
  dispatchEmail: async (
    _t: string,
    to: string[],
    subject: string,
    body: string,
    opts?: { bcc?: boolean },
  ) => {
    sent.push({ to, subject, body, bcc: !!opts?.bcc });
  },
}));

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { emitMailEvent } from "./dispatch";

function seed(over: Partial<Record<string, unknown[]>> = {}) {
  const tables: Record<string, unknown[]> = {
    "mail-rules": [],
    "mail-templates": [],
    members: [],
    "private-info": [],
    ...over,
  };
  for (const [name, rows] of Object.entries(tables)) {
    __putRawDoc("table", name, { schemaVersion: 1, rows });
  }
}

describe("mail dispatcher (S10)", () => {
  beforeEach(async () => {
    __reset();
    _resetDataLayerForTests();
    sent.length = 0;
    testEnv.ADMINS_EMAILS = "admin@snu.ac.kr";
    for (const t of ["mail-rules", "mail-templates", "members", "private-info"]) {
      await invalidateCache(`table_${t}`);
    }
    seed();
  });

  it("fires the code default rule when no rows exist", async () => {
    const ok = await emitMailEvent("application.approved", { name: "김수학" }, {
      partyEmail: "new@snu.ac.kr",
    });
    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["new@snu.ac.kr"]);
    expect(sent[0].subject).toContain("승인");
  });

  it("materialized rules replace the defaults entirely", async () => {
    seed({
      "mail-rules": [
        {
          id: "r1",
          event: "application.approved",
          templateKey: "welcome",
          recipient: "admins", // 당사자 대신 관리자에게만
          enabled: true,
          updatedAt: "2026-08-31T00:00:00+09:00",
        },
      ],
    });
    await emitMailEvent("application.approved", { name: "김수학" }, {
      partyEmail: "new@snu.ac.kr",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["admin@snu.ac.kr"]);
  });

  it("a disabled rule sends nothing", async () => {
    seed({
      "mail-rules": [
        {
          id: "r1",
          event: "application.approved",
          templateKey: "welcome",
          recipient: "party",
          enabled: false,
          updatedAt: "2026-08-31T00:00:00+09:00",
        },
      ],
    });
    const ok = await emitMailEvent("application.approved", { name: "A" }, {
      partyEmail: "x@snu.ac.kr",
    });
    expect(ok).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("attaches a custom template to an event (add without code)", async () => {
    seed({
      "mail-templates": [
        {
          id: "t1",
          key: "custom-abc",
          name: "리마인더",
          subject: "커스텀 {{name}}",
          body: "커스텀 본문",
          enabled: true,
          updatedAt: "2026-08-31T00:00:00+09:00",
        },
      ],
      "mail-rules": [
        {
          id: "r1",
          event: "application.approved",
          templateKey: "welcome",
          recipient: "party",
          enabled: true,
          updatedAt: "2026-08-31T00:00:00+09:00",
        },
        {
          id: "r2",
          event: "application.approved",
          templateKey: "custom-abc",
          recipient: "admins",
          enabled: true,
          updatedAt: "2026-08-31T00:00:00+09:00",
        },
      ],
    });
    await emitMailEvent("application.approved", { name: "김수학" }, {
      partyEmail: "new@snu.ac.kr",
    });
    expect(sent).toHaveLength(2);
    const custom = sent.find((s) => s.subject === "커스텀 김수학");
    expect(custom?.to).toEqual(["admin@snu.ac.kr"]);
  });

  it("opted-in announcement goes bcc and skips opted-out members", async () => {
    seed({
      "private-info": [
        { id: "p1", memberId: "m1", email: "a@snu.ac.kr", phone: "", studentId: "", background: "", mailPrefs: { announcements: true }, sourceRequestId: null },
        { id: "p2", memberId: "m2", email: "b@snu.ac.kr", phone: "", studentId: "", background: "", mailPrefs: { announcements: false }, sourceRequestId: null },
      ],
    });
    await emitMailEvent("seminar.published", {
      title: "T",
      description: "D",
      siteUrl: "https://x",
      optOutUrl: "https://x/opt",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].bcc).toBe(true);
    expect(sent[0].to).toEqual(["a@snu.ac.kr"]);
  });

  it("executives fall back to admins when no executive resolves", async () => {
    await emitMailEvent("withdrawal.requested", {
      memberName: "탈퇴자",
      adminUrl: "https://x/admin/members",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["admin@snu.ac.kr"]);
  });
});
