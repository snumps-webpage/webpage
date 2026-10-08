import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { formText } from "$lib/domain/form-data";
import { fail, isActionFailure, type ActionFailure } from "@sveltejs/kit";
import {
  addMailRule,
  createMailTemplate,
  deleteMailTemplate,
  deleteMailVariable,
  listMailEvents,
  listMailTemplates,
  listMailVariables,
  removeMailRule,
  revertMailEvent,
  revertMailTemplate,
  revertMailVariable,
  saveMailTemplate,
  saveMailVariable,
  sendTestEvent,
  sendTestTemplate,
  setMailRuleEnabled,
  setMailTemplateEnabled,
} from "$lib/server/services/mail-admin";
import type { PageServerLoad } from "./$types";

/** ADM (S10): 자동 전송 메일 관리 — 이벤트별 발송 규칙 + 템플릿 편집. */
export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [events, templates, variables] = await Promise.all([
    listMailEvents(),
    listMailTemplates(),
    listMailVariables(),
  ]);
  return {
    events,
    templates,
    variables,
    generatedAt: new Date().toISOString(),
  };
};

const str = (data: FormData, name: string) =>
  ((data.get(name) as string) ?? "").trim();

const feedback = {
  save: {
    scope: "mail-template",
    target: "key",
    fields: ["key", "subject", "body", "enabled"],
  },
  toggle: {
    scope: "mail-template",
    target: "key",
    fields: ["key", "enabled"],
  },
  revertTemplate: {
    scope: "mail-template",
    target: "key",
    fields: ["key"],
  },
  deleteTemplate: {
    scope: "mail-template",
    target: "key",
    fields: ["key"],
  },
  createTemplate: {
    scope: "mail-template-create",
    target: null,
    fields: ["name", "subject", "body"],
  },
  addRule: {
    scope: "mail-rule",
    target: "event",
    fields: ["event", "templateKey", "recipient"],
  },
  removeRule: {
    scope: "mail-rule",
    target: "event",
    fields: ["event", "ruleId", "templateKey", "recipient"],
  },
  toggleRule: {
    scope: "mail-rule",
    target: "event",
    fields: ["event", "ruleId", "templateKey", "recipient", "enabled"],
  },
  revertEvent: {
    scope: "mail-rule",
    target: "event",
    fields: ["event"],
  },
  saveVariable: {
    scope: "mail-variable",
    target: "key",
    fields: ["key", "value", "description"],
  },
  deleteVariable: {
    scope: "mail-variable",
    target: "key",
    fields: ["key"],
  },
  revertVariable: {
    scope: "mail-variable",
    target: "key",
    fields: ["key"],
  },
  testTemplate: {
    scope: "mail-test-template",
    target: "templateKey",
    fields: ["to", "templateKey"],
  },
  testEvent: {
    scope: "mail-test-event",
    target: "event",
    fields: ["to", "event"],
  },
} as const;

/** Keep shared authorization/error handling and add only display feedback. */
async function mailAction<T extends Record<string, unknown>>(
  locals: App.Locals,
  data: FormData,
  action: keyof typeof feedback,
  logic: () => Promise<T>,
) {
  const config = feedback[action];
  const scope =
    action === "saveVariable" && formText(data, "editor") === "create"
      ? "mail-variable-create"
      : config.scope;
  const targetKey = config.target ? formText(data, config.target).trim() : "";
  const result = await handleAdminAction(locals, logic);
  if (isActionFailure(result as unknown)) {
    const failure = result as ActionFailure<Record<string, unknown>>;
    const values = Object.fromEntries(
      config.fields.map((field) => [field, formText(data, field)]),
    );
    return fail(failure.status, {
      ...failure.data,
      action,
      scope,
      targetKey,
      values,
    });
  }
  const successful = result as T & { success: true };
  return {
    ...successful,
    action,
    scope,
    targetKey:
      action === "createTemplate" && typeof successful.key === "string"
        ? successful.key
        : targetKey,
  };
}

export const actions = {
  save: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "save", async () => {
      await saveMailTemplate({
        key: str(data, "key"),
        subject: (data.get("subject") as string) ?? "",
        body: (data.get("body") as string) ?? "",
        enabled: data.get("enabled") === "on",
      });
      return { operation: "saved" };
    });
  },

  revertTemplate: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "revertTemplate", async () => {
      await revertMailTemplate(str(data, "key"));
      return { operation: "reverted" };
    });
  },

  deleteTemplate: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "deleteTemplate", async () => {
      await deleteMailTemplate(str(data, "key"));
      return { operation: "deleted" };
    });
  },

  toggle: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "toggle", async () => {
      await setMailTemplateEnabled(
        str(data, "key"),
        data.get("enabled") === "true",
      );
      return { operation: "toggled" };
    });
  },

  createTemplate: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "createTemplate", async () => {
      const key = await createMailTemplate({
        name: str(data, "name"),
        subject: (data.get("subject") as string) ?? "",
        body: (data.get("body") as string) ?? "",
      });
      return { operation: "created", key };
    });
  },

  addRule: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "addRule", async () => {
      await addMailRule({
        event: str(data, "event"),
        templateKey: str(data, "templateKey"),
        recipient: str(data, "recipient"),
      });
      return { operation: "rule-added" };
    });
  },

  removeRule: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "removeRule", async () => {
      const { keptDisabled } = await removeMailRule({
        event: str(data, "event"),
        ruleId: str(data, "ruleId") || null,
        templateKey: str(data, "templateKey") || undefined,
        recipient: str(data, "recipient") || undefined,
      });
      return keptDisabled
        ? {
            operation: "rule-disabled",
            message:
              "이벤트의 마지막 규칙이라 지우지 않고 껐습니다 — 규칙이 하나도 없으면 기본 규칙이 발송됩니다.",
          }
        : { operation: "rule-removed" };
    });
  },

  toggleRule: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "toggleRule", async () => {
      await setMailRuleEnabled({
        event: str(data, "event"),
        ruleId: str(data, "ruleId") || null,
        templateKey: str(data, "templateKey") || undefined,
        recipient: str(data, "recipient") || undefined,
        enabled: data.get("enabled") === "true",
      });
      return { operation: "rule-toggled" };
    });
  },

  saveVariable: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "saveVariable", async () => {
      await saveMailVariable({
        key: str(data, "key"),
        value: (data.get("value") as string) ?? "",
        description: str(data, "description"),
      });
      return { operation: "variable-saved" };
    });
  },

  deleteVariable: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "deleteVariable", async () => {
      await deleteMailVariable(str(data, "key"));
      return { operation: "variable-deleted" };
    });
  },

  revertVariable: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "revertVariable", async () => {
      await revertMailVariable(str(data, "key"));
      return { operation: "variable-reverted" };
    });
  },

  testTemplate: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "testTemplate", async () => {
      await sendTestTemplate(str(data, "to"), str(data, "templateKey"));
      return { operation: "test-sent" };
    });
  },

  testEvent: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "testEvent", async () => {
      const count = await sendTestEvent(str(data, "to"), str(data, "event"));
      return { operation: "test-sent", count };
    });
  },

  revertEvent: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return mailAction(locals, data, "revertEvent", async () => {
      await revertMailEvent(str(data, "event"));
      return { operation: "event-reverted" };
    });
  },
};
