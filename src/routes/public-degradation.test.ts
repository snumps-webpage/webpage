import { isHttpError } from "@sveltejs/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset, __setReadsFail } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { load as membersLoad } from "./(public)/members/+page.server";
import { load as executivesLoad } from "./(public)/about/executives/+page.server";
import { load as seminarLoad } from "./(public)/archive/seminars/[id]/+page.server";

/**
 * What a public page does when the data layer cannot answer (W-5).
 *
 * Two shapes, because the pages differ. A roster degrades: the page still
 * renders and says the list is unavailable — `dataAvailable` exists for exactly
 * this and had no producer, so the consumers' else branches were dead code. A
 * detail page cannot degrade — there is no seminar to show — so it must at
 * least tell the truth about WHY, and 503 (retry) is a different fact from 404
 * (no such seminar).
 */

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "members",
    "legacy-members",
    "seminars",
    "seminar-requests",
    "activities",
  ])
    await invalidateCache(`table_${t}`);
});

afterEach(() => __setReadsFail(false));

describe("roster pages degrade instead of failing", () => {
  it("/members reports the roster as unavailable", async () => {
    __setReadsFail(true);

    const data = await membersLoad({} as never);

    expect(data).toMatchObject({ members: [], dataAvailable: false });
  });

  it("/about/executives reports the history as unavailable", async () => {
    __setReadsFail(true);

    const data = await executivesLoad({} as never);

    expect(data).toMatchObject({ terms: [], dataAvailable: false });
  });
});

describe("the seminar detail page separates 'missing' from 'unreachable'", () => {
  it("is 404 when the seminar does not exist", async () => {
    await expect(
      seminarLoad({ params: { id: "nope" } } as never),
    ).rejects.toSatisfy((e) => isHttpError(e, 404));
  });

  it("is 503, not 500, when the data layer cannot answer", async () => {
    __setReadsFail(true);

    await expect(
      seminarLoad({ params: { id: "any" } } as never),
    ).rejects.toSatisfy((e) => isHttpError(e, 503));
  });
});
