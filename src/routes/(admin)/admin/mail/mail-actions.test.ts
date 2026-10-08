import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isActionFailure,
  isHttpError,
  type ActionFailure,
} from "@sveltejs/kit";

// Every mail-admin export is a fake: route tests cannot reach Gmail transport,
// template/rule/variable storage, recipients, or event dispatch.
const service = vi.hoisted(() => ({
  addMailRule: vi.fn(),
  createMailTemplate: vi.fn(),
  deleteMailTemplate: vi.fn(),
  deleteMailVariable: vi.fn(),
  listMailEvents: vi.fn(),
  listMailTemplates: vi.fn(),
  listMailVariables: vi.fn(),
  removeMailRule: vi.fn(),
  revertMailEvent: vi.fn(),
  revertMailTemplate: vi.fn(),
  revertMailVariable: vi.fn(),
  saveMailTemplate: vi.fn(),
  saveMailVariable: vi.fn(),
  sendTestEvent: vi.fn(),
  sendTestTemplate: vi.fn(),
  setMailRuleEnabled: vi.fn(),
  setMailTemplateEnabled: vi.fn(),
}));
vi.mock("$lib/server/services/mail-admin", () => service);
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

function post(fields: Record<string, string>, caller = locals()) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return {
    request: new Request("http://localhost/admin/mail", {
      method: "POST",
      body,
    }),
    locals: caller,
  };
}

// Native multipart serialization delivers CRLF newlines to request.formData().
// These raw wire values retain every surrounding space and newline unchanged.
const raw: Record<string, string> = {
  key: " custom-1 ",
  name: " 이름 ",
  subject: "  제목\r\n ",
  body: " 본문\r\n{{unsupported}}\r\n ",
  enabled: "on",
  event: " application-approved ",
  templateKey: " custom-1 ",
  recipient: " member ",
  ruleId: " rule-1 ",
  to: " admin@snu.ac.kr ",
  value: " 원본\r\n값 ",
  description: " 설명 ",
  editor: "edit",
  scope: "forged-scope",
  targetKey: "forged-target",
  unrelated: "must-not-be-echoed",
};

const cases: {
  name: keyof typeof actions;
  scope: string;
  targetKey: string;
  operation: string;
  fields: string[];
  mock: typeof service.saveMailTemplate;
  args: unknown[];
}[] = [
  {
    name: "save",
    scope: "mail-template",
    targetKey: "custom-1",
    operation: "saved",
    fields: ["key", "subject", "body", "enabled"],
    mock: service.saveMailTemplate,
    args: [
      { key: "custom-1", subject: raw.subject, body: raw.body, enabled: true },
    ],
  },
  {
    name: "toggle",
    scope: "mail-template",
    targetKey: "custom-1",
    operation: "toggled",
    fields: ["key", "enabled"],
    mock: service.setMailTemplateEnabled,
    args: ["custom-1", false],
  },
  {
    name: "revertTemplate",
    scope: "mail-template",
    targetKey: "custom-1",
    operation: "reverted",
    fields: ["key"],
    mock: service.revertMailTemplate,
    args: ["custom-1"],
  },
  {
    name: "deleteTemplate",
    scope: "mail-template",
    targetKey: "custom-1",
    operation: "deleted",
    fields: ["key"],
    mock: service.deleteMailTemplate,
    args: ["custom-1"],
  },
  {
    name: "createTemplate",
    scope: "mail-template-create",
    targetKey: "custom-created",
    operation: "created",
    fields: ["name", "subject", "body"],
    mock: service.createMailTemplate,
    args: [{ name: "이름", subject: raw.subject, body: raw.body }],
  },
  {
    name: "addRule",
    scope: "mail-rule",
    targetKey: "application-approved",
    operation: "rule-added",
    fields: ["event", "templateKey", "recipient"],
    mock: service.addMailRule,
    args: [
      {
        event: "application-approved",
        templateKey: "custom-1",
        recipient: "member",
      },
    ],
  },
  {
    name: "removeRule",
    scope: "mail-rule",
    targetKey: "application-approved",
    operation: "rule-removed",
    fields: ["event", "ruleId", "templateKey", "recipient"],
    mock: service.removeMailRule,
    args: [
      {
        event: "application-approved",
        ruleId: "rule-1",
        templateKey: "custom-1",
        recipient: "member",
      },
    ],
  },
  {
    name: "toggleRule",
    scope: "mail-rule",
    targetKey: "application-approved",
    operation: "rule-toggled",
    fields: ["event", "ruleId", "templateKey", "recipient", "enabled"],
    mock: service.setMailRuleEnabled,
    args: [
      {
        event: "application-approved",
        ruleId: "rule-1",
        templateKey: "custom-1",
        recipient: "member",
        enabled: false,
      },
    ],
  },
  {
    name: "revertEvent",
    scope: "mail-rule",
    targetKey: "application-approved",
    operation: "event-reverted",
    fields: ["event"],
    mock: service.revertMailEvent,
    args: ["application-approved"],
  },
  {
    name: "saveVariable",
    scope: "mail-variable",
    targetKey: "custom-1",
    operation: "variable-saved",
    fields: ["key", "value", "description"],
    mock: service.saveMailVariable,
    args: [{ key: "custom-1", value: raw.value, description: "설명" }],
  },
  {
    name: "deleteVariable",
    scope: "mail-variable",
    targetKey: "custom-1",
    operation: "variable-deleted",
    fields: ["key"],
    mock: service.deleteMailVariable,
    args: ["custom-1"],
  },
  {
    name: "revertVariable",
    scope: "mail-variable",
    targetKey: "custom-1",
    operation: "variable-reverted",
    fields: ["key"],
    mock: service.revertMailVariable,
    args: ["custom-1"],
  },
  {
    name: "testTemplate",
    scope: "mail-test-template",
    targetKey: "custom-1",
    operation: "test-sent",
    fields: ["to", "templateKey"],
    mock: service.sendTestTemplate,
    args: ["admin@snu.ac.kr", "custom-1"],
  },
  {
    name: "testEvent",
    scope: "mail-test-event",
    targetKey: "application-approved",
    operation: "test-sent",
    fields: ["to", "event"],
    mock: service.sendTestEvent,
    args: ["admin@snu.ac.kr", "application-approved"],
  },
];

