import { describe, expect, it } from "vitest";
import { isRedirect } from "@sveltejs/kit";
import { load } from "./+page.server";

/**
 * `?redirect=` is attacker-controlled: the zone guard writes it, but anyone can
 * hand out a /login link. Browsers read `/\host` as `//host`, so a check that
 * only rejects a leading `//` sends a signed-in user off-site.
 */

type LoadEvent = Parameters<typeof load>[0];

function eventFor(query: string, signedIn: boolean): LoadEvent {
  return {
    url: new URL(`https://snumps.vercel.app/login${query}`),
    locals: {
      auth: async () =>
        signedIn ? { user: { email: "a@snu.ac.kr" }, expires: "" } : null,
    },
  } as unknown as LoadEvent;
}

async function redirectLocation(query: string): Promise<string> {
  try {
    await load(eventFor(query, true));
  } catch (e) {
    if (isRedirect(e)) return e.location;
    throw e;
  }
  throw new Error("signed-in load did not redirect");
}

async function signInTarget(query: string): Promise<string> {
  const data = await load(eventFor(query, false));
  if (!data) throw new Error("login load returned no data");
  return data.redirectTo;
}

const OFF_SITE = [
  "?redirect=%2F%5Cevil.example",
  "?redirect=%2F%2Fevil.example",
  "?redirect=https%3A%2F%2Fevil.example",
];

describe("/login redirect target", () => {
  it("keeps an internal path for a signed-in user", async () => {
    expect(await redirectLocation("?redirect=%2Fstudy%3Ftab%3D1")).toBe(
      "/study?tab=1",
    );
  });

  it.each(OFF_SITE)(
    "sends a signed-in user home instead of off-site (%s)",
    async (query) => {
      expect(await redirectLocation(query)).toBe("/");
    },
  );

  it.each(OFF_SITE)(
    "never hands an off-site target to sign-in (%s)",
    async (query) => {
      expect(await signInTarget(query)).toBe("/");
    },
  );
});
