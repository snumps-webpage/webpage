import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const sent = vi.hoisted(
  () => [] as { to: string[]; subject: string; body: string; bcc: boolean }[],
);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
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
import { currentTerm } from "$lib/server/core/semester";
import { emitMailEvent } from "./dispatch";

function seed(over: Partial<Record<string, unknown[]>> = {}) {
  const tables: Record<string, unknown[]> = {
    "mail-rules": [],
    "mail-templates": [],
    members: [],
    registrations: [],
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
    for (const t of [
      "mail-rules",
      "mail-templates",
      "members",
      "registrations",
      "private-info",
    ]) {
      await invalidateCache(`table_${t}`);
    }
    seed();
  });

  it("fires the code default rule when no rows exist", async () => {
    const ok = await emitMailEvent(
      "application.approved",
      { name: "김수학" },
      {
        partyEmail: "new@snu.ac.kr",
      },
    );
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
    await emitMailEvent(
      "application.approved",
      { name: "김수학" },
      {
        partyEmail: "new@snu.ac.kr",
      },
    );
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
    const ok = await emitMailEvent(
      "application.approved",
      { name: "A" },
      {
        partyEmail: "x@snu.ac.kr",
      },
    );
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
    await emitMailEvent(
      "application.approved",
      { name: "김수학" },
      {
        partyEmail: "new@snu.ac.kr",
      },
    );
    expect(sent).toHaveLength(2);
    const custom = sent.find((s) => s.subject === "커스텀 김수학");
    expect(custom?.to).toEqual(["admin@snu.ac.kr"]);
  });

  /**
   * Decision 2026-09-27: all-member announcements go to members registered
   * this term plus alumni — never to someone in the withdrawal grace period,
   * nor to an unregistered non-alumnus, whatever their mail preference.
   */
  it("announces to this term's registered members and alumni only, by bcc", async () => {
    const term = currentTerm();
    const member = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      name: id,
      department: "수리과학부",
      joinedAt: "2024-03-01",
      status: "regular",
      statusChangedAt: "2026-03-01T00:00:00+09:00",
      withdrawal: null,
      isAlumni: false,
      alumniRevoked: false,
      roles: [],
      isAdmin: false,
      publicContact: null,
      project: null,
      legacyMemberId: null,
      sourceRequestId: null,
      ...over,
    });
    const info = (memberId: string, announcements = true) => ({
      id: `p-${memberId}`,
      memberId,
      email: `${memberId}@snu.ac.kr`,
      phone: "",
      studentId: "",
      background: "",
      mailPrefs: { announcements },
      sourceRequestId: null,
    });
    seed({
      members: [
        member("registered"),
        member("alumnus", { isAlumni: true }),
        member("lapsed"),
        member("withdrawing", {
          status: "withdrawn",
          isAlumni: true,
          withdrawal: {
            requestedAt: "2026-09-20T00:00:00+09:00",
            previousStatus: "regular",
            holdBy: null,
            holdAt: null,
          },
        }),
        member("optedout"),
      ],
      registrations: ["registered", "withdrawing", "optedout"].map((id) => ({
        id: `r-${id}`,
        memberId: id,
        term,
        registeredAt: "2026-09-01T00:00:00+09:00",
        sourceRequestId: null,
      })),
      "private-info": [
        info("registered"),
        info("alumnus"),
        info("lapsed"),
        info("withdrawing"),
        info("optedout", false),
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
    expect([...sent[0].to].sort()).toEqual([
      "alumnus@snu.ac.kr",
      "registered@snu.ac.kr",
    ]);
  });

  it("executives fall back to admins when no executive resolves", async () => {
    await emitMailEvent("withdrawal.requested", {
      memberName: "탈퇴자",
      adminUrl: "https://x/admin/members",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["admin@snu.ac.kr"]);
  });

  /**
   * A stored rule's recipient was trusted by cast: a kind the event does not
   * allow was sent to anyway, and an unknown kind threw a TypeError that
   * logged only "failed" (audit LB11-3). Such rows are skipped and named.
   */
  it("skips rule rows whose recipient the event does not allow", async () => {
    const rule = (id: string, recipient: string) => ({
      id,
      event: "application.submitted", // allows admins, executives
      templateKey: "signup-received",
      recipient,
      enabled: true,
      updatedAt: "2026-08-31T00:00:00+09:00",
    });
    seed({
      "mail-rules": [
        rule("r1", "admins"),
        rule("r2", "party"),
        rule("r3", "everyone"),
      ],
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await emitMailEvent(
        "application.submitted",
        { applicantName: "김수학" },
        { partyEmail: "applicant@snu.ac.kr" },
      );
      expect(sent.map((s) => s.to)).toEqual([["admin@snu.ac.kr"]]);
      const logged = log.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("r2");
      expect(logged).toContain("r3");
      expect(logged).not.toContain("TypeError");
    } finally {
      log.mockRestore();
    }
  });
});

// A failed read of the admin's mail settings fell back to the code defaults,
// all enabled: a mail the admin turned off went out again, in the old
// wording, with the old chat link. One row that fails the schema fails the
// whole table read, so this was a lasting state, not a blip (audit LB11-2,
// LB13-1). Mail still never blocks the caller — it reports false.
describe("mail settings that cannot be read", () => {
  const broken = { id: "bad" }; // fails the row schema → the read throws

  beforeEach(async () => {
    __reset();
    _resetDataLayerForTests();
    sent.length = 0;
    for (const t of ["mail-rules", "mail-templates", "mail-variables"]) {
      await invalidateCache(`table_${t}`);
    }
    seed();
  });

  const emit = () =>
    emitMailEvent(
      "application.approved",
      { name: "김수학" },
      { partyEmail: "new@snu.ac.kr" },
    );

  it("sends nothing when the rules cannot be read", async () => {
    seed({ "mail-rules": [broken] });
    expect(await emit()).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing when the templates cannot be read", async () => {
    seed({ "mail-templates": [broken] });
    expect(await emit()).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing when the shared variables cannot be read", async () => {
    __putRawDoc("table", "mail-variables", {
      schemaVersion: 1,
      rows: [broken],
    });
    expect(await emit()).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe("the event catalogue is a closed set in the type (audit LB12-1)", () => {
  it("rejects a misspelt event name at compile time", () => {
    // Never called: svelte-check fails if the misspelling type-checks again.
    const typo = () =>
      // @ts-expect-error — "seminar.publishd" is not a MailEventKey
      emitMailEvent("seminar.publishd", {});
    expect(typeof typo).toBe("function");
  });
});
