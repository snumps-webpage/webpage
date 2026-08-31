import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import {
  MAIL_EVENTS,
  RECIPIENTS,
  type MailEventKey,
  type RecipientKind,
} from "$lib/server/mail/events";
import {
  MAIL_TEMPLATE_DEFAULTS,
  MAIL_VARIABLE_DEFAULTS,
  extractVariableTokens,
  renderMailTemplate,
} from "$lib/server/mail/template-store";
import { effectiveRules } from "$lib/server/mail/dispatch";
import { getAdminAccessToken, dispatchEmail } from "$lib/server/mail/client";

/**
 * /admin/mail — 자동 전송 메일 관리 (S10).
 *
 * 템플릿 계층: 기본값(코드) + 오버라이드/커스텀(mail-templates 테이블).
 * 규칙 계층: 이벤트→템플릿→수신자 (mail-rules 테이블 — 이벤트별로 행이 있으면
 * 그것이 전체 진실, 없으면 이벤트의 기본 규칙). 이벤트를 처음 편집하는 순간
 * 기본 규칙이 행으로 실체화된다.
 */

// ---- 템플릿 -----------------------------------------------------------------

export interface MailTemplateView {
  key: string;
  name: string;
  description: string;
  variables: string[];
  subject: string;
  body: string;
  enabled: boolean;
  /** 기본 키: 오버라이드 존재 여부. 커스텀 키: 항상 true */
  customized: boolean;
  /** true = 코드 기본값이 없는 커스텀 템플릿 (삭제 가능) */
  isCustom: boolean;
  updatedAt: string | null;
}

export async function listMailTemplates(): Promise<MailTemplateView[]> {
  const rows = await getTable("mail-templates");
  const overrides = new Map(rows.map((t) => [t.key, t]));

  const defaults = Object.entries(MAIL_TEMPLATE_DEFAULTS).map(([key, def]) => {
    const row = overrides.get(key);
    return {
      key,
      name: def.name,
      description: def.description,
      variables: def.variables,
      subject: row?.subject ?? def.subject,
      body: row?.body ?? def.body,
      enabled: row?.enabled ?? true,
      customized: !!row,
      isCustom: false,
      updatedAt: row?.updatedAt ?? null,
    };
  });

  const customs = rows
    .filter((t) => !(t.key in MAIL_TEMPLATE_DEFAULTS))
    .map((t) => ({
      key: t.key,
      name: t.name || t.key,
      description: "커스텀 템플릿 — 발송 규칙에 부착해 사용",
      variables: [],
      subject: t.subject,
      body: t.body,
      enabled: t.enabled,
      customized: true,
      isCustom: true,
      updatedAt: t.updatedAt,
    }));

  return [...defaults, ...customs];
}

/** 저장 — 기본 키는 오버라이드 upsert, 커스텀 키는 행 갱신. */
export async function saveMailTemplate(input: {
  key: string;
  subject: string;
  body: string;
  enabled: boolean;
}): Promise<void> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "제목과 본문을 모두 입력해 주세요.",
    });
  }
  await mutate("mail-templates", (rows) => {
    const idx = rows.findIndex((t) => t.key === input.key);
    if (idx === -1) {
      if (!(input.key in MAIL_TEMPLATE_DEFAULTS)) {
        throw new AppError("NOT_FOUND", { userMessage: "존재하지 않는 템플릿입니다." });
      }
      rows.push({
        id: newId(),
        key: input.key,
        name: "",
        subject,
        body,
        enabled: input.enabled,
        updatedAt: nowKstIso(),
      });
    } else {
      rows[idx] = { ...rows[idx], subject, body, enabled: input.enabled, updatedAt: nowKstIso() };
    }
    return rows;
  });
}

/** 커스텀 템플릿 생성 → 새 key 반환 (규칙에 부착해 써야 발송된다). */
export async function createMailTemplate(input: {
  name: string;
  subject: string;
  body: string;
}): Promise<string> {
  const name = input.name.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!name || !subject || !body) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "이름·제목·본문을 모두 입력해 주세요.",
    });
  }
  const key = `custom-${newId().toLowerCase()}`;
  await mutate("mail-templates", (rows) => [
    ...rows,
    { id: newId(), key, name, subject, body, enabled: true, updatedAt: nowKstIso() },
  ]);
  return key;
}

