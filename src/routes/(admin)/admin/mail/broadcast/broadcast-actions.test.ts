// @vitest-environment node
// (a real undici File in the form body — jsdom's Blob is not accepted by Request)
import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const send = vi.hoisted(() => ({
  previewBroadcast: vi.fn(),
  sendBroadcastTest: vi.fn(),
  sendBroadcast: vi.fn(),
  saveDraft: vi.fn(),
}));
const store = vi.hoisted(() => ({ recentBroadcasts: vi.fn() }));
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail/broadcast/send", () => send);
vi.mock("$lib/server/mail/broadcast/store", () => store);

import { actions, load } from "./+page.server";

const member = (isAdmin: boolean) => ({
  memberId: isAdmin ? "admin" : "m1",
  privateInfoId: null,
  name: "사용자",
  status: "regular",
  isAdmin,
  isAlumni: false,
  registered: true,
  capabilities: [],
});
const locals = (isAdmin: boolean) =>
  ({
    member: member(isAdmin),
    auth: async () => ({
      user: { email: "admin@snu.ac.kr", name: "관리자" },
      expires: "2999-01-01",
    }),
  }) as unknown as App.Locals;

function post(fields: Record<string, string>, isAdmin = true) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/admin", { method: "POST", body }),
    locals: locals(isAdmin),
  } as never;
}

type Failed = { status: number; data: unknown };

const KEY = "pending/broadcast-eml/a.eml";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/admin/mail/broadcast load", () => {
  it("returns the 20 most recent broadcasts", async () => {
    store.recentBroadcasts.mockResolvedValue([{ id: "b1" }]);
    const out = await load({ locals: locals(true) } as never);
    expect(store.recentBroadcasts).toHaveBeenCalledWith(20);
    expect(out).toEqual({ recent: [{ id: "b1" }] });
  });

  it("refuses a non-admin before reading any record", async () => {
    await expect(load({ locals: locals(false) } as never)).rejects.toThrow();
    expect(store.recentBroadcasts).not.toHaveBeenCalled();
  });
});

describe("/admin/mail/broadcast actions", () => {
  it("preview returns the preview", async () => {
    send.previewBroadcast.mockResolvedValue({
      ok: true,
      preview: { subject: "s" },
    });
    const out = await actions.preview(post({ s3Key: KEY }));
    expect(send.previewBroadcast).toHaveBeenCalledWith(KEY);
    expect(out).toMatchObject({
      operation: "preview",
      preview: { subject: "s" },
    });
  });

  it("preview maps a problem code to 400", async () => {
    send.previewBroadcast.mockResolvedValue({ ok: false, problem: "missing" });
    const out = (await actions.preview(post({ s3Key: KEY }))) as Failed;
    expect(out.status).toBe(400);
    expect(out.data).toEqual({ error: "missing" });
  });

  it("test sends to the signed-in admin only", async () => {
    send.sendBroadcastTest.mockResolvedValue({ ok: true });
    const out = await actions.test(
      post({ s3Key: KEY, to: "evil@example.com" }),
    );
    expect(send.sendBroadcastTest).toHaveBeenCalledWith(KEY, "admin@snu.ac.kr");
    expect(out).toMatchObject({ operation: "test-sent" });
  });

  it("test maps a problem code to 400", async () => {
    send.sendBroadcastTest.mockResolvedValue({
      ok: false,
      problem: "send-failed",
    });
    const out = (await actions.test(post({ s3Key: KEY }))) as Failed;
    expect(out.status).toBe(400);
    expect(out.data).toEqual({ error: "send-failed" });
  });

  it("send passes s3Key and the admin email, nothing else", async () => {
    send.sendBroadcast.mockResolvedValue({
      ok: true,
      row: { id: "b1" },
      skipped: 2,
    });
    const out = await actions.send(
      post({ s3Key: KEY, subject: "x", html: "<b>x</b>" }),
    );
    expect(send.sendBroadcast).toHaveBeenCalledWith(KEY, "admin@snu.ac.kr");
    expect(out).toMatchObject({
      operation: "sent",
      row: { id: "b1" },
      skipped: 2,
    });
  });

  it("send reports a duplicate as 409 with the existing row", async () => {
    send.sendBroadcast.mockResolvedValue({
      ok: false,
      problem: "duplicate",
      existing: { id: "b0" },
    });
    const out = (await actions.send(post({ s3Key: KEY }))) as Failed;
    expect(out.status).toBe(409);
    expect(out.data).toEqual({ error: "duplicate", existing: { id: "b0" } });
  });

  it("send maps other problems to 400", async () => {
    send.sendBroadcast.mockResolvedValue({
      ok: false,
      problem: "no-recipients",
    });
    const out = (await actions.send(post({ s3Key: KEY }))) as Failed;
    expect(out.status).toBe(400);
    expect(out.data).toEqual({ error: "no-recipients" });
  });

  it("passes an empty key to the service when s3Key is missing", async () => {
    send.previewBroadcast.mockResolvedValue({ ok: false, problem: "bad-key" });
    const out = (await actions.preview(post({}))) as Failed;
    expect(send.previewBroadcast).toHaveBeenCalledWith("");
    expect(out.status).toBe(400);
  });

  it("treats a file in place of s3Key as an empty key, not a crash", async () => {
    send.previewBroadcast.mockResolvedValue({ ok: false, problem: "bad-key" });
    const body = new FormData();
    body.set("s3Key", new File(["x"], "x.eml"));
    const out = (await actions.preview({
      request: new Request("http://localhost/admin", { method: "POST", body }),
      locals: locals(true),
    } as never)) as Failed;
    expect(send.previewBroadcast).toHaveBeenCalledWith("");
    expect(out.status).toBe(400);
  });

  it("answers 500 when the send throws (result unknown, row stays sending)", async () => {
    send.sendBroadcast.mockRejectedValue(new Error("record failed"));
    const out = (await actions.send(post({ s3Key: KEY }))) as Failed;
    expect(out.status).toBe(500);
  });

  it("rejects non-admins on every action", async () => {
    for (const name of ["preview", "test", "send"] as const) {
      const out = (await actions[name](post({ s3Key: KEY }, false))) as Failed;
      expect(out.status).toBeGreaterThanOrEqual(400);
    }
    expect(send.previewBroadcast).not.toHaveBeenCalled();
    expect(send.sendBroadcastTest).not.toHaveBeenCalled();
    expect(send.sendBroadcast).not.toHaveBeenCalled();
  });
});

