import { beforeEach, expect, it, vi } from "vitest";
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { createSeminarSeries } from "$lib/server/services/seminar-series";
import { actions, load } from "./+page.server";
const locals = {
  auth: async () => ({ user: { email: "admin@snu.ac.kr", name: "관리자" } }),
  member: { memberId: "admin", isAdmin: true },
} as unknown as App.Locals;
beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests();
  for (const name of [
    "members",
    "legacy-members",
    "seminars",
    "seminar-series",
    "events",
    "activities",
  ])
    await invalidateCache(`table_${name}`);
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [
      {
        id: "admin",
        name: "관리자",
        department: "수리",
        joinedAt: "2024-03-01",
        status: "regular",
        statusChangedAt: "2026-11-03T00:00:00Z",
        withdrawal: null,
        isAlumni: false,
        alumniRevoked: false,
        alumniRevocationReason: null,
        roles: [],
        isAdmin: true,
        publicContact: null,
        project: null,
        legacyMemberId: null,
        sourceRequestId: null,
      },
    ],
  });
});
it("detail creates a session under the URL parent and reloads its own record", async () => {
  const parent = await createSeminarSeries("admin", {
    title: "관리자 세미나",
    description: "",
  });
  const data = new FormData();
  data.set("semester", "26-2");
  data.set("title", "첫 회차");
  data.append("presenterIds", "admin");
  const result = await actions.createSession({
    request: new Request("http://local", { method: "POST", body: data }),
    locals,
    params: { id: parent.id },
  });
  expect(result).toMatchObject({ operation: "sessionCreated" });
  const page = (await load({ locals, params: { id: parent.id } } as never)) as {
    sessions: Array<{
      title: string;
      seriesId: string;
      presenterNames: string[];
    }>;
  };
  expect(page.sessions).toMatchObject([
    { title: "첫 회차", seriesId: parent.id, presenterNames: ["관리자"] },
  ]);
  expect(await getTable("activities")).toEqual([]);
});
it("missing parent rejects session creation without an orphan session", async () => {
  const data = new FormData();
  data.set("semester", "26-2");
  const result = await actions.createSession({
    request: new Request("http://local", { method: "POST", body: data }),
    locals,
    params: { id: "missing" },
  });
  expect(result).toMatchObject({ status: 404 });
  expect(await getTable("seminars")).toEqual([]);
});
