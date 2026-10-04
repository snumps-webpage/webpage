import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isActionFailure,
  isHttpError,
  type ActionFailure,
} from "@sveltejs/kit";

const service = vi.hoisted(() => ({
  addRoleTitle: vi.fn(),
  assignRole: vi.fn(),
  getTermBoard: vi.fn(),
  listRoleTitles: vi.fn(),
  removeRoleTitle: vi.fn(),
  unassignRole: vi.fn(),
}));
vi.mock("$lib/server/services/executives-admin", () => service);
vi.mock("$lib/server/core/semester", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/server/core/semester")>()),
  currentTerm: () => "26-2",
}));
vi.mock("$lib/server/guards/resolve-member", () => ({
  resolveMember: vi.fn(),
}));
vi.mock("$lib/server/cache", () => ({ invalidateCache: vi.fn() }));
vi.mock("$lib/server/data/tables", () => ({ getTable: vi.fn() }));

import { AppError } from "$lib/server/core/errors";
import { actions, load } from "./+page.server";

function locals(isAdmin = true) {
  return {
    member: { memberId: "admin", isAdmin },
    auth: async () => ({ user: { email: "admin@snu.ac.kr", name: "관리자" } }),
  } as unknown as App.Locals;
}

function post(
  fields: Record<string, string>,
  query = "?term=27-1&title=회장",
  caller = locals(),
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const url = new URL(`http://localhost/admin/executives${query}`);
  return {
    request: new Request(url, { method: "POST", body }),
    url,
    locals: caller,
  };
}

const cases = [
  ["assign", "assigned", service.assignRole],
  ["unassign", "unassigned", service.unassignRole],
  ["addTitle", "title-added", service.addRoleTitle],
  ["removeTitle", "title-removed", service.removeRoleTitle],
] as const;

const raw = {
  memberId: " member-1 ",
  term: " 25-2 ",
  title: " 회장 ",
  viewTerm: "28-1",
  actorId: "forged-actor",
  unrelated: "must-not-be-echoed",
};

beforeEach(() => {
  for (const mock of Object.values(service)) mock.mockReset();
  service.getTermBoard.mockImplementation(async (term: string) => ({
    term,
    assignments: [{ memberId: "member-1", title: "회장" }],
    candidates: [{ id: "member-1", name: "회원" }],
  }));
  service.listRoleTitles.mockResolvedValue([
    { title: "회장", isCustom: false },
    { title: "기록부장", isCustom: true },
  ]);
});

afterEach(() => vi.restoreAllMocks());

describe("executive action feedback", () => {
  it.each(cases)(
    "tags %s without changing its operation or service inputs",
    async (name, operation, mock) => {
      const result = await actions[name](post(raw));
      expect(result).toEqual({
        success: true,
        operation,
        scope: "executive",
        action: name,
        targetKey: "회장",
        title: "회장",
        viewTerm: "27-1",
        ...(name === "assign" || name === "unassign"
          ? { targetTerm: "25-2" }
          : {}),
      });
      expect(mock).toHaveBeenCalledOnce();
      if (name === "assign" || name === "unassign") {
        expect(mock).toHaveBeenCalledWith({
          memberId: "member-1",
          term: "25-2",
          title: "회장",
          actorId: "admin",
        });
      } else {
        expect(mock).toHaveBeenCalledWith("회장");
      }
    },
  );

  it.each(cases)(
    "preserves %s business refusal and only its raw fields",
    async (name, _operation, mock) => {
      mock.mockRejectedValue(
        new AppError("CONFLICT", { userMessage: "이미 있는 배정입니다." }),
      );
      const result = await actions[name](post(raw));
      expect(isActionFailure(result)).toBe(true);
      expect(result).toMatchObject({
        status: 409,
        data: {
          error: "CONFLICT",
          message: "이미 있는 배정입니다.",
          scope: "executive",
          action: name,
          targetKey: "회장",
          title: "회장",
          viewTerm: "27-1",
          ...(name === "assign" || name === "unassign"
            ? { targetTerm: "25-2" }
            : {}),
        },
      });
      const failure = result as ActionFailure<Record<string, unknown>>;
      expect(failure.data.values).toEqual(
        name === "assign" || name === "unassign"
          ? { memberId: raw.memberId, term: raw.term, title: raw.title }
          : { title: raw.title },
      );
    },
  );

  it.each(cases)(
    "keeps %s unavailable distinct from a refusal",
    async (name, _operation, mock) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mock.mockRejectedValue(new Error("private database failure"));
      const result = await actions[name](post(raw));
      expect(result).toMatchObject({
        status: 500,
        data: { error: "SERVICE_UNAVAILABLE", action: name },
      });
      expect(JSON.stringify(result)).not.toContain("private database failure");
    },
  );

  it.each(cases)(
    "retains the admin guard for %s",
    async (name, _operation, mock) => {
      const result = await actions[name](
        post(raw, "?term=27-1", locals(false)),
      );
      expect(result).toMatchObject({
        status: 403,
        data: { error: "FORBIDDEN", scope: "executive", action: name },
      });
      expect(mock).not.toHaveBeenCalled();
    },
  );

  it("uses posted viewTerm only as fallback display context", async () => {
    const result = await actions.assign(post(raw, ""));
    expect(result).toMatchObject({ viewTerm: "28-1" });
    expect(service.assignRole).toHaveBeenCalledWith(
      expect.objectContaining({ term: "25-2" }),
    );
  });

  it.each(["assign", "unassign"] as const)(
    "reports the posted targetTerm truthfully when %s changes a different term from the viewed board",
    async (name) => {
      const result = await actions[name](post(raw, "?term=27-1"));
      expect(result).toMatchObject({
        success: true,
        action: name,
        viewTerm: "27-1",
        targetTerm: "25-2",
      });
      const mock =
        name === "assign" ? service.assignRole : service.unassignRole;
      expect(mock).toHaveBeenCalledWith({
        memberId: "member-1",
        term: "25-2",
        title: "회장",
        actorId: "admin",
      });
    },
  );

  it("falls back to the actual current term without view metadata", async () => {
    const result = await actions.addTitle(post({ title: "기록부장" }, ""));
    expect(result).toMatchObject({ viewTerm: "26-2" });
  });

  it("reads display context from the request URL when no event URL is supplied", async () => {
    const { url: _url, ...ctx } = post(raw);
    expect(await actions.assign(ctx)).toMatchObject({ viewTerm: "27-1" });
  });
});

