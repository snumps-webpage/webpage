import { beforeEach, describe, expect, it } from "vitest";
import {
  __reset,
  __stage,
  listBackups,
  listStaged,
  uploadToBackups,
} from "./storage-memory";

/**
 * The memory backend stands in for Supabase Storage in every service test, so
 * its listing must behave like the real `.list(prefix)`: ONE level deep, names
 * relative to the prefix, and sub-folders surfaced as rows with no timestamp
 * (real rows carry `created_at: null`; the seam maps that to ""). A recursive
 * stand-in once let cleanupStaging pass its tests while deleting nothing in
 * production — see docs/code-audit/PRIORITY.md W-2.
 */

beforeEach(() => __reset());

describe("listStaged (Supabase .list semantics)", () => {
  it("returns only the direct children of the prefix, sub-folders as empty-timestamp rows", async () => {
    __stage(
      "pending/seminar-photo/a.png",
      1,
      "image/png",
      "2026-09-01T00:00:00.000Z",
    );
    __stage(
      "pending/gallery-photo/b.jpg",
      1,
      "image/jpeg",
      "2026-09-01T00:00:00.000Z",
    );

    const rows = await listStaged("pending");

    expect(rows).toEqual([
      { name: "gallery-photo", createdAt: "" },
      { name: "seminar-photo", createdAt: "" },
    ]);
  });

  it("names files relative to the prefix", async () => {
    __stage(
      "pending/seminar-photo/a.png",
      1,
      "image/png",
      "2026-09-01T00:00:00.000Z",
    );

    const rows = await listStaged("pending/seminar-photo");

    expect(rows).toEqual([
      { name: "a.png", createdAt: "2026-09-01T00:00:00.000Z" },
    ]);
  });

  it("does not match sibling prefixes that merely share a string prefix", async () => {
    __stage("pending-old/x.png", 1, "image/png", "2026-09-01T00:00:00.000Z");

    expect(await listStaged("pending")).toEqual([]);
  });
});

describe("listBackups (same semantics as listStaged)", () => {
  it("names dump files relative to the prefix", async () => {
    await uploadToBackups("dumps/2026-09-06.json", "{}");

    const rows = await listBackups("dumps");

    expect(rows.map((r) => r.name)).toEqual(["2026-09-06.json"]);
  });
});
