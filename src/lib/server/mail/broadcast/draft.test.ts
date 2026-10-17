import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
const stg = vi.hoisted(() => ({ removeFails: false }));
vi.mock("$lib/server/data/storage", async () => {
  const actual = await import("$lib/server/data/storage-memory");
  return {
    ...actual,
    removeStaged: async (paths: string[]) => {
      if (stg.removeFails) throw new Error("remove failed");
      return actual.removeStaged(paths);
    },
  };
});

import { __reset } from "$lib/server/data/store-memory";
import {
  __exists,
  __reset as __resetStorage,
  removeStaged as removeStagedMemory,
} from "$lib/server/data/storage-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import type { MailBroadcastDraft } from "$lib/server/data/schemas";
import {
  deleteDraft,
  draftHtmlPath,
  draftId,
  readDraft,
  restoreCids,
  writeDraft,
} from "./draft";

const KEY = "broadcast/2026/abc123.eml";

function row(over: Partial<MailBroadcastDraft> = {}): MailBroadcastDraft {
  return {
    id: "abc123",
    s3Key: KEY,
    messageId: "<m1@example.com>",
    subject: "제목",
    removedAttachments: [],
    savedBy: "admin",
    savedAt: "2026-10-17T10:00:00+09:00",
    ...over,
  };
}

async function reset() {
  __reset();
  __resetStorage();
  stg.removeFails = false;
  _resetDataLayerForTests();
  await invalidateCache("table_mail-broadcast-drafts");
}

describe("draft paths", () => {
  it("derives id and html path from the extension-less key", () => {
    expect(draftId(KEY)).toBe("abc123");
    expect(draftHtmlPath(KEY)).toBe("broadcast/2026/abc123/draft.html");
  });
});

describe("draft store", () => {
  beforeEach(reset);

  it("returns null when there is no row", async () => {
    expect(await readDraft(KEY)).toBeNull();
  });

  it("writes the file then the row, and reads both back", async () => {
    await writeDraft(row(), "<p>안녕</p>");
    expect(__exists("staging", draftHtmlPath(KEY))).toBe(true);
    const got = await readDraft(KEY);
    expect(got?.row.id).toBe("abc123");
    expect(got?.html).toBe("<p>안녕</p>");
  });

  it("replaces the row with the same id", async () => {
    await writeDraft(row(), "<p>1</p>");
    await writeDraft(row({ subject: "새 제목" }), "<p>2</p>");
    expect((await getTable("mail-broadcast-drafts")).length).toBe(1);
    const got = await readDraft(KEY);
    expect(got?.row.subject).toBe("새 제목");
    expect(got?.html).toBe("<p>2</p>");
  });

  it("gives html null (one log line, no path) when only the row exists", async () => {
    await writeDraft(row(), "<p>x</p>");
    await removeStagedMemory([draftHtmlPath(KEY)]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const got = await readDraft(KEY);
    expect(got?.html).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("abc123");
    spy.mockRestore();
  });

  it("deletes row and file", async () => {
    await writeDraft(row(), "<p>x</p>");
    await deleteDraft(KEY);
    expect(await readDraft(KEY)).toBeNull();
    expect(__exists("staging", draftHtmlPath(KEY))).toBe(false);
  });

  it("logs, does not throw, when file removal fails; row still goes", async () => {
    await writeDraft(row(), "<p>x</p>");
    stg.removeFails = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(deleteDraft(KEY)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(await readDraft(KEY)).toBeNull();
  });

  it("deleting a missing draft is a no-op", async () => {
    await expect(deleteDraft(KEY)).resolves.toBeUndefined();
  });
});

describe("restoreCids", () => {
  const images = [
    { n: 1, ext: "png", contentId: "cid1@x" },
    { n: 2, ext: "jpg", contentId: "cid2@x" },
  ];
  const base = "broadcast/2026/abc123/preview";

  it("restores a memory-backend signed url (double and single quotes)", () => {
    const html = `<img src="https://memory.test/staged/${base}/1.png?exp=600"><img alt="a" src='https://memory.test/staged/${base}/2.jpg?exp=600'>`;
    expect(restoreCids(html, KEY, images)).toBe(
      `<img src="cid:cid1@x"><img alt="a" src='cid:cid2@x'>`,
    );
  });

  it("restores a Supabase signed url, ignoring the token", () => {
    const html = `<img src="https://p.supabase.co/storage/v1/object/sign/staging/${base}/1.png?token=eyJ.a.b">`;
    expect(restoreCids(html, KEY, images)).toBe(`<img src="cid:cid1@x">`);
  });

  it("interprets percent encoding before comparing", () => {
    const enc = base.replace(/\//g, "%2F");
    const html = `<img src="https://p.supabase.co/storage/v1/object/sign/staging/${enc}%2F1.png?token=t">`;
    expect(restoreCids(html, KEY, images)).toBe(`<img src="cid:cid1@x">`);
  });

  it("leaves other uploads, unknown n, other ext and external images alone", () => {
    const html = [
      `<img src="https://memory.test/staged/broadcast/2026/other/preview/1.png?exp=1">`,
      `<img src="https://memory.test/staged/${base}/9.png?exp=1">`,
      `<img src="https://memory.test/staged/${base}/1.jpg?exp=1">`,
      `<img src="https://example.com/a.png">`,
      `<img src="cid:keep@x">`,
    ].join("");
    expect(restoreCids(html, KEY, images)).toBe(html);
  });

  it("touches only img src, not other tags or attributes", () => {
    const u = `https://memory.test/staged/${base}/1.png?exp=1`;
    const html = `<a href="${u}">l</a><img data-src="${u}" src="${u}">`;
    expect(restoreCids(html, KEY, images)).toBe(
      `<a href="${u}">l</a><img data-src="${u}" src="cid:cid1@x">`,
    );
  });

  it("reads attributes whole: `>` and ` src=` inside other values do not fool it", () => {
    const u = `https://memory.test/staged/${base}/1.png?exp=1`;
    expect(restoreCids(`<img alt="a>b" src="${u}">`, KEY, images)).toBe(
      `<img alt="a>b" src="cid:cid1@x">`,
    );
    expect(restoreCids(`<img alt=' src="${u}"' src="${u}">`, KEY, images)).toBe(
      `<img alt=' src="${u}"' src="cid:cid1@x">`,
    );
  });

  it("restores an unquoted src and keeps self-closing tags", () => {
    const u = `https://memory.test/staged/${base}/2.jpg?exp=1`;
    expect(restoreCids(`<IMG width=10 SRC=${u} />`, KEY, images)).toBe(
      `<IMG width=10 SRC="cid:cid2@x" />`,
    );
  });

  it("stays linear on many unclosed img tags", () => {
    const html = "<img   ".repeat(20000);
    const t = performance.now();
    expect(restoreCids(html, KEY, images)).toBe(html);
    expect(performance.now() - t).toBeLessThan(500);
  });

  it("does not match a key that merely shares a suffix", () => {
    const html = `<img src="https://memory.test/staged/x${base}/1.png?exp=1">`;
    expect(restoreCids(html, KEY, images)).toBe(html);
  });
});
