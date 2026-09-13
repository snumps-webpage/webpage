import { beforeEach, describe, expect, it, vi } from "vitest";

const archive = vi.hoisted(() => ({ fail: false }));

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/public/archive", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("$lib/server/public/archive")>();
  return {
    ...real,
    getPublicExecutives: async () => {
      if (archive.fail) throw new Error("data layer down");
      return real.getPublicExecutives();
    },
  };
});

import { load } from "./+layout.server";

/**
 * Every rendered page goes through this load, error pages included — Kit loads
 * the root layout to render one. A top-level promise in the returned object
 * makes the response streamed, and Kit's streaming branch builds its Response
 * without a status, so a 404 or a 500 leaves as 200 (kit#12533, kit#12987).
 * Keep the returned data settled.
 */

const guestEvent = {
  locals: { member: null, auth: async () => null },
} as unknown as Parameters<typeof load>[0];

/** LayoutServerLoad's return type includes void; a layout that returns nothing is itself a failure. */
async function loadGuestData() {
  const data = await load(guestEvent);
  if (!data) throw new Error("root layout load returned no data");
  return data;
}

beforeEach(() => {
  archive.fail = false;
});

describe("root layout load", () => {
  // Kit serializes promises through a devalue reducer, which runs at EVERY
  // depth — a promise nested inside a returned object streams just the same.
  function thenablePaths(
    value: unknown,
    path = "$",
    seen = new Set<unknown>(),
  ): string[] {
    if (typeof (value as { then?: unknown })?.then === "function")
      return [path];
    if (value === null || typeof value !== "object" || seen.has(value))
      return [];
    seen.add(value);
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => thenablePaths(child, `${path}.${key}`, seen),
    );
  }

  it("returns no unsettled promise — a streamed root layout loses the status code", async () => {
    const data = await loadGuestData();

    expect(thenablePaths(data)).toEqual([]);
  });

  it("degrades the footer to no contacts instead of throwing when the lookup fails", async () => {
    archive.fail = true;

    const data = await loadGuestData();

    expect(data.executives).toBeNull();
  });
});
