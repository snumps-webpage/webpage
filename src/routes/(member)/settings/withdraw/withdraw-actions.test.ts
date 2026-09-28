import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
const notifyExecutivesOfWithdrawal = vi.hoisted(() => vi.fn(async () => true));
vi.mock("$lib/server/mail/announcements", () => ({
  notifyExecutivesOfWithdrawal,
}));

import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { capabilitiesFor } from "$lib/server/core/capabilities";
import { nowKstIso } from "$lib/server/core/time";
import type { Member, Study } from "$lib/server/data/schemas";
import { actions } from "./+page.server";

/**
 * The withdrawal page renders per-field issues for the three confirmations,
 * but the action handed raw form values to the service, which answered one
 * bare VALIDATION_FAILED. The action now validates with the domain rules
 * (validateWithdrawalRequestForm) and answers {error, issues, values}; the
 * service still re-checks all three factors (defense in depth).
 */

const MEMBER_ID = "m1";
const NAME = "홍길동";

const locals = {
  member: {
    memberId: MEMBER_ID,
    privateInfoId: "p1",
    name: NAME,
    status: "regular",
    isAdmin: false,
    isAlumni: false,
    registered: true,
    capabilities: capabilitiesFor({ isAlumni: false, registered: true }),
  },
  auth: async () => ({
    user: { email: "m1@snu.ac.kr", name: NAME },
    expires: "",
  }),
} as unknown as App.Locals;

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/settings/withdraw", {
      method: "POST",
      body,
    }),
    locals,
  };
}

const valid = { ackInfo: "on", ackDataPolicy: "on", confirmName: NAME };

const member: Member = {
  id: MEMBER_ID,
  name: NAME,
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "regular",
  statusChangedAt: nowKstIso(),
  withdrawal: null,
  isAlumni: false,
  alumniRevoked: false,
  roles: [],
  isAdmin: false,
  publicContact: null,
  alumniRevocationReason: null,
  project: null,
  legacyMemberId: null,
  sourceRequestId: null,
};

const statusOf = async () =>
  (await getTable("members")).find((m) => m.id === MEMBER_ID)?.status;

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["members", "studies"]) await invalidateCache(`table_${t}`);
  await mutate("members", () => [member]);
  notifyExecutivesOfWithdrawal.mockClear();
});

describe("requestWithdrawal action", () => {
  it("withdraws on three valid confirmations and redirects", async () => {
    await expect(
      actions.requestWithdrawal(post({ ...valid, confirmName: ` ${NAME} ` })),
    ).rejects.toMatchObject({ status: 303, location: "/withdraw/pending" });

    expect(await statusOf()).toBe("withdrawn");
    expect(notifyExecutivesOfWithdrawal).toHaveBeenCalledOnce();
  });

  it.each([
    ["ackInfo", { ackInfo: "" }],
    ["ackDataPolicy", { ackDataPolicy: "" }],
    ["confirmName", { confirmName: "" }],
    ["confirmName", { confirmName: "김철수" }],
    ["confirmName", { confirmName: "가".repeat(201) }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, over) => {
      const result = await actions.requestWithdrawal(
        post({ ...valid, ...over }),
      );

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
          values: { confirmName: expect.any(String) },
        },
      });
      expect(await statusOf()).toBe("regular");
      expect(notifyExecutivesOfWithdrawal).not.toHaveBeenCalled();
    },
  );

  it("reports every bad field at once, not the first one", async () => {
    const result = (await actions.requestWithdrawal(
      post({ confirmName: "x" }),
    )) as unknown as { data: { issues: Record<string, string> } };

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "ackDataPolicy",
      "ackInfo",
      "confirmName",
    ]);
    expect(await statusOf()).toBe("regular");
  });

  it("answers CONFLICT — the code the page shows its organizer note for — while the member organizes a study", async () => {
    const study = {
      id: "s1",
      title: "해석학",
      semester: "26-2",
      textbook: "",
      description: "",
      note: "",
      organizerIds: [MEMBER_ID],
      participantIds: [MEMBER_ID],
      pendingParticipantIds: [],
      pendingTransfer: null,
      schedule: [],
      transferHistory: [],
      photos: [],
      status: "ongoing",
      sourceRequestId: null,
    } satisfies Study;
    await mutate("studies", () => [study]);

    const result = await actions.requestWithdrawal(post(valid));

    expect(result).toMatchObject({ status: 409, data: { error: "CONFLICT" } });
    expect(await statusOf()).toBe("regular");
  });
});
