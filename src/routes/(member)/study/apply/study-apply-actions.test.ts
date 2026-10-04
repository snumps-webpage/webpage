import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
const mail = vi.hoisted(() => ({
  sendStudyApplicationNotification: vi.fn(async () => undefined),
}));
vi.mock("$lib/server/mail", () => mail);

import { __reset, __setWritesFail } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { submitStudyRequest } from "$lib/server/services/studies";
import { actions, load } from "./+page.server";

/**
 * StudyRequestForm already renders per-field issues (title, textbook,
 * description, semester), but the action checked only the title and the
 * semester, one message at a time, and stored textbook and description
 * unbounded. It now validates with studyRequestInputSchema — the single
 * source of the rules — and answers {error, issues, values}.
 */

const MEMBER_ID = "m1";
const locals = {
  member: { memberId: MEMBER_ID, name: "회원", isAdmin: false },
  auth: async () => ({
    user: { email: "m1@snu.ac.kr", name: "회원" },
    expires: "",
  }),
} as unknown as App.Locals;

function post(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/study/apply", {
      method: "POST",
      body,
    }),
    locals,
  };
}

type Failure = {
  status: number;
  data: {
    error: string;
    issues: Record<string, string>;
    values: Record<string, string>;
  };
};

const valid = {
  title: "  범주론 읽기 모임 ",
  textbook: " Mac Lane, Categories for the Working Mathematician ",
  description: "  정의와 예제를 함께 읽고 매주 연습문제를 토론합니다.  ",
  semester: " 26-2 ",
};

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await invalidateCache("table_study-requests");
  mail.sendStudyApplicationNotification.mockClear();
});

describe("study/apply", () => {
  it("stores a valid request, trimmed, and notifies the admins", async () => {
    const result = await actions.submit(post(valid));

    expect(result).toMatchObject({
      success: true,
      operation: "requestSubmitted",
      requestId: expect.any(String),
    });
    const [row] = await getTable("study-requests");
    expect(row).toMatchObject({
      title: "범주론 읽기 모임",
      textbook: "Mac Lane, Categories for the Working Mathematician",
      description: "정의와 예제를 함께 읽고 매주 연습문제를 토론합니다.",
      semester: "26-2",
      requesterId: MEMBER_ID,
      status: "pending",
    });
    expect(mail.sendStudyApplicationNotification).toHaveBeenCalledWith(
      "회원",
      "범주론 읽기 모임",
    );
  });

  it.each([
    ["title", { title: "가" }],
    ["title", { title: "가".repeat(121) }],
    ["textbook", { textbook: "  " }],
    ["textbook", { textbook: "가".repeat(241) }],
    ["description", { description: "짧음" }],
    ["description", { description: "가".repeat(2401) }],
    ["semester", { semester: "2026-2" }],
    ["semester", { semester: "" }],
  ])(
    "refuses a bad %s with a field issue, writes nothing and sends no mail",
    async (field, over) => {
      const result = await actions.submit(post({ ...valid, ...over }));

      expect(result).toMatchObject({
        status: 400,
        data: {
          operation: "requestSubmitted",
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
          values: { semester: expect.any(String) },
        },
      });
      expect(await getTable("study-requests")).toEqual([]);
      expect(mail.sendStudyApplicationNotification).not.toHaveBeenCalled();
    },
  );

  it("echoes the submitted values", async () => {
    const result = (await actions.submit(
      post({ ...valid, semester: "x" }),
    )) as unknown as Failure;

    expect(result.data.values).toEqual({ ...valid, semester: "x" });
  });

  it("reports every bad field at once, not the first one", async () => {
    const result = (await actions.submit(
      post({ title: "", textbook: "", description: "", semester: "" }),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "description",
      "semester",
      "textbook",
      "title",
    ]);
  });
});

describe("study/apply ?/withdraw", () => {
  it("still answers CONFLICT for a request that is no longer pending", async () => {
    const row = await submitStudyRequest({
      title: "범주론",
      textbook: "",
      description: "",
      semester: "26-2",
      requesterId: MEMBER_ID,
    });
    await actions.withdraw(post({ id: row.id }));

    const result = await actions.withdraw(post({ id: row.id }));

    expect(result).toMatchObject({ status: 409, data: { error: "CONFLICT" } });
  });
});

describe("study proposal response identity and guarded history", () => {
  it("never mixes default and named actions", () => {
    expect(Object.keys(actions).sort()).toEqual(["submit", "withdraw"]);
  });
  it("keeps the submitted draft and operation when the store cannot write", async () => {
    __setWritesFail(true);
    try {
      expect(await actions.submit(post(valid))).toMatchObject({
        status: 503,
        data: {
          error: "SERVICE_UNAVAILABLE",
          operation: "requestSubmitted",
          values: valid,
        },
      });
      expect(mail.sendStudyApplicationNotification).not.toHaveBeenCalled();
    } finally {
      __setWritesFail(false);
    }
  });
  it("identifies successful and repeated withdrawal responses", async () => {
    const row = await submitStudyRequest({
      title: "예시 스터디",
      textbook: "",
      description: "",
      semester: "26-2",
      requesterId: MEMBER_ID,
    });
    expect(await actions.withdraw(post({ id: row.id }))).toEqual({
      success: true,
      operation: "requestWithdrawn",
      requestId: row.id,
    });
    expect(await actions.withdraw(post({ id: row.id }))).toMatchObject({
      status: 409,
      data: {
        operation: "requestWithdrawn",
        requestId: row.id,
        error: "CONFLICT",
      },
    });
  });
  it("rejects empty targets without writing and keeps missing target status404", async () => {
    expect(await actions.withdraw(post({ id: "" }))).toMatchObject({
      status: 400,
      data: {
        operation: "requestWithdrawn",
        issues: { _form: expect.any(String) },
      },
    });
    expect(await actions.withdraw(post({ id: "missing" }))).toMatchObject({
      status: 404,
      data: { operation: "requestWithdrawn", requestId: "missing" },
    });
  });
  it("does not let another requester withdraw or see someone else's proposal", async () => {
    const own = await submitStudyRequest({
      title: "내 신청",
      textbook: "",
      description: "",
      semester: "26-2",
      requesterId: MEMBER_ID,
    });
    const other = await submitStudyRequest({
      title: "다른 신청",
      textbook: "",
      description: "",
      semester: "26-2",
      requesterId: "other",
    });
    expect(await actions.withdraw(post({ id: other.id }))).toMatchObject({
      status: 403,
      data: { error: "FORBIDDEN" },
    });
    const data = await load({ locals } as unknown as Parameters<
      typeof load
    >[0]);
    expect(
      data?.myRequests.map((request: { id: string }) => request.id),
    ).toEqual([own.id]);
    expect(data?.canSubmit).toBe(false);
    expect(JSON.stringify(data)).not.toContain('"requesterId"');
  });
});
