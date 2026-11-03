import { beforeEach, expect, it, vi } from "vitest";
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
import { __reset, __putRawDoc } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests();
  await invalidateCache("table_seminar-series");
});
const locals = (admin: boolean) =>
  ({
    auth: async () => ({
      user: { email: "admin@snu.ac.kr", name: "관리자" },
      expires: "2099-01-01",
    }),
    member: { memberId: "admin", isAdmin: admin, status: "regular", roles: [] },
  }) as unknown as App.Locals;

it("creates the parent through an authenticated admin action", async () => {
  await __putRawDoc("table", "members", {
    schemaVersion: 1,
    rows: [{ id: "admin", isAdmin: true, status: "regular" }],
  });
  const { actions } = await import("./+page.server");
  const form = new FormData();
  form.set("title", "새 상위");
  form.set("description", "소개");
  const result = await actions.create({
    request: new Request("http://local", { method: "POST", body: form }),
    locals: locals(true),
  } as never);
  expect(result).toMatchObject({ operation: "created" });
});
it("rejects a non-admin action before creating records", async () => {
  const { actions } = await import("./+page.server");
  const form = new FormData();
  form.set("title", "불가");
  const result = await actions.create({
    request: new Request("http://local", { method: "POST", body: form }),
    locals: locals(false),
  } as never);
  expect(result).toMatchObject({ status: 403 });
});