describe("executive board selection", () => {
  it.each([
    ["회장", "회장"],
    ["기록부장", "기록부장"],
    ["removed-title", ""],
    [" 회장 ", ""],
    ["", ""],
  ])(
    "only accepts the current role option %s",
    async (title, selectedTitle) => {
      const url = new URL("http://localhost/admin/executives?term=27-1");
      url.searchParams.set("title", title);
      const data = await load({ locals: locals(), url } as never);
      expect(data).toMatchObject({
        term: "27-1",
        currentTerm: "26-2",
        selectedTitle,
        assignments: [{ memberId: "member-1", title: "회장" }],
        candidates: [{ id: "member-1", name: "회원" }],
      });
      expect(service.getTermBoard).toHaveBeenCalledWith("27-1");
    },
  );

  it("clears a removed custom title on the refreshed load", async () => {
    const ctx = post({ title: "기록부장" }, "?term=27-1&title=기록부장");
    expect(await actions.removeTitle(ctx)).toMatchObject({
      operation: "title-removed",
    });
    service.listRoleTitles.mockResolvedValue([
      { title: "회장", isCustom: false },
    ]);
    const data = await load({ locals: locals(), url: ctx.url } as never);
    expect(data).toMatchObject({
      term: "27-1",
      currentTerm: "26-2",
      selectedTitle: "",
    });
  });

  it("keeps the current-term default for an unselected board", async () => {
    expect(
      await load({
        locals: locals(),
        url: new URL("http://localhost/admin/executives"),
      } as never),
    ).toMatchObject({ term: "26-2", currentTerm: "26-2", selectedTitle: "" });
  });

  it("leaves invalid query term behavior with the existing board service", async () => {
    const refusal = new AppError("VALIDATION_FAILED");
    service.getTermBoard.mockRejectedValue(refusal);
    await expect(
      load({
        locals: locals(),
        url: new URL("http://localhost/admin/executives?term=invalid"),
      } as never),
    ).rejects.toBe(refusal);
    expect(service.getTermBoard).toHaveBeenCalledWith("invalid");
  });

  it("retains the silent non-admin load guard before any board reads", async () => {
    try {
      await load({
        locals: locals(false),
        url: new URL("http://localhost/admin/executives"),
      } as never);
      throw new Error("Expected hidden admin route");
    } catch (error) {
      expect(isHttpError(error)).toBe(true);
      expect(error).toMatchObject({ status: 404 });
    }
    expect(service.getTermBoard).not.toHaveBeenCalled();
    expect(service.listRoleTitles).not.toHaveBeenCalled();
  });
});
