import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail", () => ({
  sendSignupNotification: async () => undefined,
}));

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { actions as signup } from "./+page.server";
import { actions as edit } from "./edit/+page.server";

/**
 * The signup form already renders per-field issues (studentId, phone,
 * background, agreement), but the actions threw one message at a time and
 * accepted any phone shape. They now validate with the domain schema — the
 * single source of the rules — and answer {error, issues, values}.
 */

const EMAIL = "new@snu.ac.kr";
const locals = {
  member: null,
  auth: async () => ({
    user: { email: EMAIL, name: "홍길동 / 학부생 / 수리과학부" },
    expires: "",
  }),
} as unknown as App.Locals;

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/signup", { method: "POST", body }),
    locals,
    url: new URL("http://localhost/signup"),
  } as never;
}

const valid = {
  phone: "01012345678",
  studentId: "2020-12345",
  background: "  해석학  ",
  agreement: "on",
};

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await invalidateCache("table_applications");
});

describe("signup", () => {
  it("stores a valid application, normalized", async () => {
    const result = await signup.default(post(valid));

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("applications");
    expect(row).toMatchObject({
      email: EMAIL,
      phone: "010-1234-5678",
      studentId: "2020-12345",
      background: "해석학",
    });
  });

  it.each([
    ["phone", { phone: "12" }],
    ["studentId", { studentId: "abc" }],
    ["background", { background: "가".repeat(2001) }],
    ["agreement", { agreement: "" }],
  ])(
    "refuses a bad %s with a field issue and writes nothing",
    async (field, over) => {
      const result = await signup.default(post({ ...valid, ...over }));

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
          values: { phone: expect.any(String) },
        },
      });
      expect(await getTable("applications")).toEqual([]);
    },
  );

  it("reports every bad field at once, not the first one", async () => {
    const result = (await signup.default(
      post({ phone: "1", studentId: "x", background: "", agreement: "" }),
    )) as unknown as { data: { issues: Record<string, string> } };

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "agreement",
      "phone",
      "studentId",
    ]);
  });
});

describe("signup/edit", () => {
  beforeEach(async () => {
    await signup.default(post(valid));
  });

  it("updates the own application, normalized", async () => {
    const result = await edit.default(
      post({ phone: "010 9999 8888", studentId: "2021-54321", background: "" }),
    );

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("applications");
    expect(row).toMatchObject({
      phone: "010-9999-8888",
      studentId: "2021-54321",
    });
  });

  it("refuses a bad phone with a field issue and keeps the row", async () => {
    const result = await edit.default(
      post({ phone: "12", studentId: "2021-54321", background: "" }),
    );

    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        issues: { phone: expect.any(String) },
      },
    });
    const [row] = await getTable("applications");
    expect(row.phone).toBe("010-1234-5678");
  });
});
