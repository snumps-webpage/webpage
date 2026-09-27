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
 * setMailPref coerced any `enabled` other than "true" to false, so a
 * malformed post silently unsubscribed the member. It now validates with
 * validateMailPreferenceForm and answers {error, issues, values}.
 */

const MEMBER_ID = "m1";

const locals = {
  member: {
    memberId: MEMBER_ID,
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

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/settings/notifications", {
      method: "POST",
      body,
    }),
    locals,
  };
}

const announcements = async () =>
  (await getTable("private-info"))[0].mailPrefs.announcements;

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await invalidateCache("table_private-info");
  await mutate("private-info", () => [
    {
      id: "p1",
      memberId: MEMBER_ID,
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

describe("setMailPref action", () => {
  it("turns the announcement mail off and back on", async () => {
    expect(
      await actions.setMailPref(
        post({ type: "announcements", enabled: "false" }),
      ),
    ).toMatchObject({ success: true });
    expect(await announcements()).toBe(false);

    await actions.setMailPref(post({ type: "announcements", enabled: "true" }));
    expect(await announcements()).toBe(true);
  });

  it.each([
    ["type", { type: "digest", enabled: "false" }],
    ["type", { enabled: "false" }],
    ["enabled", { type: "announcements", enabled: "no" }],
    ["enabled", { type: "announcements" }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, fields) => {
      const result = await actions.setMailPref(post(fields));

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
          values: { type: expect.any(String), enabled: expect.any(String) },
        },
      });
      expect(await announcements()).toBe(true);
    },
  );

  it("reports every bad field at once, not the first one", async () => {
    const result = (await actions.setMailPref(
      post({ type: "x", enabled: "x" }),
    )) as unknown as { data: { issues: Record<string, string> } };

    expect(Object.keys(result.data.issues).sort()).toEqual(["enabled", "type"]);
    expect(await announcements()).toBe(true);
  });
});
