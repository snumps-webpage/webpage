import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import {
  addMailRule,
  createMailTemplate,
  listMailEvents,
  listMailTemplates,
  removeMailRule,
  resetMailEvent,
  resetMailTemplate,
  saveMailTemplate,
  setMailRuleEnabled,
  setMailTemplateEnabled,
} from "$lib/server/services/mail-admin";
import type { PageServerLoad } from "./$types";

/** ADM (S10): 자동 전송 메일 관리 — 이벤트별 발송 규칙 + 템플릿 편집. */
export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [events, templates] = await Promise.all([listMailEvents(), listMailTemplates()]);
  return { events, templates, generatedAt: new Date().toISOString() };
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

  reset: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await resetMailTemplate(str(data, "key"));
      return { operation: "reset" };
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

  resetEvent: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await resetMailEvent(str(data, "event"));
      return { operation: "event-reset" };
    });
  },
};
