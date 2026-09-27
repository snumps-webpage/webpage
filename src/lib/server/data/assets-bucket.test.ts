import { beforeEach, describe, expect, it } from "vitest";
import migration from "/supabase/migrations/20260928000200_assets_bucket_private.sql?raw";
import { __reset, __sql } from "./store-memory";

/**
 * The first migration creates `assets` as a public bucket, and C-22 decided
 * it is private — served only through /media, which checks every request.
 * Only an operator script carried that out, so an environment built from the
 * migrations (dev rebuild, disaster recovery) was born public, and re-running
 * the first file never corrected it: `on conflict do nothing` (audit LA42-1).
 */

const isPublic = async () =>
  (
    await __sql<{ public: boolean }>(
      "select public from storage.buckets where id = 'assets'",
    )
  )[0]?.public;

beforeEach(async () => {
  await __reset();
});

describe("20260928000200_assets_bucket_private", () => {
  it("leaves a database built from the migrations with a private assets bucket", async () => {
    expect(await isPublic()).toBe(false);
  });

  it("turns a bucket that is still public private, and is safe to re-run", async () => {
    await __sql("update storage.buckets set public = true where id = 'assets'");

    await __sql(migration);
    await __sql(migration);

    expect(await isPublic()).toBe(false);
  });
});
