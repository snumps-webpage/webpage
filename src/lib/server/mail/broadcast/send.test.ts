import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
const sign = vi.hoisted(() => ({ failOn: null as string | null }));
vi.mock("$lib/server/data/storage", async () => {
  const actual = await import("$lib/server/data/storage-memory");
  return {
    ...actual,
    createSignedStagedUrl: async (path: string, s: number) => {
      if (sign.failOn && path.includes(sign.failOn))
        throw new Error("sign failed");
      return actual.createSignedStagedUrl(path, s);
    },
  };
});
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
  listStaged,
} from "$lib/server/data/storage-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { currentTerm } from "$lib/server/core/semester";
import {
  BROADCAST_PREFIX,
  previewBroadcast,
  sendBroadcast,
  sendBroadcastTest,
  previewImages,
  saveDraft,
} from "./send";
import { draftHtmlPath, readDraft } from "./draft";
import type { ParsedMail } from "./parse";

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

/** 여러 내장 이미지를 가진 multipart/related eml. */
function emlWith(
  html: string,
  parts: { cid: string; mime?: string; b64?: string }[],
): Uint8Array {
  const img = (p: { cid: string; mime?: string; b64?: string }) =>
    [
      "--r1",
      `Content-Type: ${p.mime ?? "image/png"}`,
      `Content-ID: <${p.cid}>`,
      "Content-Disposition: inline",
      "Content-Transfer-Encoding: base64",
      "",
      p.b64 ?? "AAAA",
    ].join("\r\n");
  return new TextEncoder().encode(
    [
      "Subject: Hello",
      "Message-ID: <m2@example.com>",
      "MIME-Version: 1.0",
      'Content-Type: multipart/related; boundary="r1"',
      "",
      "--r1",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      html,
      ...parts.map(img),
      "--r1--",
      "",
    ].join("\r\n"),
  );
}
/** text/plain 본문을 가진 alternative eml. html이 null이면 text만. */
function emlAlt(html: string | null, text: string): Uint8Array {
  return new TextEncoder().encode(
    html === null
      ? [
          "Subject: Hello",
          "Message-ID: <m4@example.com>",
          "MIME-Version: 1.0",
          'Content-Type: text/plain; charset="UTF-8"',
          "",
          text,
          "",
        ].join("\r\n")
      : [
          "Subject: Hello",
          "Message-ID: <m4@example.com>",
          "MIME-Version: 1.0",
          'Content-Type: multipart/alternative; boundary="a1"',
          "",
          "--a1",
          'Content-Type: text/plain; charset="UTF-8"',
          "",
          text,
          "--a1",
          'Content-Type: text/html; charset="UTF-8"',
          "",
          html,
          "--a1--",
          "",
        ].join("\r\n"),
  );
}
const PV = "pending/broadcast-eml/a/preview/";
const stagedList = async () =>
  (await listStaged(`${BROADCAST_PREFIX}a/preview`)).map((f) => f.name);

