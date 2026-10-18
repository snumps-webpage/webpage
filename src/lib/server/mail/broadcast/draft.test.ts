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

  it("restores the signed url in any tag or attribute, not only img src (D-000207)", () => {
    const u = `https://memory.test/staged/${base}/1.png?exp=1`;
    const html = `<a href="${u}">l</a><img data-src="${u}" src="${u}">`;
    expect(restoreCids(html, KEY, images)).toBe(
      `<a href="cid:cid1@x">l</a><img data-src="cid:cid1@x" src="cid:cid1@x">`,
    );
  });

  it("restores a url() in a style attribute, quoted either way or bare (D-000207)", () => {
    const u = `https://memory.test/staged/${base}/1.png?exp=1`;
    expect(
      restoreCids(
        `<td style="background-image:url('${u}')"></td><td style='background:url("${u}")'></td><td style="background:url(${u})"></td>`,
        KEY,
        images,
      ),
    ).toBe(
      `<td style="background-image:url('cid:cid1@x')"></td><td style='background:url("cid:cid1@x")'></td><td style="background:url(cid:cid1@x)"></td>`,
    );
  });

  it("restores a url() in a <style> block and a Supabase signed url in a style (D-000207)", () => {
    const sb = `https://p.supabase.co/storage/v1/object/sign/staging/${base}/2.jpg?token=eyJ.a.b`;
    expect(
      restoreCids(
        `<style>.b{background:url("${sb}")}</style><div style="background:url('${sb}')"></div>`,
        KEY,
        images,
      ),
    ).toBe(
      `<style>.b{background:url("cid:cid2@x")}</style><div style="background:url('cid:cid2@x')"></div>`,
    );
  });

  it("leaves another upload's url inside a style alone (D-000207)", () => {
    const html = `<div style="background:url('https://memory.test/staged/broadcast/2026/other/preview/1.png?exp=1')"></div>`;
    expect(restoreCids(html, KEY, images)).toBe(html);
  });

  it("restores a url in an attribute value that merely looks like a src, and past a `>` in another value (D-000207)", () => {
    const u = `https://memory.test/staged/${base}/1.png?exp=1`;
    expect(restoreCids(`<img alt="a>b" src="${u}">`, KEY, images)).toBe(
      `<img alt="a>b" src="cid:cid1@x">`,
    );
    expect(restoreCids(`<img alt=' src="${u}"' src="${u}">`, KEY, images)).toBe(
      `<img alt=' src="cid:cid1@x"' src="cid:cid1@x">`,
    );
  });

  it("restores an unquoted src (stays unquoted) and keeps self-closing tags", () => {
    const u = `https://memory.test/staged/${base}/2.jpg?exp=1`;
    expect(restoreCids(`<IMG width=10 SRC=${u} />`, KEY, images)).toBe(
      `<IMG width=10 SRC=cid:cid2@x />`,
    );
  });

  it("stays linear on many unclosed img tags", () => {
    const html = "<img   ".repeat(20000);
    const t = performance.now();
    expect(restoreCids(html, KEY, images)).toBe(html);
    expect(performance.now() - t).toBeLessThan(500);
  });

  it("stays linear on many unterminated urls", () => {
    const html = "https://a".repeat(50000);
    const t = performance.now();
    restoreCids(html, KEY, images);
    expect(performance.now() - t).toBeLessThan(500);
  });

  it("keeps characters glued to the signed url instead of eating them (D-000216-a)", () => {
    const u = `https://memory.test/staged/${base}/1.png?exp=600`;
    const sb = `https://p.supabase.co/storage/v1/object/sign/staging/${base}/1.png?token=eyJ.a-b_c.d-e_f`;
    for (const [tail, want] of [
      ["입니다", "입니다"],
      [".", "."],
      [";", ";"],
      ["!", "!"],
      ["#x", "#x"],
      ["&lt;", "&lt;"],
    ] as const) {
      expect(restoreCids(`U ${u}${tail}`, KEY, images)).toBe(
        `U cid:cid1@x${want}`,
      );
      expect(restoreCids(`U ${sb}${tail}`, KEY, images)).toBe(
        `U cid:cid1@x${want}`,
      );
    }
    const amp = `https://p.supabase.co/storage/v1/object/sign/staging/${base}/1.png?a=1&amp;token=t.k`;
    expect(restoreCids(`<a href="${amp}">`, KEY, images)).toBe(
      `<a href="cid:cid1@x">`,
    );
    expect(restoreCids(`${amp}입니다`, KEY, images)).toBe(`cid:cid1@x입니다`);
  });

  it("stops a url at a quote entity, so Jodit's rewritten style restores (D-000211)", () => {
    const u = `https://memory.test/staged/${base}/1.png?exp=600`;
    for (const q of ["&quot;", "&#34;", "&#39;", "&apos;", "&#x22;", "&#x27;"])
      expect(
        restoreCids(
          `<p style="background: url(${q}${u}${q}); x: y">`,
          KEY,
          images,
        ),
      ).toBe(`<p style="background: url(${q}cid:cid1@x${q}); x: y">`);
  });

  it("stops a url before a comma or &nbsp; in text, keeps &amp; inside the query (D-000211)", () => {
    const u = `https://memory.test/staged/${base}/1.png?exp=600`;
    expect(restoreCids(`${u},next`, KEY, images)).toBe("cid:cid1@x,next");
    expect(restoreCids(`${u}&nbsp;x`, KEY, images)).toBe("cid:cid1@x&nbsp;x");
    const withAmp = `https://p.supabase.co/storage/v1/object/sign/staging/${base}/1.png?token=a&amp;t=b`;
    expect(restoreCids(`<img src="${withAmp}">`, KEY, images)).toBe(
      `<img src="cid:cid1@x">`,
    );
    const other = `https://x.test/a.png?a=1&amp;b=2`;
    expect(restoreCids(other, KEY, images)).toBe(other);
  });

  it("does not match a key that merely shares a suffix", () => {
    const html = `<img src="https://memory.test/staged/x${base}/1.png?exp=1">`;
    expect(restoreCids(html, KEY, images)).toBe(html);
  });
});
