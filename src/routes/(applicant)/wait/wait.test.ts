import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirect } from "@sveltejs/kit";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { capabilitiesFor } from "$lib/server/core/capabilities";
import { nowKstIso } from "$lib/server/core/time";
import type { MemberContext } from "$lib/server/guards/zone";
import { load as layoutLoad } from "../+layout.server";
import { load as waitLoad } from "./+page.server";

/**
 * S9: a member who has not registered for this term re-applies through
 * /signup and waits on /wait like anyone else. The zone guard lets them into
 * the applicant zone; /wait must not send them back out.
 */

const EMAIL = "m1@snu.ac.kr";

function member(registered: boolean): MemberContext {
  return {
    memberId: "m1",
    privateInfoId: "p1",
    name: "회원",
    status: "regular",
    isAdmin: false,
    isAlumni: true,
    registered,
    capabilities: capabilitiesFor({ isAlumni: true, registered }),
  };
}

async function visitWait(m: MemberContext) {
  const locals = {
    member: m,
    auth: async () => ({ user: { email: EMAIL, name: "회원" }, expires: "" }),
  } as unknown as App.Locals;
  const parentData = await layoutLoad({ locals } as Parameters<
    typeof layoutLoad
  >[0]);
  return waitLoad({
    locals,
    parent: async () => parentData,
  } as unknown as Parameters<typeof waitLoad>[0]);
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await invalidateCache("table_applications");
  await mutate("applications", () => [
    {
      id: "a1",
      name: "회원",
      email: EMAIL,
      phone: "010-1234-5678",
      department: "수리과학부",
      studentId: "2020-12345",
      background: "",
      createdAt: nowKstIso(),
    },
  ]);
});

describe("/wait", () => {
  it("shows the pending re-application of an unregistered member", async () => {
    const data = await visitWait(member(false));

    expect(data).toMatchObject({ application: { email: EMAIL } });
  });

  it("still sends a member registered this term home", async () => {
    await expect(visitWait(member(true))).rejects.toSatisfy(
      (e) => isRedirect(e) && e.location === "/",
    );
  });
});
