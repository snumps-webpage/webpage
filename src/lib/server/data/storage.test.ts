import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The real (non-memory) listing path against a fake Supabase client. `.list`
 * returns at most `limit` rows per call, so a single call silently truncates
 * any folder larger than one page — and cleanupStaging would then never see
 * the files past it.
 */

const fake = vi.hoisted(() => ({
  rows: [] as { name: string; created_at: string | null }[],
  calls: [] as {
    bucket: string;
    prefix: string;
    limit?: number;
    offset?: number;
  }[],
  /** what `.info` / `.createSignedUrl` answer */
  answer: { data: null, error: null } as {
    data: unknown;
    error: { message: string; status?: number } | null;
  },
}));

vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock("./supabase", () => ({
  isMemoryBackend: () => false,
  getSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        list: async (
          prefix: string,
          opts?: { limit?: number; offset?: number },
        ) => {
          fake.calls.push({ bucket, prefix, ...opts });
          const offset = opts?.offset ?? 0;
          const limit = opts?.limit ?? 100;
          return { data: fake.rows.slice(offset, offset + limit), error: null };
        },
        info: async () => fake.answer,
        createSignedUrl: async () => fake.answer,
      }),
    },
  }),
}));

import {
  createSignedAssetUrl,
  listBackups,
  listStaged,
  stagedInfo,
} from "./storage";

const file = (i: number) => ({
  name: `f${String(i).padStart(4, "0")}.png`,
  created_at: "2026-09-01T00:00:00.000Z",
});

beforeEach(() => {
  fake.rows = [];
  fake.calls = [];
});

describe("listStaged against Supabase", () => {
  it("pages through a folder larger than one listing page", async () => {
    fake.rows = Array.from({ length: 2500 }, (_, i) => file(i));

    const rows = await listStaged("pending/seminar-photo");

    expect(rows).toHaveLength(2500);
    expect(rows[2499].name).toBe("f2499.png");
  });

  it("maps folder rows (created_at null) to an empty timestamp", async () => {
    fake.rows = [{ name: "seminar-photo", created_at: null }, file(0)];

    const rows = await listStaged("pending");

    expect(rows).toEqual([
      { name: "seminar-photo", createdAt: "" },
      { name: "f0000.png", createdAt: "2026-09-01T00:00:00.000Z" },
    ]);
  });
});

describe("listBackups against Supabase", () => {
  it("pages the same way", async () => {
    fake.rows = Array.from({ length: 1200 }, (_, i) => file(i));

    expect(await listBackups("dumps")).toHaveLength(1200);
  });
});

// Supabase answers 404 "Bucket not found" as well as "Object not found", and
// both read as "no such file": a mistyped bucket env var turned every asset
// into a silent 404 and every promotion into "never uploaded" — no 5xx, no
// log (audit LA38-1). Only a missing object is "none" now.
describe("a missing bucket is not a missing file", () => {
  it("stagedInfo and createSignedAssetUrl throw on a missing bucket", async () => {
    fake.answer = {
      data: null,
      error: { message: "Bucket not found", status: 404 },
    };
    await expect(stagedInfo("pending/x/a.png")).rejects.toThrow(/Bucket/);
    await expect(createSignedAssetUrl("seminars/a.png", 60)).rejects.toThrow(
      /Bucket/,
    );
  });

  it("a missing object is still none", async () => {
    fake.answer = {
      data: null,
      error: { message: "Object not found", status: 404 },
    };
    expect(await stagedInfo("pending/x/a.png")).toBeNull();
    expect(await createSignedAssetUrl("seminars/a.png", 60)).toBeNull();
  });
});

// Promotion's size cap is enforced only here (a signed upload URL cannot
// limit size), and an unknown size read as 0 — under every cap (LA38-2).
describe("stagedInfo without a size", () => {
  it("refuses rather than answering 0", async () => {
    fake.answer = { data: { contentType: "image/png" }, error: null };
    await expect(stagedInfo("pending/x/a.png")).rejects.toThrow(/size/);
  });

  it("passes a known size through", async () => {
    fake.answer = {
      data: { size: 10, contentType: "image/png" },
      error: null,
    };
    expect(await stagedInfo("pending/x/a.png")).toEqual({
      size: 10,
      contentType: "image/png",
    });
  });
});
