import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
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
  return { events, templates, variables, generatedAt: new Date().toISOString() };
};

const str = (data: FormData, name: string) => ((data.get(name) as string) ?? "").trim();

export const actions = {
  save: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await saveMailTemplate({
        key: str(data, "key"),
        subject: (data.get("subject") as string) ?? "",
        body: (data.get("body") as string) ?? "",
        enabled: data.get("enabled") === "on",
      });
      return { operation: "saved" };
    });
  },

  revertTemplate: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await revertMailTemplate(str(data, "key"));
      return { operation: "reverted" };
    });
  },

  deleteTemplate: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await deleteMailTemplate(str(data, "key"));
      return { operation: "deleted" };
    });
  },

  toggle: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await setMailTemplateEnabled(str(data, "key"), data.get("enabled") === "true");
      return { operation: "toggled" };
    });
  },

  createTemplate: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await createMailTemplate({
        name: str(data, "name"),
        subject: (data.get("subject") as string) ?? "",
        body: (data.get("body") as string) ?? "",
      });
      return { operation: "created" };
    });
  },

  addRule: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await addMailRule({
        event: str(data, "event"),
        templateKey: str(data, "templateKey"),
        recipient: str(data, "recipient"),
      });
      return { operation: "rule-added" };
    });
  },

  removeRule: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await removeMailRule({
        event: str(data, "event"),
        ruleId: str(data, "ruleId") || null,
        templateKey: str(data, "templateKey") || undefined,
        recipient: str(data, "recipient") || undefined,
      });
      return { operation: "rule-removed" };
    });
  },

  toggleRule: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
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

  saveVariable: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await saveMailVariable({
        key: str(data, "key"),
        value: (data.get("value") as string) ?? "",
        description: str(data, "description"),
      });
      return { operation: "variable-saved" };
    });
  },

  deleteVariable: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await deleteMailVariable(str(data, "key"));
      return { operation: "variable-deleted" };
    });
  },

  revertVariable: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await revertMailVariable(str(data, "key"));
      return { operation: "variable-reverted" };
    });
  },

  testTemplate: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await sendTestTemplate(str(data, "to"), str(data, "templateKey"));
      return { operation: "test-sent" };
    });
  },

  testEvent: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const count = await sendTestEvent(str(data, "to"), str(data, "event"));
      return { operation: "test-sent", count };
    });
  },

  revertEvent: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await revertMailEvent(str(data, "event"));
      return { operation: "event-reverted" };
    });
  },
};