describe("/admin/mail/broadcast saveDraft action", () => {
  const form = {
    s3Key: KEY,
    subject: "제목",
    html: "<p>x</p>",
    removed: "0, 2",
  };

  it("passes parsed input and the admin email, returns savedAt", async () => {
    send.saveDraft.mockResolvedValue({
      ok: true,
      savedAt: "2026-10-18T00:00:00Z",
    });
    const out = await actions.saveDraft(post({ ...form, removed: "0,2" }));
    expect(send.saveDraft).toHaveBeenCalledWith(
      KEY,
      { subject: "제목", html: "<p>x</p>", removedAttachments: [0, 2] },
      "admin@snu.ac.kr",
    );
    expect(out).toMatchObject({
      operation: "draft-saved",
      savedAt: "2026-10-18T00:00:00Z",
    });
  });

  it("treats an empty removed value as no removals", async () => {
    send.saveDraft.mockResolvedValue({ ok: true, savedAt: "t" });
    await actions.saveDraft(post({ ...form, removed: "" }));
    expect(send.saveDraft.mock.calls[0][1].removedAttachments).toEqual([]);
  });

  it("maps a service problem to 400", async () => {
    send.saveDraft.mockResolvedValue({ ok: false, problem: "no-body" });
    const out = (await actions.saveDraft(
      post({ ...form, removed: "" }),
    )) as Failed;
    expect(out.status).toBe(400);
    expect(out.data).toEqual({ error: "no-body" });
  });

  it("rejects a malformed removed list without calling the service", async () => {
    for (const removed of ["a", "1,,2", "1,-1", "1.5", "1,"]) {
      const out = (await actions.saveDraft(
        post({ ...form, removed }),
      )) as Failed;
      expect(out.status).toBe(400);
      expect(out.data).toEqual({ error: "bad-input" });
    }
    expect(send.saveDraft).not.toHaveBeenCalled();
  });

  it("rejects a file in place of a text field without calling the service", async () => {
    const body = new FormData();
    body.set("s3Key", KEY);
    body.set("subject", new File(["x"], "x.txt"));
    body.set("html", "<p>x</p>");
    body.set("removed", "");
    const out = (await actions.saveDraft({
      request: new Request("http://localhost/admin", { method: "POST", body }),
      locals: locals(true),
    } as never)) as Failed;
    expect(out.data).toEqual({ error: "bad-input" });
    expect(send.saveDraft).not.toHaveBeenCalled();
  });

  it("rejects non-admins without calling the service", async () => {
    const out = (await actions.saveDraft(post(form, false))) as Failed;
    expect(out.status).toBeGreaterThanOrEqual(400);
    expect(send.saveDraft).not.toHaveBeenCalled();
  });
});
