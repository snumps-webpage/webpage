import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import {
  MAIL_TEMPLATE_DEFAULTS,
  type MailTemplateKey,
} from "$lib/server/mail/template-store";

/**
 * /admin/mail — 자동 전송 메일 관리 (ADM 확장, 2026-08-31).
 * 기본값(코드)과 오버라이드(mail-templates 테이블)를 합친 목록을 제공하고,
 * 저장(=오버라이드 생성/갱신)·기본값 복원(=오버라이드 삭제)·발송 켬/끔을 다룬다.
 */

export interface MailTemplateView {
  key: string;
  name: string;
  description: string;
  variables: string[];
  subject: string;
  body: string;
  enabled: boolean;
  /** true = 테이블 오버라이드가 존재 (기본값과 다름) */
  customized: boolean;
  updatedAt: string | null;
}

export async function listMailTemplates(): Promise<MailTemplateView[]> {
  const overrides = new Map(
    (await getTable("mail-templates")).map((t) => [t.key, t]),
  );
  return Object.entries(MAIL_TEMPLATE_DEFAULTS).map(([key, def]) => {
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
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

function requireKnownKey(key: string): MailTemplateKey {
  if (!(key in MAIL_TEMPLATE_DEFAULTS)) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "알 수 없는 메일 템플릿입니다.",
    });
  }
  return key as MailTemplateKey;
}

/** 저장 — 오버라이드 upsert. 제목/본문 공백은 거부. */
export async function saveMailTemplate(input: {
  key: string;
  subject: string;
  body: string;
  enabled: boolean;
}): Promise<void> {
  const key = requireKnownKey(input.key);
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: "제목과 본문을 모두 입력해 주세요.",
    });
  }
  await mutate("mail-templates", (rows) => {
    const idx = rows.findIndex((t) => t.key === key);
    if (idx === -1) {
      rows.push({
        id: newId(),
        key,
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

/** 기본값 복원 — 오버라이드 삭제 (발송도 다시 켜진다). */
export async function resetMailTemplate(key: string): Promise<void> {
  requireKnownKey(key);
  await mutate("mail-templates", (rows) => rows.filter((t) => t.key !== key));
}

/** 발송 켬/끔만 토글 — 문구는 현행(오버라이드 있으면 그것, 없으면 기본값) 유지. */
export async function setMailTemplateEnabled(key: string, enabled: boolean): Promise<void> {
  const known = requireKnownKey(key);
  const def = MAIL_TEMPLATE_DEFAULTS[known];
  await mutate("mail-templates", (rows) => {
    const idx = rows.findIndex((t) => t.key === known);
    if (idx === -1) {
      rows.push({
        id: newId(),
        key: known,
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
