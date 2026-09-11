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
      }),
    },
  }),
}));

import { listBackups, listStaged } from "./storage";

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
