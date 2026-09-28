import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const mailOk = vi.hoisted(() => ({ value: true }));
const mail = vi.hoisted(() => ({
  sendApplicationRejectedEmail: vi.fn(async () => mailOk.value),
  sendSeminarStatusNotification: vi.fn(async () => mailOk.value),
  sendStudyStatusNotification: vi.fn(async () => mailOk.value),
  sendWelcomeEmail: vi.fn(async () => mailOk.value),
}));
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail", () => mail);
vi.mock("$lib/server/services/membership", () => ({
  approveApplication: async () => ({ name: "홍길동", email: "hong@snu.ac.kr" }),
  rejectApplication: async () => ({ name: "홍길동", email: "hong@snu.ac.kr" }),
}));
vi.mock("$lib/server/services/seminar-requests", () => ({
  approveSeminar: async () => ({ presenterIds: ["m1"], title: "세미나" }),
  rejectSeminar: async () => ({ presenterIds: ["m1"], title: "세미나" }),
}));
vi.mock("$lib/server/services/studies", () => ({
  approveStudy: async () => ({ requesterId: "m1", title: "스터디" }),
  rejectStudy: async () => ({ requesterId: "m1", title: "스터디" }),
}));
vi.mock("$lib/server/data/repos", () => ({
  getMemberById: async (id: string) => ({ id, name: "홍길동" }),
  getPrivateInfoOf: async () => ({ email: "hong@snu.ac.kr" }),
}));

import { actions } from "./+page.server";

const admin = {
  member: {
    memberId: "admin",
    privateInfoId: null,
    name: "관리자",
    status: "regular",
    isAdmin: true,
    isAlumni: false,
    registered: true,
    capabilities: [],
  },
  auth: async () => ({ user: { email: "admin@snu.ac.kr", name: "관리자" } }),
} as unknown as App.Locals;

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/admin", { method: "POST", body }),
    locals: admin,
  } as never;
}

// Decision #16 / audit LB14-1: the review actions threw away the notice's
// send result, so a failed welcome or rejection letter — the rejection's
// address is already deleted — showed as a clean success. The action still
// succeeds; it now says `mailFailed` so the admin screen can warn.
describe("review actions report a failed notice (#16, LB14-1)", () => {
  const reviewActions = [
    ["approve", mail.sendWelcomeEmail],
    ["reject", mail.sendApplicationRejectedEmail],
    ["approveSeminar", mail.sendSeminarStatusNotification],
    ["rejectSeminar", mail.sendSeminarStatusNotification],
    ["approveStudy", mail.sendStudyStatusNotification],
    ["rejectStudy", mail.sendStudyStatusNotification],
  ] as const;

  beforeEach(() => {
    for (const fn of Object.values(mail)) fn.mockClear();
  });

  it.each(reviewActions)(
    "?/%s succeeds with mailFailed:true when the notice fails",
    async (name, sender) => {
      mailOk.value = false;
      const action = actions[name] as (e: never) => Promise<unknown>;

      const result = await action(post({ id: "r1" }));

      expect(sender).toHaveBeenCalledOnce();
      expect(result).toEqual({ success: true, mailFailed: true });
    },
  );

  it.each(reviewActions)(
    "?/%s succeeds with mailFailed:false when the notice goes out",
    async (name) => {
      mailOk.value = true;
      const action = actions[name] as (e: never) => Promise<unknown>;

      const result = await action(post({ id: "r1" }));

      expect(result).toEqual({ success: true, mailFailed: false });
    },
  );
});