beforeEach(() => {
  for (const mock of Object.values(service)) mock.mockReset();
  service.createMailTemplate.mockResolvedValue("custom-created");
  service.removeMailRule.mockResolvedValue({ keptDisabled: false });
  service.sendTestEvent.mockResolvedValue(3);
  service.listMailEvents.mockResolvedValue([{ event: "application-approved" }]);
  service.listMailTemplates.mockResolvedValue([{ key: "custom-1" }]);
  service.listMailVariables.mockResolvedValue([{ key: "club_name" }]);
});

afterEach(() => vi.restoreAllMocks());

describe("mail action feedback without actual mail or storage", () => {
  it.each(cases)(
    "tags $name and keeps exactly the existing service inputs",
    async ({ name, scope, targetKey, operation, mock, args }) => {
      const result = await actions[name](post(raw));
      expect(result).toEqual({
        success: true,
        action: name,
        scope,
        targetKey,
        operation,
        ...(name === "createTemplate" ? { key: "custom-created" } : {}),
        ...(name === "testEvent" ? { count: 3 } : {}),
      });
      expect(mock).toHaveBeenCalledOnce();
      expect(mock).toHaveBeenCalledWith(...args);
      expect(
        Object.values(service).filter(
          (candidate) => candidate.mock.calls.length > 0,
        ),
      ).toEqual([mock]);
    },
  );

  it.each(cases)(
    "preserves $name refusal details and only the exact raw field whitelist",
    async ({ name, scope, targetKey, fields, mock }) => {
      mock.mockRejectedValue(
        new AppError("CONFLICT", { userMessage: "기존 규칙이 사용 중입니다." }),
      );
      const result = await actions[name](post(raw));
      expect(isActionFailure(result)).toBe(true);
      expect(result).toMatchObject({
        status: 409,
        data: {
          error: "CONFLICT",
          message: "기존 규칙이 사용 중입니다.",
          action: name,
          scope,
          targetKey: name === "createTemplate" ? "" : targetKey,
        },
      });
      const failure = result as ActionFailure<Record<string, unknown>>;
      expect(failure.data.values).toEqual(
        Object.fromEntries(fields.map((field) => [field, raw[field]])),
      );
      expect(failure.data).not.toHaveProperty("editor");
      expect(failure.data).not.toHaveProperty("unrelated");
    },
  );

  it.each(cases)(
    "reports $name unavailable separately from business refusal",
    async ({ name, scope, mock }) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mock.mockRejectedValue(new Error("private transport or storage failure"));
      const result = await actions[name](post(raw));
      expect(result).toMatchObject({
        status: 500,
        data: { error: "SERVICE_UNAVAILABLE", action: name, scope },
      });
      expect(JSON.stringify(result)).not.toContain(
        "private transport or storage failure",
      );
    },
  );

  it.each(cases)(
    "keeps the admin guard before $name reaches any service",
    async ({ name, scope }) => {
      const result = await actions[name](post(raw, locals(false)));
      expect(result).toMatchObject({
        status: 403,
        data: { error: "FORBIDDEN", action: name, scope },
      });
      for (const mock of Object.values(service))
        expect(mock).not.toHaveBeenCalled();
    },
  );

  it("preserves an explicitly unchecked save checkbox as an empty string on failure", async () => {
    const { enabled: _enabled, ...unchecked } = raw;
    service.saveMailTemplate.mockRejectedValue(
      new AppError("VALIDATION_FAILED"),
    );
    const result = await actions.save(post(unchecked));
    expect(result).toMatchObject({
      status: 400,
      data: {
        values: {
          key: raw.key,
          subject: raw.subject,
          body: raw.body,
          enabled: "",
        },
      },
    });
    expect(service.saveMailTemplate).toHaveBeenCalledWith({
      key: "custom-1",
      subject: raw.subject,
      body: raw.body,
      enabled: false,
    });
  });

  it.each(["on", "", "true"])(
    "echoes the exact enabled value '%s' on save failure",
    async (enabled) => {
      service.saveMailTemplate.mockRejectedValue(
        new AppError("VALIDATION_FAILED"),
      );
      expect(await actions.save(post({ ...raw, enabled }))).toMatchObject({
        data: { values: { enabled } },
      });
      expect(service.saveMailTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: enabled === "on" }),
      );
    },
  );

  it.each([false, true])(
    "preserves variable creation display scope on failure=%s without changing the service",
    async (failure) => {
      if (failure)
        service.saveMailVariable.mockRejectedValue(new AppError("CONFLICT"));
      const result = await actions.saveVariable(
        post({ ...raw, editor: "create" }),
      );
      expect(
        failure
          ? (result as ActionFailure<Record<string, unknown>>).data
          : result,
      ).toMatchObject({
        action: "saveVariable",
        scope: "mail-variable-create",
        targetKey: "custom-1",
      });
      expect(service.saveMailVariable).toHaveBeenCalledWith({
        key: "custom-1",
        value: raw.value,
        description: "설명",
      });
      if (failure)
        expect(
          (result as ActionFailure<Record<string, unknown>>).data.values,
        ).toEqual({
          key: raw.key,
          value: raw.value,
          description: raw.description,
        });
    },
  );

  it("keeps the last-rule disabled operation and original explanatory message", async () => {
    service.removeMailRule.mockResolvedValue({ keptDisabled: true });
    expect(await actions.removeRule(post(raw))).toEqual({
      success: true,
      action: "removeRule",
      scope: "mail-rule",
      targetKey: "application-approved",
      operation: "rule-disabled",
      message:
        "이벤트의 마지막 규칙이라 지우지 않고 껐습니다 — 규칙이 하나도 없으면 기본 규칙이 발송됩니다.",
    });
  });

  it.each(["removeRule", "toggleRule"] as const)(
    "retains %s fallback selectors and null rule ID",
    async (name) => {
      await actions[name](
        post({ event: " application-approved ", enabled: "true" }),
      );
      const mock =
        name === "removeRule"
          ? service.removeMailRule
          : service.setMailRuleEnabled;
      expect(mock).toHaveBeenCalledWith({
        event: "application-approved",
        ruleId: null,
        templateKey: undefined,
        recipient: undefined,
        ...(name === "toggleRule" ? { enabled: true } : {}),
      });
    },
  );

  it("keeps zero test-event count as a successful service outcome", async () => {
    service.sendTestEvent.mockResolvedValue(0);
    expect(await actions.testEvent(post(raw))).toMatchObject({
      success: true,
      operation: "test-sent",
      count: 0,
    });
  });

  it("retains an explicit unavailable status from the shared action wrapper", async () => {
    service.saveMailTemplate.mockRejectedValue(
      new AppError("SERVICE_UNAVAILABLE"),
    );
    expect(await actions.save(post(raw))).toMatchObject({
      status: 503,
      data: { error: "SERVICE_UNAVAILABLE", action: "save" },
    });
  });
});

describe("mail load keeps its existing reads and hidden admin guard", () => {
  it("returns the original view collections", async () => {
    const data = await load({ locals: locals() } as never);
    expect(data).toMatchObject({
      events: [{ event: "application-approved" }],
      templates: [{ key: "custom-1" }],
      variables: [{ key: "club_name" }],
      generatedAt: expect.any(String),
    });
    for (const mock of [
      service.listMailEvents,
      service.listMailTemplates,
      service.listMailVariables,
    ])
      expect(mock).toHaveBeenCalledOnce();
  });

  it("hides the load from non-admins before any mail service reads", async () => {
    try {
      await load({ locals: locals(false) } as never);
      throw new Error("Expected hidden admin route");
    } catch (error) {
      expect(isHttpError(error)).toBe(true);
      expect(error).toMatchObject({ status: 404 });
    }
    for (const mock of Object.values(service))
      expect(mock).not.toHaveBeenCalled();
  });
});
