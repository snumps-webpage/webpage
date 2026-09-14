import { describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { load as publicLoad } from "./(public)/+page.server";
import { load as adminLoad } from "./(admin)/admin/+page.server";

/**
 * These two loads are the only ones that return data through `streamed`, and a
 * promise anywhere in load data makes Kit stream the response. The streaming
 * branch of its renderer builds a Response with no status (kit#12533,
 * kit#12987), which for a page is invisible — it is a 200 either way — but an
 * action failure is a successful render with a non-200 status, and that status
 * is what disappears. Both routes carry actions; between them, twenty.
 */

function thenablePaths(
  value: unknown,
  path = "$",
  seen = new Set<unknown>(),
): string[] {
  if (typeof (value as { then?: unknown })?.then === "function") return [path];
  if (value === null || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => thenablePaths(child, `${path}.${key}`, seen),
  );
}

const cookies = { get: () => undefined, set: () => {}, delete: () => {} };

const guestEvent = {
  url: new URL("http://localhost/"),
  cookies,
  locals: { member: null, auth: async () => null },
} as unknown as Parameters<typeof publicLoad>[0];

const adminEvent = {
  url: new URL("http://localhost/admin"),
  cookies,
  locals: {
    member: { memberId: "m1", isAdmin: true, status: "active" },
    auth: async () => ({ user: { email: "admin@snu.ac.kr" } }),
  },
} as unknown as Parameters<typeof adminLoad>[0];

describe("loads that return a `streamed` payload", () => {
  it("the public dashboard settles its data before returning", async () => {
    const data = await publicLoad(guestEvent);

    expect(thenablePaths(data)).toEqual([]);
  });

  it("the admin dashboard settles its data before returning", async () => {
    const data = await adminLoad(adminEvent);

    expect(thenablePaths(data)).toEqual([]);
  });
});