/** 기본값 복원(기본 키: 오버라이드 삭제) / 커스텀 삭제(규칙에 부착돼 있으면 거부). */
export async function resetMailTemplate(key: string): Promise<void> {
  if (!(key in MAIL_TEMPLATE_DEFAULTS)) {
    const referenced = (await getTable("mail-rules")).some((r) => r.templateKey === key);
    if (referenced) {
      throw new AppError("CONFLICT", {
        userMessage: "이 템플릿을 쓰는 발송 규칙이 있습니다. 규칙을 먼저 제거해 주세요.",
      });
    }
  }
  await mutate("mail-templates", (rows) => {
    if (!rows.some((t) => t.key === key)) throw new AppError("NOT_FOUND");
    return rows.filter((t) => t.key !== key);
  });
}

/** 발송 켬/끔만 토글 — 문구는 현행 유지. */
export async function setMailTemplateEnabled(key: string, enabled: boolean): Promise<void> {
  const def = MAIL_TEMPLATE_DEFAULTS[key];
  await mutate("mail-templates", (rows) => {
    const idx = rows.findIndex((t) => t.key === key);
    if (idx === -1) {
      if (!def) throw new AppError("NOT_FOUND", { userMessage: "존재하지 않는 템플릿입니다." });
      rows.push({
        id: newId(),
        key,
        name: "",
        subject: def.subject,
        body: def.body,
        enabled,
        updatedAt: nowKstIso(),
      });
    } else {
      rows[idx] = { ...rows[idx], enabled, updatedAt: nowKstIso() };
    }
    return rows;
  });
}

// ---- 발송 규칙 ---------------------------------------------------------------

export interface MailEventView {
  event: string;
  name: string;
  description: string;
  variables: string[];
  allowedRecipients: { key: RecipientKind; label: string }[];
  /** true = mail-rules에 실체화됨 (관리자가 소유), false = 코드 기본 규칙 표시 중 */
  materialized: boolean;
  rules: {
    id: string | null; // null = 기본 규칙 (미실체화)
    templateKey: string;
    templateName: string;
    recipient: RecipientKind;
    recipientLabel: string;
    enabled: boolean;
  }[];
}

export async function listMailEvents(): Promise<MailEventView[]> {
  const [ruleRows, templateRows] = await Promise.all([
    getTable("mail-rules"),
    getTable("mail-templates"),
  ]);
  const templateName = (key: string): string =>
    MAIL_TEMPLATE_DEFAULTS[key]?.name ??
    templateRows.find((t) => t.key === key)?.name ??
    key;

  return Object.entries(MAIL_EVENTS).map(([event, def]) => {
    const rows = ruleRows.filter((r) => r.event === event);
    const materialized = rows.length > 0;
    const rules = materialized
      ? rows.map((r) => ({
          id: r.id,
          templateKey: r.templateKey,
          templateName: templateName(r.templateKey),
          recipient: r.recipient as RecipientKind,
          recipientLabel: RECIPIENTS[r.recipient as RecipientKind] ?? r.recipient,
          enabled: r.enabled,
        }))
      : def.defaultRules.map((r) => ({
          id: null,
          templateKey: r.templateKey,
          templateName: templateName(r.templateKey),
          recipient: r.recipient,
          recipientLabel: RECIPIENTS[r.recipient],
          enabled: true,
        }));
    return {
      event,
      name: def.name,
      description: def.description,
      variables: def.variables,
      allowedRecipients: def.allowedRecipients.map((key) => ({
        key,
        label: RECIPIENTS[key],
      })),
      materialized,
      rules,
    };
  });
}

function requireEvent(event: string): MailEventKey {
  if (!(event in MAIL_EVENTS)) {
    throw new AppError("VALIDATION_FAILED", { userMessage: "알 수 없는 이벤트입니다." });
  }
  return event as MailEventKey;
}

/** 이벤트의 기본 규칙을 행으로 실체화 (이미 실체화됐으면 no-op). */
async function materializeEvent(event: MailEventKey): Promise<void> {
  await mutate("mail-rules", (rows) => {
    if (rows.some((r) => r.event === event)) return rows;
    for (const d of MAIL_EVENTS[event].defaultRules) {
      rows.push({
        id: newId(),
        event,
        templateKey: d.templateKey,
        recipient: d.recipient,
        enabled: true,
        updatedAt: nowKstIso(),
      });
    }
    return rows;
  });
}

