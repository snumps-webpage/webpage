import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import {
  listMailTemplates,
  resetMailTemplate,
  saveMailTemplate,
  setMailTemplateEnabled,
} from "$lib/server/services/mail-admin";
import type { PageServerLoad } from "./$types";

/** ADM: 자동 전송 메일 관리 — 문구 편집·기본값 복원·발송 켬/끔. */
export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  return {
    templates: await listMailTemplates(),
    generatedAt: new Date().toISOString(),
  };
};

export const actions = {
  save: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await saveMailTemplate({
        key: (data.get("key") as string) ?? "",
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
      await resetMailTemplate((data.get("key") as string) ?? "");
      return { operation: "reset" };
    });
  },

  toggle: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await setMailTemplateEnabled(
        (data.get("key") as string) ?? "",
        data.get("enabled") === "true",
      );
      return { operation: "toggled" };
    });
  },
};
