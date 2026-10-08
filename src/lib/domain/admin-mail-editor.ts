import {
  utilityFailureMessage,
  type AdminUtilityActionState,
} from "./admin-utility-state";

interface TemplateView {
  key: string;
  subject: string;
  body: string;
  enabled: boolean;
}
interface VariableView {
  key: string;
  value: string;
  description: string;
}
interface EventView {
  event: string;
  allowedRecipients: { key: string }[];
}
export interface MailEditorData {
  templates: TemplateView[];
  variables: VariableView[];
  events: EventView[];
}
export interface MailEditorDrafts {
  templates: Record<
    string,
    { subject: string; body: string; enabled: boolean }
  >;
  variables: Record<string, { value: string; description: string }>;
  rules: Record<string, { templateKey: string; recipient: string }>;
  createTemplate: { name: string; subject: string; body: string };
  createVariable: { key: string; value: string; description: string };
  testTemplate: { to: string; templateKey: string };
  testEvent: { to: string; event: string };
}
const templateDraft = (view: TemplateView) => ({
  subject: view.subject,
  body: view.body,
  enabled: view.enabled,
});
const variableDraft = (view: VariableView) => ({
  value: view.value,
  description: view.description,
});

export function initialMailEditorDrafts(
  data: MailEditorData,
  form: AdminUtilityActionState | null | undefined,
): MailEditorDrafts {
  const drafts: MailEditorDrafts = {
    templates: Object.fromEntries(
      data.templates.map((t) => [t.key, templateDraft(t)]),
    ),
    variables: Object.fromEntries(
      data.variables.map((v) => [v.key, variableDraft(v)]),
    ),
    rules: Object.fromEntries(
      data.events.map((e) => [
        e.event,
        {
          templateKey: data.templates[0]?.key ?? "",
          recipient: e.allowedRecipients[0]?.key ?? "",
        },
      ]),
    ),
    createTemplate: { name: "", subject: "", body: "" },
    createVariable: { key: "", value: "", description: "" },
    testTemplate: { to: "", templateKey: data.templates[0]?.key ?? "" },
    testEvent: { to: "", event: data.events[0]?.event ?? "" },
  };
  return applyMailEditorResult(drafts, data, form);
}

/** New/deleted keys follow the directory; unrelated open draft fields stay local. */
export function reconcileMailEditorDrafts(
  drafts: MailEditorDrafts,
  data: MailEditorData,
): MailEditorDrafts {
  return {
    ...drafts,
    templates: Object.fromEntries(
      data.templates.map((t) => [
        t.key,
        Object.hasOwn(drafts.templates, t.key)
          ? drafts.templates[t.key]
          : templateDraft(t),
      ]),
    ),
    variables: Object.fromEntries(
      data.variables.map((v) => [
        v.key,
        Object.hasOwn(drafts.variables, v.key)
          ? drafts.variables[v.key]
          : variableDraft(v),
      ]),
    ),
    rules: Object.fromEntries(
      data.events.map((e) => [
        e.event,
        Object.hasOwn(drafts.rules, e.event)
          ? drafts.rules[e.event]
          : {
              templateKey: data.templates[0]?.key ?? "",
              recipient: e.allowedRecipients[0]?.key ?? "",
            },
      ]),
    ),
  };
}