/** 규칙 추가 — 이벤트가 허용하는 수신자만, 실존 템플릿만. */
export async function addMailRule(input: {
  event: string;
  templateKey: string;
  recipient: string;
}): Promise<void> {
  const event = requireEvent(input.event);
  const def = MAIL_EVENTS[event];
  if (!def.allowedRecipients.includes(input.recipient as RecipientKind)) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "이 이벤트에서 쓸 수 없는 수신자 종류입니다.",
    });
  }
  const templateExists =
    input.templateKey in MAIL_TEMPLATE_DEFAULTS ||
    (await getTable("mail-templates")).some((t) => t.key === input.templateKey);
  if (!templateExists) {
    throw new AppError("VALIDATION_FAILED", { userMessage: "존재하지 않는 템플릿입니다." });
  }
  await materializeEvent(event);
  await mutate("mail-rules", (rows) => {
    if (
      rows.some(
        (r) =>
          r.event === event &&
          r.templateKey === input.templateKey &&
          r.recipient === input.recipient,
      )
    ) {
      throw new AppError("CONFLICT", { userMessage: "이미 같은 규칙이 있습니다." });
    }
    rows.push({
      id: newId(),
      event,
      templateKey: input.templateKey,
      recipient: input.recipient,
      enabled: true,
      updatedAt: nowKstIso(),
    });
    return rows;
  });
}

/** 규칙 삭제. ruleId=null(미실체화 기본 규칙)은 실체화 후 해당 규칙을 지운다. */
export async function removeMailRule(input: {
  event: string;
  ruleId: string | null;
  templateKey?: string;
  recipient?: string;
}): Promise<void> {
  const event = requireEvent(input.event);
  await materializeEvent(event);
  await mutate("mail-rules", (rows) => {
    const idx = input.ruleId
      ? rows.findIndex((r) => r.id === input.ruleId)
      : rows.findIndex(
          (r) =>
            r.event === event &&
            r.templateKey === input.templateKey &&
            r.recipient === input.recipient,
        );
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows.splice(idx, 1);
    return rows;
  });
}

/** 규칙 켬/끔. 미실체화 기본 규칙이면 먼저 실체화한다. */
export async function setMailRuleEnabled(input: {
  event: string;
  ruleId: string | null;
  templateKey?: string;
  recipient?: string;
  enabled: boolean;
}): Promise<void> {
  const event = requireEvent(input.event);
  await materializeEvent(event);
  await mutate("mail-rules", (rows) => {
    const idx = input.ruleId
      ? rows.findIndex((r) => r.id === input.ruleId)
      : rows.findIndex(
          (r) =>
            r.event === event &&
            r.templateKey === input.templateKey &&
            r.recipient === input.recipient,
        );
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], enabled: input.enabled, updatedAt: nowKstIso() };
    return rows;
  });
}

/** 이벤트를 기본 규칙으로 복원 — 실체화 행 전체 삭제. */
export async function resetMailEvent(event: string): Promise<void> {
  const key = requireEvent(event);
  await mutate("mail-rules", (rows) => rows.filter((r) => r.event !== key));
}

// ---- 공용 변수 ---------------------------------------------------------------

export interface MailVariableView {
  key: string;
  value: string;
  description: string;
  /** 기본 키의 오버라이드 존재 여부. 커스텀 키는 항상 true */
  customized: boolean;
  /** true = 코드 기본값이 없는 관리자 정의 변수 (삭제 가능) */
  isCustom: boolean;
  updatedAt: string | null;
}

export async function listMailVariables(): Promise<MailVariableView[]> {
  const rows = await getTable("mail-variables");
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const defaults = Object.entries(MAIL_VARIABLE_DEFAULTS).map(([key, def]) => {
    const row = byKey.get(key);
    return {
      key,
      value: row?.value ?? def.value,
      description: row?.description || def.description,
      customized: !!row,
      isCustom: false,
      updatedAt: row?.updatedAt ?? null,
    };
  });
  const customs = rows
    .filter((r) => !(r.key in MAIL_VARIABLE_DEFAULTS))
    .map((r) => ({
      key: r.key,
      value: r.value,
      description: r.description,
      customized: true,
      isCustom: true,
      updatedAt: r.updatedAt,
    }));
  return [...defaults, ...customs];
}