describe("broadcast send flow", () => {
  beforeEach(async () => {
    __reset();
    resetStorage();
    _resetDataLayerForTests();
    for (const t of [
      "mail-broadcasts",
      "mail-broadcast-drafts",
      "members",
      "registrations",
      "private-info",
    ])
      await invalidateCache(`table_${t}`);
    testEnv.SITE_ORIGIN = "https://site.test";
    token.fail = false;
    override.emails = null;
    finish.fail = false;
    sign.failOn = null;
    calls = [];
    responses = [];
    stubFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    __stageBytes(KEY, eml());
  });

  it("sends 900 recipients in 3 batches and removes the staged file", async () => {
    seedMembers(900);
    const r = await sendBroadcast(KEY, "admin");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.status).toBe("sent");
    expect(r.row.batchesSent).toBe(3);
    expect(r.row.recipientCount).toBe(900);
    expect(calls).toHaveLength(3);
    expect(__exists("staging", KEY)).toBe(false);
    // 발송본은 cid 유지
    expect(calls[0].body.toString()).toContain("cid:img1@x");
  });

  it("is partial when the second batch fails", async () => {
    seedMembers(900);
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
    seedMembers(900);
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
    seedMembers(900);
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

  it("signs only referenced images; img1 and img10 each get their own URL", async () => {
    seedMembers(2);
    __stageBytes(
      KEY,
      emlWith('<img src="cid:img1"><img src="cid:img10">', [
        { cid: "img1", b64: "AAAA" },
        { cid: "img10", mime: "image/jpeg", b64: "BBBB" },
        { cid: "unused", b64: "CCCC" },
      ]),
    );
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.htmlOmitted).toBe(false);
    expect(p.preview.html).toContain(
      `src="https://memory.test/staged/${PV}1.png?exp=600"`,
    );
    expect(p.preview.html).toContain(
      `src="https://memory.test/staged/${PV}2.jpg?exp=600"`,
    );
    expect(p.preview.html).not.toContain("cid:");
    expect(p.preview.html).not.toContain("data:");
    expect(await stagedList()).toEqual(["1.png", "2.jpg"]);
  });

  it("stores nothing for an unreferenced image or an unsafe mime type", async () => {
    seedMembers(2);
    __stageBytes(
      KEY,
      emlWith('<img src="cid:img1">', [
        { cid: "img1", mime: "image/png<x>" },
        { cid: "other" },
      ]),
    );
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toContain("cid:img1");
    expect(p.preview.html).not.toContain("data:");
    expect(await stagedList()).toEqual([]);
  });

  it("uses the bin extension for a plain mime type outside the table", async () => {
    seedMembers(2);
    __stageBytes(
      KEY,
      emlWith('<img src="cid:img1">', [{ cid: "img1", mime: "image/x-weird" }]),
    );
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toContain(`${PV}1.bin`);
  });

  it("leaves cid on only the image whose signing failed, without logging names", async () => {
    seedMembers(2);
    sign.failOn = "/1.png";
    __stageBytes(
      KEY,
      emlWith('<img src="cid:img1"><img src="cid:img2">', [
        { cid: "img1" },
        { cid: "img2" },
      ]),
    );
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toContain('src="cid:img1"');
    expect(p.preview.html).toContain(`${PV}2.png`);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("1 preview image(s)");
    expect(logged).not.toContain("img1");
  });

  it("omits the html when the substituted html exceeds 3,000,000 bytes", async () => {
    seedMembers(2);
    __stageBytes(
      KEY,
      emlWith(`<p>${"가".repeat(1_100_000)}</p><img src="cid:img1">`, [
        { cid: "img1" },
      ]),
    );
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toBeNull();
    expect(p.preview.htmlOmitted).toBe(true);
    expect(p.preview.text.length).toBeGreaterThan(0);
  });

  it("omits the html when html+text exceed the budget together", async () => {
    seedMembers(2);
    const big = "a".repeat(2_900_000);
    __stageBytes(KEY, emlAlt(`<p>${big}</p>`, big));
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.htmlOmitted).toBe(true);
    expect(p.preview.html).toBeNull();
    expect(p.preview.textTruncated).toBe(false);
  });

  it("truncates a text body over the budget at a character boundary", async () => {
    seedMembers(2);
    const big = "가".repeat(1_200_000); // 3.6MB
    __stageBytes(KEY, emlAlt(null, big));
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.textTruncated).toBe(true);
    expect(Buffer.byteLength(p.preview.text, "utf8")).toBeLessThanOrEqual(
      3_000_000,
    );
    expect(p.preview.text).not.toContain("\uFFFD");
    expect(p.preview.text.startsWith("가")).toBe(true);
  });

  it("cuts mid-character safely for 4-byte characters", async () => {
    seedMembers(2);
    // 4-byte emoji, offset by one ASCII byte so the 3,000,000 cut lands inside one
    const big = "a" + "😀".repeat(800_000); // 3.2MB
    __stageBytes(KEY, emlAlt(null, big));
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.textTruncated).toBe(true);
    expect(Buffer.byteLength(p.preview.text, "utf8")).toBeLessThanOrEqual(
      3_000_000,
    );
    expect(p.preview.text).not.toContain("�");
    expect(p.preview.text.endsWith("😀")).toBe(true);
  });

  it("rejects keys with .. segments, backslashes or control characters", async () => {
    for (const k of [
      `${BROADCAST_PREFIX}../x.eml`,
      `${BROADCAST_PREFIX}a/../../b.eml`,
      `${BROADCAST_PREFIX}a\\b.eml`,
      `${BROADCAST_PREFIX}a\nb.eml`,
    ])
      expect(await previewBroadcast(k)).toEqual({
        ok: false,
        problem: "bad-key",
      });
  });

  it("does not store or replace an SVG image (scriptable when opened directly)", async () => {
    seedMembers(2);
    __stageBytes(
      KEY,
      emlWith('<img src="cid:img1">', [{ cid: "img1", mime: "image/svg+xml" }]),
    );
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toContain("cid:img1");
    expect(await stagedList()).toEqual([]);
  });

  it("does not store or replace a non-image cid attachment", async () => {
    seedMembers(2);
    __stageBytes(
      KEY,
      emlWith('<img src="cid:img1">', [{ cid: "img1", mime: "text/html" }]),
    );
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toContain("cid:img1");
    expect(await stagedList()).toEqual([]);
  });

  it("removes the preview objects together with the eml after sending", async () => {
    seedMembers(2);
    const p = await previewBroadcast(KEY);
    expect(p.ok).toBe(true);
    expect(await stagedList()).toHaveLength(1);
    const r = await sendBroadcast(KEY, "admin");
    expect(r.ok).toBe(true);
    expect(__exists("staging", KEY)).toBe(false);
    expect(await stagedList()).toEqual([]);
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

  it("preview swaps cid for a signed staging URL", async () => {
    seedMembers(2);
    const p = await previewBroadcast(KEY);
    if (!p.ok) throw new Error("expected ok");
    expect(p.preview.html).toContain("https://memory.test/staged/");
    expect(p.preview.html).not.toContain("cid:");
    expect(p.preview.html).not.toContain("data:");
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

  describe("drafts", () => {
    /** 사진 2장(img1·img2)과 일반 첨부 2개(f0.txt·f1.txt)가 있는 eml. */
    function emlDraftSrc(): Uint8Array {
      const img = (cid: string) =>
        [
          "--r1",
          "Content-Type: image/png",
          `Content-ID: <${cid}>`,
          "Content-Disposition: inline",
          "Content-Transfer-Encoding: base64",
          "",
          "AAAA",
        ].join("\r\n");
      const file = (name: string) =>
        [
          "--r1",
          `Content-Type: text/plain; name="${name}"`,
          `Content-Disposition: attachment; filename="${name}"`,
          "Content-Transfer-Encoding: base64",
          "",
          "QUJD",
        ].join("\r\n");
      return new TextEncoder().encode(
        [
          "Subject: Original",
          "Message-ID: <m9@example.com>",
          "MIME-Version: 1.0",
          'Content-Type: multipart/mixed; boundary="r1"',
          "",
          "--r1",
          'Content-Type: text/html; charset="UTF-8"',
          "",
          '<p>Orig</p><img src="cid:img1"><img src="cid:img2">',
          img("img1"),
          img("img2"),
          file("f0.txt"),
          file("f1.txt"),
          "--r1--",
          "",
        ].join("\r\n"),
      );
    }
    const url = (n: number, ext = "png") =>
      `https://memory.test/staged/${PV}${n}.${ext}?exp=600`;
    const input = (over: Partial<Parameters<typeof saveDraft>[1]> = {}) => ({
      subject: "Edited subject",
      html: `<p>EditedBody</p><img src="${url(1)}">`,
      removedAttachments: [] as number[],
      ...over,
    });
    const count = (hay: string, needle: string) => hay.split(needle).length - 1;
    const FOOTER_URL = "https://site.test/settings/notifications";

    beforeEach(() => {
      seedMembers(2);
      __stageBytes(KEY, emlDraftSrc());
    });

    it("sends the draft: no signed urls, cid kept, footer once, dropped photo and removed file left out", async () => {
      await sendBroadcastTest(KEY, "me@example.com");
      const baseline = calls[0].body.toString();
      expect(baseline).toContain("f0.txt");
      expect(baseline).toContain("img2");
      const footers = count(baseline, FOOTER_URL);
      expect(footers).toBeGreaterThan(0);

      const saved = await saveDraft(
        KEY,
        input({ removedAttachments: [2] }),
        "admin",
      );
      expect(saved.ok).toBe(true);
      calls = [];
      expect(await sendBroadcastTest(KEY, "me@example.com")).toEqual({
        ok: true,
      });
      const raw = calls[0].body.toString();
      expect(raw).toContain("EditedBody");
      expect(raw).not.toContain("memory.test");
      expect(raw).toContain("cid:img1");
      expect(raw).not.toContain("img2");
      expect(raw).not.toContain("f0.txt");
      expect(raw).toContain("f1.txt");
      expect(count(raw, FOOTER_URL)).toBe(footers);
      expect(raw).not.toContain("Orig</p>");
    });

    it("stores a sanitized draft and sends without script", async () => {
      const r = await saveDraft(
        KEY,
        input({ html: "<p>Safe</p><script>alert(1)</script>" }),
        "admin",
      );
      expect(r.ok).toBe(true);
      const d = await readDraft(KEY);
      expect(d?.html).toContain("Safe");
      expect(d?.html).not.toContain("script");
      expect(d?.html).not.toContain("alert");
      expect(d?.row).toMatchObject({
        subject: "Edited subject",
        savedBy: "admin",
        messageId: expect.stringContaining("m9@example.com"),
      });
      // 저장 뒤 파일이 바뀌어도 발송 직전에 다시 정화함
      __stageBytes(
        draftHtmlPath(KEY),
        new TextEncoder().encode("<p>Late</p><script>evil()</script>"),
      );
      await sendBroadcastTest(KEY, "me@example.com");
      const raw = calls[0].body.toString();
      expect(raw).toContain("Late");
      expect(raw).not.toContain("evil");
    });

    it("rejects an empty subject, an empty body and bad indexes without writing", async () => {
      const problem = async (over: Parameters<typeof input>[0]) => {
        const r = await saveDraft(KEY, input(over), "admin");
        return r.ok ? "ok" : r.problem;
      };
      expect(await problem({ subject: "  \t" })).toBe("no-subject");
      expect(await problem({ html: "<p> &nbsp; </p>" })).toBe("no-body");
      expect(await problem({ html: "<script>x</script>" })).toBe("no-body");
      for (const bad of [[-1], [1.5], [4], [99], [0, 0], [Number.NaN]])
        expect(await problem({ removedAttachments: bad })).toBe("bad-input");
      expect(await problem({ html: 5 as unknown as string })).toBe("bad-input");
      expect(await readDraft(KEY)).toBeNull();
    });

    it("accepts a body made only of an image", async () => {
      const r = await saveDraft(
        KEY,
        input({ html: `<img src="${url(1)}">` }),
        "admin",
      );
      expect(r.ok).toBe(true);
    });

    it("applies the 3MB budget in UTF-8 bytes", async () => {
      // 글자 수는 상한 아래지만 바이트는 위
      const over = `<p>${"한".repeat(1_000_000)}</p>`;
      expect(over.length).toBeLessThan(3_000_000);
      expect(await saveDraft(KEY, input({ html: over }), "admin")).toEqual({
        ok: false,
        problem: "too-large-draft",
      });
      const ok = `<p>${"a".repeat(2_900_000)}</p>`;
      expect((await saveDraft(KEY, input({ html: ok }), "admin")).ok).toBe(
        true,
      );
    });

    it("rejects a draft that sanitizing grows past the budget", async () => {
      // `&` 하나가 `&amp;`로 다섯 배가 됨
      const grows = `<p>${"&".repeat(1_000_000)}</p>`;
      expect(Buffer.byteLength(grows, "utf8")).toBeLessThan(3_000_000);
      expect(await saveDraft(KEY, input({ html: grows }), "admin")).toEqual({
        ok: false,
        problem: "too-large-draft",
      });
      expect(await readDraft(KEY)).toBeNull();
    });

    it("keeps a Content-ID file the original body never referenced (D-000200)", async () => {
      // f0.txt에 Content-ID를 붙인 원본 — 본문은 참조하지 않음
      const src = new TextDecoder()
        .decode(emlDraftSrc())
        .replace(
          'Content-Disposition: attachment; filename="f0.txt"',
          'Content-ID: <file0>\r\nContent-Disposition: attachment; filename="f0.txt"',
        );
      __stageBytes(KEY, new TextEncoder().encode(src));
      const p = await previewBroadcast(KEY);
      if (!p.ok) throw new Error("expected ok");
      expect(p.preview.attachments.map((a) => a.inBody)).toEqual([
        true,
        true,
        false,
        false,
      ]);
      await saveDraft(KEY, input(), "admin");
      await sendBroadcastTest(KEY, "me@example.com");
      const raw = calls[0].body.toString();
      expect(raw).toContain("f0.txt");
      expect(raw).not.toContain("img2");
    });

    it("rejects removing a photo the draft body still uses (D-000201)", async () => {
      expect(
        await saveDraft(KEY, input({ removedAttachments: [0] }), "admin"),
      ).toEqual({ ok: false, problem: "bad-input" });
      // 본문에서 지운 사진(img2)은 빼기 목록에 있어도 됨
      expect(
        (await saveDraft(KEY, input({ removedAttachments: [1] }), "admin")).ok,
      ).toBe(true);
    });

    it("rejects a draft for an original without an html part (D-000202)", async () => {
      __stageBytes(KEY, emlAlt(null, "PlainOnly"));
      expect(await saveDraft(KEY, input(), "admin")).toEqual({
        ok: false,
        problem: "bad-input",
      });
      expect(await readDraft(KEY)).toBeNull();
    });

    it("stores removed indexes sorted", async () => {
      await saveDraft(KEY, input({ removedAttachments: [3, 2] }), "admin");
      expect((await readDraft(KEY))?.row.removedAttachments).toEqual([2, 3]);
    });

    it("builds the text part from the draft html, not the original text part", async () => {
      __stageBytes(KEY, emlAlt("<p>OrigHtml</p>", "OrigTextPart"));
      const before = await previewBroadcast(KEY);
      if (!before.ok) throw new Error("expected ok");
      expect(before.preview.text).toContain("OrigTextPart");
      await saveDraft(KEY, input({ html: "<p>EditedBody</p>" }), "admin");
      const p = await previewBroadcast(KEY);
      if (!p.ok) throw new Error("expected ok");
      expect(p.preview.text).toContain("EditedBody");
      expect(p.preview.text).not.toContain("OrigTextPart");
      await sendBroadcastTest(KEY, "me@example.com");
      expect(calls[0].body.toString()).not.toContain("OrigTextPart");
    });

    it("rejects bad keys and missing files like loadBroadcast", async () => {
      expect(await saveDraft("other/a.eml", input(), "admin")).toEqual({
        ok: false,
        problem: "bad-key",
      });
      expect(
        await saveDraft(`${BROADCAST_PREFIX}none.eml`, input(), "admin"),
      ).toEqual({ ok: false, problem: "missing" });
    });

    it("preview shows the draft: subject, bare editable html, footer only in html", async () => {
      const before = await previewBroadcast(KEY);
      if (!before.ok) throw new Error("expected ok");
      expect(before.preview.draft).toBeNull();
      expect(before.preview.editable).toBe(true);
      expect(before.preview.editableHtml).not.toContain("SNUMPS 전체 공지");
      expect(before.preview.attachments).toHaveLength(4);

      await saveDraft(KEY, input({ removedAttachments: [3] }), "kim");
      const p = await previewBroadcast(KEY);
      if (!p.ok) throw new Error("expected ok");
      expect(p.preview.subject).toBe("Edited subject");
      expect(p.preview.messageId).toBe(before.preview.messageId);
      expect(p.preview.draft).toMatchObject({
        subject: "Edited subject",
        removedAttachments: [3],
        savedBy: "kim",
      });
      expect(p.preview.editableHtml).toContain("EditedBody");
      expect(p.preview.editableHtml).toContain(url(1));
      expect(p.preview.editableHtml).not.toContain("SNUMPS 전체 공지");
      expect(p.preview.html).toContain(p.preview.editableHtml ?? "");
      expect(p.preview.html).toContain("SNUMPS 전체 공지");
      expect(p.preview.text).toContain("EditedBody");
      expect(p.preview.text).not.toContain("Orig");
    });

    it("marks an over-budget body as not editable", async () => {
      __stageBytes(KEY, emlWith(`<p>${"a".repeat(3_100_000)}</p>`, []));
      const p = await previewBroadcast(KEY);
      if (!p.ok) throw new Error("expected ok");
      expect(p.preview.editable).toBe(false);
      expect(p.preview.editableHtml).toBeNull();
      expect(p.preview.htmlOmitted).toBe(true);
    });

    it("send records the draft subject, keeps the original message id, then removes the draft", async () => {
      const p = await previewBroadcast(KEY);
      if (!p.ok) throw new Error("expected ok");
      await saveDraft(KEY, input(), "admin");
      expect(__exists("staging", draftHtmlPath(KEY))).toBe(true);
      const r = await sendBroadcast(KEY, "admin");
      if (!r.ok) throw new Error("expected ok");
      expect(r.row.subject).toBe("Edited subject");
      expect(r.row.messageId).toBe(p.preview.messageId);
      expect(await readDraft(KEY)).toBeNull();
      expect(__exists("staging", draftHtmlPath(KEY))).toBe(false);
      // 같은 원본을 다시 올려도 원본 Message-ID로 중복 차단
      __stageBytes(KEY, emlDraftSrc());
      expect(await sendBroadcast(KEY, "admin")).toMatchObject({
        ok: false,
        problem: "duplicate",
      });
    });
  });

  describe("previewImages", () => {
    const att = (contentId: string | null, mimeType = "image/png") => ({
      filename: null,
      mimeType,
      disposition: null,
      contentId,
      content: new Uint8Array(),
    });
    const parsed = (attachments: ReturnType<typeof att>[]) =>
      ({ attachments }) as unknown as ParsedMail;

    it("numbers referenced safe images from 1 in attachment order", () => {
      const html =
        '<img src="cid:b"><img src="cid:a"><img src="cid:svg"><img src="cid:pdf"><img src="cid:bad">';
      expect(
        previewImages(
          parsed([
            att("a", "image/jpeg"),
            att("unused"),
            att("svg", "image/svg+xml"),
            att("pdf", "application/pdf"),
            att("bad", "image/png<x>"),
            att(null),
            att("b", "image/x-weird"),
          ]),
          html,
        ),
      ).toEqual([
        { n: 1, ext: "jpg", contentId: "a" },
        { n: 2, ext: "bin", contentId: "b" },
      ]);
      expect(previewImages(parsed([att("a")]), null)).toEqual([]);
    });
  });
});
