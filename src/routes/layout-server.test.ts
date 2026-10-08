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
import { capabilitiesFor } from "$lib/server/core/capabilities";

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
  it("exposes participation permission without treating admin or alumni status as registration", async () => {
    const guest = await loadGuestData();
    expect(guest.canParticipate).toBe(false);
    for (const registered of [false, true]) {
      const event = {
        locals: {
          auth: async () => ({
            user: { email: "fixture@snu.ac.kr", name: "Fixture" },
          }),
          member: {
            memberId: "fixture",
            status: "regular",
            isAdmin: true,
            isAlumni: true,
            registered,
            capabilities: capabilitiesFor({ isAlumni: true, registered }),
          },
        },
      } as unknown as Parameters<typeof load>[0];
      const data = await load(event);
      expect(data?.canParticipate).toBe(registered);
    }
  });
});

describe("navigation session and capability projection", () => {
  it("resolved null-member applicant keeps auth session", async () => {
    const session = { user: { email: "applicant@example.test" } };
    const data = await load({
      locals: { member: null, auth: async () => session },
    } as never);
    expect(data?.session).toBe(session);
    expect(data?.canViewMemberZone).toBe(false);
    expect(data?.canManageSelf).toBe(false);
  });
  it("undefined anonymous fast path does not call auth", async () => {
    const auth = vi.fn(async () => null);
    const data = await load({ locals: { auth } } as never);
    expect(data?.session).toBeNull();
    expect(auth).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "projects readable/self capabilities for alumni registered=%s",
    async (registered) => {
      const caps = capabilitiesFor({ isAlumni: true, registered });
      const data = await load({
        locals: {
          member: { memberId: "alumni", status: "regular", capabilities: caps },
          auth: async () => ({ user: { email: "alumni@example.test" } }),
        },
      } as never);
      expect(data?.canViewMemberZone).toBe(true);
      expect(data?.canManageSelf).toBe(true);
      expect(data?.canParticipate).toBe(registered);
    },
  );
});