/** Apply only the form's own fields; a rule toggle or test never clears editors. */
export function applyMailEditorResult(
  drafts: MailEditorDrafts,
  data: MailEditorData,
  form: AdminUtilityActionState | null | undefined,
): MailEditorDrafts {
  if (!form?.scope?.startsWith("mail-")) return drafts;
  const next = {
    ...drafts,
    templates: { ...drafts.templates },
    variables: { ...drafts.variables },
    rules: { ...drafts.rules },
  };
  const key = form.targetKey ?? "";
  const values = form.values ?? {};
  const submitted = <T extends Record<string, string>>(base: T): T =>
    Object.fromEntries(
      Object.entries(base).map(([field, value]) => [
        field,
        values[field] ?? value,
      ]),
    ) as T;
  if (form.error) {
    if (form.scope === "mail-template-create")
      next.createTemplate = submitted(drafts.createTemplate);
    else if (form.scope === "mail-variable-create")
      next.createVariable = submitted(drafts.createVariable);
    else if (
      form.scope === "mail-template" &&
      form.action === "save" &&
      Object.hasOwn(drafts.templates, key)
    ) {
      next.templates[key] = {
        ...submitted({
          subject: drafts.templates[key].subject,
          body: drafts.templates[key].body,
        }),
        enabled: values.enabled === "on",
      };
    } else if (
      form.scope === "mail-variable" &&
      form.action === "saveVariable" &&
      Object.hasOwn(drafts.variables, key)
    )
      next.variables[key] = submitted(drafts.variables[key]);
    else if (
      form.scope === "mail-rule" &&
      form.action === "addRule" &&
      Object.hasOwn(drafts.rules, key)
    )
      next.rules[key] = submitted(drafts.rules[key]);
    else if (form.scope === "mail-test-template")
      next.testTemplate = submitted(drafts.testTemplate);
    else if (form.scope === "mail-test-event")
      next.testEvent = submitted(drafts.testEvent);
  } else if (form.success) {
    if (form.scope === "mail-template-create")
      next.createTemplate = { name: "", subject: "", body: "" };
    if (form.scope === "mail-variable-create")
      next.createVariable = { key: "", value: "", description: "" };
    if (form.scope === "mail-template") {
      const saved = data.templates.find((t) => t.key === key);
      if (saved && ["save", "revertTemplate"].includes(form.action ?? ""))
        next.templates[key] = templateDraft(saved);
      else if (saved && form.action === "toggle" && next.templates[key])
        next.templates[key] = {
          ...next.templates[key],
          enabled: saved.enabled,
        };
    }
    if (
      form.scope === "mail-variable" &&
      ["saveVariable", "revertVariable"].includes(form.action ?? "")
    ) {
      const saved = data.variables.find((v) => v.key === key);
      if (saved) next.variables[key] = variableDraft(saved);
    }
  }
  return next;
}

export function mailEditorNotice(
  form: AdminUtilityActionState | null | undefined,
) {
  if (!form?.scope?.startsWith("mail-")) return null;
  const error = utilityFailureMessage(form);
  if (error) return { tone: "error" as const, message: error };
  if (!form?.success) return null;
  if (form.message) return { tone: "success" as const, message: form.message };
  if (form.operation === "test-sent")
    return {
      tone: "success" as const,
      message:
        form.count === 0
          ? "켜진 발송 규칙이 없어 테스트 메일을 보내지 않았습니다."
          : form.count === undefined
            ? "입력한 주소로 테스트 메일을 보냈습니다."
            : `입력한 주소로 테스트 메일 ${form.count}개를 보냈습니다.`,
    };
  const messages: Record<string, string> = {
    saved: "템플릿을 저장했습니다.",
    reverted: "템플릿을 직전 버전으로 되돌렸습니다.",
    deleted: "커스텀 템플릿을 삭제했습니다.",
    toggled: "템플릿 발송 상태를 변경했습니다.",
    created: "커스텀 템플릿을 만들었습니다. 발송하려면 규칙에 연결해 주세요.",
    "rule-added": "발송 규칙을 추가했습니다.",
    "rule-removed": "발송 규칙을 제거했습니다.",
    "rule-disabled": "마지막 규칙을 끈 상태로 유지했습니다.",
    "rule-toggled": "발송 규칙 상태를 변경했습니다.",
    "event-reverted": "발송 규칙을 직전 버전으로 되돌렸습니다.",
    "variable-saved": "공용 변수를 저장했습니다.",
    "variable-deleted": "공용 변수를 삭제했습니다.",
    "variable-reverted": "공용 변수를 직전 버전으로 되돌렸습니다.",
  };
  return {
    tone: "success" as const,
    message: messages[form.operation ?? ""] ?? "처리했습니다.",
  };
}
