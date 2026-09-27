// @vitest-environment node
// (a real undici File in the form body — jsdom's Blob is not accepted by Request)
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { capabilitiesFor } from "$lib/server/core/capabilities";
import { actions } from "./+page.server";

/**
 * The profile action read `phone` with a cast and called .replace() on it
 * before the auth wrapper, so a File in that field answered 500 — for anyone,
 * signed in or not (audit LC09-3, reproduced).
 */

const locals = {
  member: {
    memberId: "m1",
    privateInfoId: "p1",
    name: "회원",
    status: "regular",
    isAdmin: false,
    isAlumni: false,
    registered: true,
    capabilities: capabilitiesFor({ isAlumni: false, registered: true }),
  },
  auth: async () => ({
    user: { email: "m1@snu.ac.kr", name: "회원" },
    expires: "",
  }),
} as unknown as App.Locals;

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await invalidateCache("table_private-info");
  await mutate("private-info", () => [
    {
      id: "p1",
      memberId: "m1",
      email: "m1@snu.ac.kr",
      phone: "010-0000-0000",
      background: "",
      studentId: "",
      mailPrefs: { announcements: true },
      hidePublicPhone: false,
      sourceRequestId: null,
    },
  ]);
});

describe("updateProfile", () => {
  it("treats a file sent as the phone as an empty field, not a crash", async () => {
    const body = new FormData();
    body.set("phone", new File(["x"], "phone.txt"));
    body.set("background", "");

    const result = await actions.updateProfile({
      request: new Request("http://localhost/", { method: "POST", body }),
      locals,
      url: new URL("http://localhost/"),
      cookies: { get: () => undefined, set: () => {}, delete: () => {} },
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: { error: "VALIDATION_FAILED" },
    });
    expect((await getTable("private-info"))[0].phone).toBe("010-0000-0000");
  });
});
