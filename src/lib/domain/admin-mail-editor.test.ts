import { describe, expect, it } from "vitest";
import {
  initialMailEditorDrafts,
  reconcileMailEditorDrafts,
  applyMailEditorResult,
  mailEditorNotice,
} from "./admin-mail-editor";
const data = {
  templates: [
    {
      key: "welcome",
      subject: "saved subject",
      body: "saved body",
      enabled: true,
    },
    {
      key: "other",
      subject: "other subject",
      body: "other body",
      enabled: false,
    },
  ],
  variables: [
    { key: "room", value: "saved room", description: "saved description" },
  ],
  events: [
    { event: "application.approved", allowedRecipients: [{ key: "party" }] },
  ],
};
const draft = () => {
  const d = initialMailEditorDrafts(data, null);
  d.templates.welcome.subject = "unsaved subject";
  d.templates.welcome.body = "unsaved body";
  d.variables.room.value = "unsaved room";
  d.createTemplate.name = "unsaved creation";
  return d;
};
describe("mail editor draft isolation", () => {
  it("restores raw failed template text and explicitly unchecked enabled", () => {
    const d = initialMailEditorDrafts(data, {
      scope: "mail-template",
      action: "save",
      targetKey: "welcome",
      error: "VALIDATION_FAILED",
      values: { subject: "  ", body: " raw body ", enabled: "" },
    });
    expect(d.templates.welcome).toEqual({
      subject: "  ",
      body: " raw body ",
      enabled: false,
    });
    expect(d.templates.other.body).toBe("other body");
  });
  it("a variable save changes only its own draft", () => {
    const d = draft(),
      loaded = {
        ...data,
        variables: [{ ...data.variables[0], value: "normalized saved room" }],
      };
    const next = applyMailEditorResult(d, loaded, {
      success: true,
      scope: "mail-variable",
      action: "saveVariable",
      operation: "variable-saved",
      targetKey: "room",
    });
    expect(next.variables.room.value).toBe("normalized saved room");
    expect(next.templates.welcome.body).toBe("unsaved body");
    expect(next.createTemplate.name).toBe("unsaved creation");
  });
  it.each(["toggleRule", "testTemplate", "testEvent", "revertEvent"])(
    "%s does not clear template,variable,or creation drafts",
    (action) => {
      const d = draft();
      const next = applyMailEditorResult(d, data, {
        success: true,
        action,
        scope: action.startsWith("test") ? "mail-test-template" : "mail-rule",
        targetKey: "application.approved",
      });
      expect(next.templates.welcome.body).toBe("unsaved body");
      expect(next.variables.room.value).toBe("unsaved room");
      expect(next.createTemplate.name).toBe("unsaved creation");
    },
  );
  it("a template toggle updates enabled only,keeping unsaved wording", () => {
    const next = applyMailEditorResult(
      draft(),
      {
        ...data,
        templates: [
          { ...data.templates[0], enabled: false },
          data.templates[1],
        ],
      },
      {
        success: true,
        scope: "mail-template",
        action: "toggle",
        targetKey: "welcome",
      },
    );
    expect(next.templates.welcome).toEqual({
      subject: "unsaved subject",
      body: "unsaved body",
      enabled: false,
    });
  });
  it("successful own save resyncs only the target to authoritative text", () => {
    const d = draft();
    d.templates.other.body = "other unsaved body";
    const next = applyMailEditorResult(d, data, {
      success: true,
      scope: "mail-template",
      action: "save",
      targetKey: "welcome",
    });
    expect(next.templates.welcome.body).toBe("saved body");
    expect(next.templates.other.body).toBe("other unsaved body");
    expect(next.variables.room.value).toBe("unsaved room");
  });
  it("creation failure restores raw keys and creation success clears only that form", () => {
    const failed = applyMailEditorResult(draft(), data, {
      scope: "mail-variable-create",
      action: "saveVariable",
      error: "VALIDATION_FAILED",
      values: {
        key: " raw key ",
        value: " raw value ",
        description: " raw description ",
      },
    });
    expect(failed.createVariable).toEqual({
      key: " raw key ",
      value: " raw value ",
      description: " raw description ",
    });
    const saved = applyMailEditorResult(failed, data, {
      scope: "mail-variable-create",
      action: "saveVariable",
      success: true,
    });
    expect(saved.createVariable.key).toBe("");
    expect(saved.createTemplate.name).toBe("unsaved creation");
  });
  it("directory refresh prunes deleted targets without replacing other drafts", () => {
    const next = reconcileMailEditorDrafts(draft(), {
      ...data,
      templates: [data.templates[0]],
    });
    expect(Object.keys(next.templates)).toEqual(["welcome"]);
    expect(next.templates.welcome.body).toBe("unsaved body");
  });
  it("new variables named constructor have their own real draft,not a prototype value", () => {
    const next = reconcileMailEditorDrafts(draft(), {
      ...data,
      variables: [
        ...data.variables,
        {
          key: "constructor",
          value: "real value",
          description: "new variable",
        },
      ],
    });
    expect(Object.hasOwn(next.variables, "constructor")).toBe(true);
    expect(next.variables.constructor).toEqual({
      value: "real value",
      description: "new variable",
    });
  });
  it("unknown prototype targets never receive another record's draft", () => {
    const d = draft();
    const next = applyMailEditorResult(d, data, {
      scope: "mail-variable",
      action: "saveVariable",
      targetKey: "constructor",
      error: "NOT_FOUND",
      values: { value: "unknown" },
    });
    expect(Object.hasOwn(next.variables, "constructor")).toBe(false);
    expect(next.variables.room.value).toBe("unsaved room");
  });
  it("keeps original last-rule message,exact test count,and uncertainty", () => {
    expect(
      mailEditorNotice({
        scope: "mail-rule",
        success: true,
        operation: "rule-disabled",
        message: "마지막 규칙은 끈 상태로 유지합니다.",
      })?.message,
    ).toBe("마지막 규칙은 끈 상태로 유지합니다.");
    expect(
      mailEditorNotice({
        scope: "mail-test-event",
        success: true,
        operation: "test-sent",
        count: 3,
      })?.message,
    ).toContain("3개");
    expect(
      mailEditorNotice({ scope: "mail-template", error: "SERVICE_UNAVAILABLE" })
        ?.message,
    ).toContain("상태가 바뀌었을 수");
  });
});
