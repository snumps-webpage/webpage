import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock(
  "$lib/server/data/storage",
  () => import("$lib/server/data/storage-memory"),
);
const override = vi.hoisted(() => ({ emails: null as string[] | null }));
vi.mock("../dispatch", async (orig) => {
  const actual = await orig<typeof import("../dispatch")>();
  return {
    ...actual,
    optedInMemberEmails: async () =>
      override.emails ?? actual.optedInMemberEmails(),
  };
});
const finish = vi.hoisted(() => ({ fail: false }));
vi.mock("./store", async (orig) => {
  const actual = await orig<typeof import("./store")>();
  return {
    ...actual,
    finishBroadcast: (...args: Parameters<typeof actual.finishBroadcast>) => {
      if (finish.fail) throw new Error("db down");
      return actual.finishBroadcast(...args);
    },
  };
});
const token = vi.hoisted(() => ({ fail: false }));
vi.mock("../client", async (orig) => ({
  ...(await orig<typeof import("../client")>()),
  getAdminAccessToken: async () => {
    if (token.fail) throw new Error("no token");
    return "token";
  },
}));

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import {
  __exists,
  __reset as resetStorage,
  __stage,
  __stageBytes,
} from "$lib/server/data/storage-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { currentTerm } from "$lib/server/core/semester";
import {
  BROADCAST_PREFIX,
  previewBroadcast,
  sendBroadcast,
  sendBroadcastTest,
} from "./send";

const KEY = `${BROADCAST_PREFIX}a.eml`;

function eml(messageId = "<m1@example.com>") {
  return new TextEncoder().encode(
    [
      "From: S <s@example.com>",
      "Subject: Hello",
      `Message-ID: ${messageId}`,
      "MIME-Version: 1.0",
      'Content-Type: multipart/related; boundary="r1"',
      "",
      "--r1",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      '<p>Hi</p><img src="cid:img1@x">',
      "--r1",
      "Content-Type: image/png",
      "Content-ID: <img1@x>",
      "Content-Disposition: inline",
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgo=",
      "--r1--",
      "",
    ].join("\r\n"),
  );
}

/** n명의 등록 회원. `emails`를 주면 그 주소를 쓴다. */
function seedMembers(n: number, emails?: string[]) {
  const term = currentTerm();
  const ids = Array.from({ length: n }, (_, i) => `m${i}`);
  __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: ids.map((id) => ({
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
      alumniRevocationReason: null,
      project: null,
      legacyMemberId: null,
      sourceRequestId: null,
    })),
  });
  __putRawDoc("table", "registrations", {
    schemaVersion: 1,
    rows: ids.map((id) => ({
      id: `r-${id}`,
      memberId: id,
      term,
      registeredAt: "2026-09-01T00:00:00+09:00",
      sourceRequestId: null,
    })),
  });
  __putRawDoc("table", "private-info", {
    schemaVersion: 1,
    rows: ids.map((id, i) => ({
      id: `p-${id}`,
      memberId: id,
      email: emails?.[i] ?? `u${i}@example.com`,
      phone: "",
      studentId: "",
      background: "",
      mailPrefs: { announcements: true },
      sourceRequestId: null,
    })),
  });
}

type Call = { body: Buffer };
let calls: Call[];
let responses: (() => Response)[];

function stubFetch() {
  vi.stubGlobal("fetch", async (_url: string, init: { body: Buffer }) => {
    calls.push({ body: init.body });
    const next = responses.shift();
    return next ? next() : new Response("{}", { status: 200 });
  });
}
const gmailError = (status: number, reason: string) => () =>
  new Response(JSON.stringify({ error: { errors: [{ reason }] } }), {
    status,
  });