/** 변수 저장 — 기본 키는 오버라이드 upsert, 새 키는 생성. */
export async function saveMailVariable(input: {
  key: string;
  value: string;
  description: string;
}): Promise<void> {
  const key = input.key.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "변수 이름은 영문자로 시작하는 영숫자여야 합니다 (예: chatLink).",
    });
  }
  await mutate("mail-variables", (rows) => {
    const idx = rows.findIndex((r) => r.key === key);
    if (idx === -1) {
      rows.push({
        id: newId(),
        key,
        value: input.value,
        description: input.description.trim(),
        updatedAt: nowKstIso(),
      });
    } else {
      rows[idx] = {
        ...rows[idx],
        value: input.value,
        description: input.description.trim(),
        updatedAt: nowKstIso(),
      };
    }
    return rows;
  });
}

/** 기본 키: 오버라이드 삭제(코드 기본값 복원). 커스텀 키: 변수 삭제. */
export async function deleteMailVariable(key: string): Promise<void> {
  await mutate("mail-variables", (rows) => {
    if (!rows.some((r) => r.key === key)) throw new AppError("NOT_FOUND");
    return rows.filter((r) => r.key !== key);
  });
}

// ---- 발송 테스트 --------------------------------------------------------------

function sampleVars(tokens: string[]): Record<string, string> {
  // 공용 변수는 render가 실제 값을 채우므로, 여기선 나머지 토큰만 예시로 채운다.
  return Object.fromEntries(tokens.map((t) => [t, `[예시 ${t}]`]));
}

async function currentTemplateText(key: string): Promise<{ subject: string; body: string } | null> {
  const row = (await getTable("mail-templates")).find((t) => t.key === key);
  if (row) return { subject: row.subject, body: row.body };
  const def = MAIL_TEMPLATE_DEFAULTS[key];
  return def ? { subject: def.subject, body: def.body } : null;
}

/** 템플릿 1종을 예시 변수로 렌더해 지정 주소로 실발송. */
export async function sendTestTemplate(to: string, templateKey: string): Promise<void> {
  if (!/.+@.+\..+/.test(to)) {
    throw new AppError("VALIDATION_FAILED", { userMessage: "받는 주소를 확인해 주세요." });
  }
  const text = await currentTemplateText(templateKey);
  if (!text) throw new AppError("NOT_FOUND", { userMessage: "존재하지 않는 템플릿입니다." });
  const rendered = await renderMailTemplate(
    templateKey,
    sampleVars(extractVariableTokens(text.subject, text.body)),
  );
  if (!rendered) {
    throw new AppError("CONFLICT", {
      userMessage: "이 템플릿은 발송이 꺼져 있습니다. 켠 뒤 테스트해 주세요.",
    });
  }
  const accessToken = await getAdminAccessToken();
  await dispatchEmail(accessToken, [to], `[테스트] ${rendered.subject}`, rendered.body);
}

/**
 * 이벤트 1종의 유효 규칙 전체를 예시 변수로 렌더해 — 실제 수신자 대신 —
 * 지정 주소로만 실발송한다. 결과: 발송된 규칙 수.
 */
export async function sendTestEvent(to: string, event: string): Promise<number> {
  if (!/.+@.+\..+/.test(to)) {
    throw new AppError("VALIDATION_FAILED", { userMessage: "받는 주소를 확인해 주세요." });
  }
  const key = requireEvent(event);
  const vars = sampleVars(MAIL_EVENTS[key].variables);
  const rules = await effectiveRules(key);
  let sent = 0;
  const accessToken = await getAdminAccessToken();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const rendered = await renderMailTemplate(rule.templateKey, vars);
    if (!rendered) continue;
    const label = RECIPIENTS[rule.recipient] ?? rule.recipient;
    await dispatchEmail(
      accessToken,
      [to],
      `[테스트] ${rendered.subject}`,
      `※ 실제 발송 시 수신자: ${label}\n\n${rendered.body}`,
    );
    sent += 1;
  }
  if (sent === 0) {
    throw new AppError("CONFLICT", {
      userMessage: "이 이벤트에는 켜져 있는 발송 규칙이 없습니다.",
    });
  }
  return sent;
}
