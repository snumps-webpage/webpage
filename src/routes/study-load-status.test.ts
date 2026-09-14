import { isHttpError } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { load as manageLoad } from "./(member)/study/[id]/manage/+page.server";
import { load as attendanceLoad } from "./(member)/study/[id]/attendance/+page.server";
import { handleError } from "../hooks.server";

/**
 * AppError is not SvelteKit's HttpError. Actions get converted by runAction;
 * loads have no such step, so a guard's NOT_FOUND/FORBIDDEN left a load as a
 * bare 500 — /study/<missing> answers 404 while /study/<missing>/manage
 * answered 500 for the same missing study.
 */

// `never` so the same fixture satisfies both loads' route-specific event types.
const event = (id: string) =>
  ({
    params: { id },
    locals: { member: { memberId: "m1", isAdmin: false, status: "active" } },
  }) as unknown as never;

describe("study organizer loads", () => {
  // AppError carries a `status` too, so asserting on that field would pass
  // against the very bug this pins. Kit only honours HttpError — anything else
  // becomes a 500 — so that is what the test asks about.
  it("throws a 404 Kit will honour when the study does not exist (manage)", async () => {
    await expect(manageLoad(event("no-such-study"))).rejects.toSatisfy((e) =>
      isHttpError(e, 404),
    );
  });

  it("throws a 404 Kit will honour when the study does not exist (attendance)", async () => {
    await expect(attendanceLoad(event("no-such-study"))).rejects.toSatisfy(
      (e) => isHttpError(e, 404),
    );
  });
});

describe("handleError", () => {
  it("gives an uncaught error a body the REST envelope accepts", async () => {
    const body = await handleError({
      error: new Error("connect ECONNREFUSED 127.0.0.1:5432"),
      event: {
        url: new URL("http://localhost/api/admin/applications"),
        request: { method: "GET" },
      },
      status: 500,
      message: "Internal Error",
    } as unknown as Parameters<typeof handleError>[0]);

    expect(body).toMatchObject({ error: "SERVICE_UNAVAILABLE" });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });
});