describe("broadcast send flow", () => {
  beforeEach(async () => {
    __reset();
    resetStorage();
    _resetDataLayerForTests();
    for (const t of [
      "mail-broadcasts",
      "members",
      "registrations",
      "private-info",
    ])
      await invalidateCache(`table_${t}`);
    testEnv.SITE_ORIGIN = "https://site.test";
    token.fail = false;
    override.emails = null;
    finish.fail = false;
    calls = [];
    responses = [];
    stubFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    __stageBytes(KEY, eml());
  });

  it("sends 170 recipients in 3 batches and removes the staged file", async () => {
    seedMembers(170);
    const r = await sendBroadcast(KEY, "admin");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.status).toBe("sent");
    expect(r.row.batchesSent).toBe(3);
    expect(r.row.recipientCount).toBe(170);
    expect(calls).toHaveLength(3);
    expect(__exists("staging", KEY)).toBe(false);
    // 발송본은 cid 유지
    expect(calls[0].body.toString()).toContain("cid:img1@x");
  });

  it("is partial when the second batch fails", async () => {
    seedMembers(170);
    responses = [
      () => new Response("{}", { status: 200 }),
      gmailError(400, "invalidArgument"),
    ];
    const r = await sendBroadcast(KEY, "admin");
    if (!r.ok) throw new Error("expected ok");
    expect(r.row.status).toBe("partial");
    expect(r.row.batchesSent).toBe(2);
    expect(r.row.batchesFailed).toBe(1);
    expect(calls).toHaveLength(3);
  });

  it("stops on a quota error and records failed", async () => {
    seedMembers(170);
    responses = [gmailError(403, "dailyLimitExceeded")];
    const r = await sendBroadcast(KEY, "admin");
    if (!r.ok) throw new Error("expected ok");
    expect(r.row.status).toBe("failed");
    expect(r.row.batchesSent).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it("records failed when the token cannot be obtained", async () => {
    seedMembers(5);
    token.fail = true;
    const r = await sendBroadcast(KEY, "admin");
    if (!r.ok) throw new Error("expected ok");
    expect(r.row.status).toBe("failed");
    expect(calls).toHaveLength(0);
  });

  it("rejects the same file twice, allows resend after failed", async () => {
    seedMembers(5);
    responses = [gmailError(400, "invalidArgument")];
    const first = await sendBroadcast(KEY, "admin");
    if (!first.ok) throw new Error("expected ok");
    expect(first.row.status).toBe("failed");
    __stageBytes(KEY, eml());
    const second = await sendBroadcast(KEY, "admin");
    expect(second.ok).toBe(true);
    __stageBytes(KEY, eml());
    const third = await sendBroadcast(KEY, "admin");
    expect(third).toMatchObject({ ok: false, problem: "duplicate" });
    if (!third.ok) expect(third.existing?.status).toBe("sent");
  });

  it("lets only one of two concurrent sends through", async () => {
    seedMembers(170);
    const [a, b] = await Promise.all([
      sendBroadcast(KEY, "admin"),
      sendBroadcast(KEY, "admin"),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(calls).toHaveLength(3);
  });

  it("returns no-recipients without claiming", async () => {
    seedMembers(0);
    expect(await sendBroadcast(KEY, "admin")).toEqual({
      ok: false,
      problem: "no-recipients",
    });
    const p = await previewBroadcast(KEY);
    expect(p.ok && p.preview.existing).toBeNull();
  });

  it("leaves out malformed addresses and reports the count", async () => {
    // 저장소 스키마가 이상한 주소를 막으므로 수신자 해석을 직접 바꿔 시험함
    override.emails = [
      "ok@example.com",
      "a@b.com, c@d.com",
      "also@example.com",
    ];
    const r = await sendBroadcast(KEY, "admin");
    if (!r.ok) throw new Error("expected ok");
    expect(r.skipped).toBe(1);
    expect(r.row.recipientCount).toBe(2);
  });

  it("rejects a bad prefix, missing, oversize and broken files", async () => {
    seedMembers(2);
    expect(await previewBroadcast("other/a.eml")).toEqual({
      ok: false,
      problem: "bad-key",
    });
    expect(await previewBroadcast(`${BROADCAST_PREFIX}none.eml`)).toEqual({
      ok: false,
      problem: "missing",
    });
    __stage(`${BROADCAST_PREFIX}big.eml`, 25_000_001, "message/rfc822");
    expect(await previewBroadcast(`${BROADCAST_PREFIX}big.eml`)).toEqual({
      ok: false,
      problem: "too-large",
    });
    __stageBytes(
      `${BROADCAST_PREFIX}bad.eml`,
      new TextEncoder().encode("Subject: x\r\n\r\n"),
    );
    const bad = await previewBroadcast(`${BROADCAST_PREFIX}bad.eml`);
    expect(bad).toEqual({ ok: false, problem: "no-body" });
    expect(calls).toHaveLength(0);
  });

  it("replaces cid:img1 and cid:img10 each with its own data URI", async () => {
    seedMembers(2);
    const png = (cid: string, b64: string) =>
      [
        "--r1",
        "Content-Type: image/png",
        `Content-ID: <${cid}>`,
        "Content-Disposition: inline",
        "Content-Transfer-Encoding: base64",
        "",
        b64,
      ].join("\r\n");
    const raw = [
      "Subject: Hello",
      "Message-ID: <m2@example.com>",
      "MIME-Version: 1.0",
      'Content-Type: multipart/related; boundary="r1"',
      "",
      "--r1",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      '<img src="cid:img1"><img src="cid:img10">',
      png("img1", "AAAA"),
      png("img10", "BBBB"),
      "--r1--",
      "",
    ].join("\r\n");
    __stageBytes(KEY, new TextEncoder().encode(raw));
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toContain('src="data:image/png;base64,AAAA"');
    expect(p.preview.html).toContain('src="data:image/png;base64,BBBB"');
    expect(p.preview.html).not.toContain("cid:");
  });

  it("keeps cid when the attachment mime type is not a plain type", async () => {
    seedMembers(2);
    const raw = [
      "Subject: Hello",
      "Message-ID: <m3@example.com>",
      "MIME-Version: 1.0",
      'Content-Type: multipart/related; boundary="r1"',
      "",
      "--r1",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      '<img src="cid:img1">',
      "--r1",
      "Content-Type: image/png<x>",
      "Content-ID: <img1>",
      "Content-Disposition: inline",
      "Content-Transfer-Encoding: base64",
      "",
      "AAAA",
      "--r1--",
      "",
    ].join("\r\n");
    __stageBytes(KEY, new TextEncoder().encode(raw));
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toContain("cid:img1");
    expect(p.preview.html).not.toContain("data:");
  });

  it("logs and propagates when the result cannot be recorded", async () => {
    seedMembers(2);
    finish.fail = true;
    await expect(sendBroadcast(KEY, "admin")).rejects.toThrow("db down");
    expect(console.error).toHaveBeenCalledWith(
      "[Broadcast] could not record the result",
      "Error",
    );
  });

  it("preview swaps cid for a data URI", async () => {
    seedMembers(2);
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toContain("data:image/png;base64,");
    expect(p.preview.html).not.toContain("cid:");
    expect(p.preview.recipientCount).toBe(2);
    expect(p.preview.subject).toBe("Hello");
    expect(p.preview.attachments[0]).toMatchObject({ inline: true });
  });

  it("test send goes to one address and records nothing", async () => {
    seedMembers(2);
    expect(await sendBroadcastTest(KEY, "me@example.com")).toEqual({
      ok: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.toString()).toContain("me@example.com");
    expect(await sendBroadcastTest(KEY, "a@b.com, c@d.com")).toEqual({
      ok: false,
      problem: "send-failed",
    });
    expect(calls).toHaveLength(1);
    const p = await previewBroadcast(KEY);
    expect(p.ok && p.preview.existing).toBeNull();
    expect(__exists("staging", KEY)).toBe(true);
  });
});
