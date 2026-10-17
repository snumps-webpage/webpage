import { env } from "$env/dynamic/private";
import { uploadSpec } from "$lib/domain/uploads";
import { newId } from "$lib/server/core/id";
import type {
  MailBroadcast,
  MailBroadcastDraft,
} from "$lib/server/data/schemas";
import {
  createSignedStagedUrl,
  listStaged,
  readStaged,
  removeStaged,
  stagedInfo,
  uploadStaged,
} from "$lib/server/data/storage";
import { isSingleAddress } from "../address";
import {
  GmailQuotaError,
  GmailSendError,
  dispatchRaw,
  getAdminAccessToken,
} from "../client";
import { BATCH_SIZE, optedInMemberEmails } from "../dispatch";
import { composeBroadcast } from "./compose";
import {
  deleteDraft,
  draftId,
  keyBase,
  readDraft,
  restoreCids,
  writeDraft,
  type PreviewImage,
} from "./draft";
import {
  BroadcastParseError,
  parseEml,
  type MailAttachment,
  type ParsedMail,
} from "./parse";
import { htmlToText, sanitizeMailHtml, withFooter } from "./sanitize";
import { claimBroadcast, findBroadcast, finishBroadcast } from "./store";

/** staging 경로 접두. 이 밖의 키는 거부함(D-000128). */
export const BROADCAST_PREFIX = "pending/broadcast-eml/";
/** `.eml` 상한 (D-000145). */
export const BROADCAST_MAX_BYTES = uploadSpec("broadcast-eml").maxBytes;

export type BroadcastProblem =
  "bad-key" | "missing" | "too-large" | "unreadable" | "no-subject" | "no-body";

export type DraftProblem =
  "no-subject" | "no-body" | "too-large-draft" | "bad-input";

export interface BroadcastPreview {
  messageId: string;
  /** 초안이 있으면 초안 제목 */
  subject: string;
  html: string | null;
  /** 꼬리말 없는 편집용 HTML(미리보기와 같은 서명 주소). 예산 초과면 null */
  editableHtml: string | null;
  editable: boolean;
  draft: {
    subject: string;
    removedAttachments: number[];
    savedAt: string;
    savedBy: string;
  } | null;
  /** 치환 뒤 HTML이 PREVIEW_HTML_BUDGET을 넘어 뺐으면 true(텍스트본만 보여 줌) */
  htmlOmitted: boolean;
  /** 텍스트본이 혼자 예산을 넘어 앞부분만 남겼으면 true */
  textTruncated: boolean;
  text: string;
  /**
   * 원본 첨부 전부(색인 = `removedAttachments` 기준). 뺀 것은 draft로 판단.
   * `inBody`: 원본 본문 사진 — 빼기 체크 대신 본문에서 지움 (D-000200)
   */
  attachments: {
    filename: string | null;
    size: number;
    inline: boolean;
    inBody: boolean;
  }[];
  recipientCount: number;
  existing: MailBroadcast | null;
}

interface LoadedBroadcast {
  parsed: ParsedMail;
  /** 발송 제목(초안이 있으면 초안 제목) */
  subject: string;
  /** 발송 첨부(초안의 제거·미참조 cid 반영) */
  attachments: MailAttachment[];
  /** 정화됐으나 꼬리말 없는 HTML (`cid:` 유지) */
  bareHtml: string | null;
  /** 정화 + 꼬리말까지 끝난 발송본 (`cid:` 유지) */
  body: { html: string | null; text: string };
  draft: MailBroadcastDraft | null;
}

/** `cid:<id>`를 값 경계까지 맞추는 정규식(`cid:img1`이 `cid:img10`에 걸리지 않게). */
function cidRef(contentId: string): RegExp {
  return new RegExp(
    `cid:${contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=["'\\s>])`,
    "g",
  );
}
const references = (html: string, contentId: string) =>
  cidRef(contentId).test(html);
/** 원본 본문 사진: 원본 정화본이 `cid:`로 참조하는 첨부. */
const inBody = (originalHtml: string | null, a: MailAttachment) =>
  a.contentId !== null &&
  originalHtml !== null &&
  references(originalHtml, a.contentId);

// announcements.ts의 siteOrigin()과 같은 규칙 (중복 1곳 허용).
function siteOrigin(): string {
  return env.SITE_ORIGIN || "https://snumps.vercel.app";
}

/** 경로 확인 → 크기 확인 → 다시 읽기 → 해석. 원본 `.eml`만 다룸. */
async function resolveOriginal(
  s3Key: string,
): Promise<
  { ok: true; parsed: ParsedMail } | { ok: false; problem: BroadcastProblem }
> {
  // 경로 이탈(`..`)·역슬래시·제어문자는 거부
  if (
    !s3Key.startsWith(BROADCAST_PREFIX) ||
    s3Key.split("/").includes("..") ||
    // eslint-disable-next-line no-control-regex
    /[\\\u0000-\u001f\u007f]/.test(s3Key)
  )
    return { ok: false, problem: "bad-key" };
  const info = await stagedInfo(s3Key);
  if (!info) return { ok: false, problem: "missing" };
  if (info.size > BROADCAST_MAX_BYTES)
    return { ok: false, problem: "too-large" };
  const raw = await readStaged(s3Key);
  if (!raw) return { ok: false, problem: "missing" };
  if (raw.byteLength > BROADCAST_MAX_BYTES)
    return { ok: false, problem: "too-large" };

  try {
    return { ok: true, parsed: await parseEml(raw) };
  } catch (e) {
    if (e instanceof BroadcastParseError) return { ok: false, problem: e.code };
    throw e;
  }
}

/**
 * 공통 적재: 원본 해석 → (초안이 있으면 초안 제목·본문·첨부 반영) → 정화 → 꼬리말.
 * 클라이언트가 준 HTML·제목은 쓰지 않고 항상 staging 파일에서 다시 만든다.
 */
async function loadBroadcast(
  s3Key: string,
): Promise<
  | { ok: true; loaded: LoadedBroadcast }
  | { ok: false; problem: BroadcastProblem }
> {
  const r = await resolveOriginal(s3Key);
  if (!r.ok) return r;
  const { parsed } = r;
  const originalHtml =
    parsed.html === null ? null : sanitizeMailHtml(parsed.html);
  const optOut = `${siteOrigin()}/settings/notifications`;

  const d = await readDraft(s3Key);
  if (!d) {
    const body = withFooter({ html: originalHtml, text: parsed.text }, optOut);
    return {
      ok: true,
      loaded: {
        parsed,
        subject: parsed.subject,
        attachments: parsed.attachments,
        bareHtml: originalHtml,
        body,
        draft: null,
      },
    };
  }
  // 초안 본문은 저장 때 정화했어도 발송 직전에 다시 정화함. 파일이 없으면 원본.
  const bareHtml = d.html === null ? originalHtml : sanitizeMailHtml(d.html);
  const removed = new Set(d.row.removedAttachments);
  // 빼는 cid 첨부는 원본 본문 사진 중 초안에서 지운 것만. 원본이 참조하지 않던 cid
  // 첨부(Content-ID 붙은 일반 파일)는 일반 첨부로 둠 (D-000200)
  const attachments = parsed.attachments.filter(
    (a, i) =>
      !removed.has(i) &&
      !(
        inBody(originalHtml, a) &&
        !(bareHtml !== null && references(bareHtml, a.contentId ?? ""))
      ),
  );
  const body = withFooter(
    { html: bareHtml, text: bareHtml === null ? parsed.text : null },
    optOut,
  );
  return {
    ok: true,
    loaded: {
      parsed,
      subject: d.row.subject,
      attachments,
      bareHtml,
      body,
      draft: d.row,
    },
  };
}

/** 수신 동의 회원 중 주소 검사를 통과한 수신자와 제외 수. */
async function recipients(): Promise<{ emails: string[]; skipped: number }> {
  const all = await optedInMemberEmails();
  const emails = all.filter(isSingleAddress);
  return { emails, skipped: all.length - emails.length };
}

const SAFE_MIME = /^[\w.+-]+\/[\w.+-]+$/;

/** 미리보기 이미지 확장자 표. 표에 없는 안전한 형식은 `bin`. */
const PREVIEW_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
/** 미리보기 HTML 상한(UTF-8 바이트). Vercel 응답 한도 4.5MB 아래로 둠(D-000162). */
export const PREVIEW_HTML_BUDGET = 3_000_000;
/** 미리보기 이미지 서명 주소 유효 시간(초). */
export const PREVIEW_IMAGE_TTL = 600;

/**
 * 미리보기 이미지 목록: 본문이 참조하는 `cid:` 이미지 중 안전한 이미지 형식만, 원본
 * 첨부 순서로 번호 1부터. 서명(`signPreviewImages`)과 초안 저장(`saveDraft`)이 같은
 * 규칙을 씀. `html`은 원본 정화본이어야 번호가 초안과 무관하게 고정됨.
 */
export function previewImages(
  parsed: ParsedMail,
  html: string | null,
): PreviewImage[] {
  const out: PreviewImage[] = [];
  if (html === null) return out;
  for (const a of parsed.attachments) {
    if (!a.contentId) continue;
    // 속성 값을 깨뜨릴 수 있는 MIME 형식은 치환하지 않음(cid 유지)
    if (!SAFE_MIME.test(a.mimeType)) continue;
    // 이미지가 아닌 첨부는 저장·치환하지 않음. SVG도 제외 — 서명 주소를 직접 열면
    // 그 안의 스크립트가 저장소 도메인에서 실행될 수 있음
    const mime = a.mimeType.toLowerCase();
    if (!mime.startsWith("image/") || mime.startsWith("image/svg")) continue;
    if (!references(html, a.contentId)) continue;
    out.push({
      n: out.length + 1,
      ext: PREVIEW_EXT[mime] ?? "bin",
      contentId: a.contentId,
    });
  }
  return out;
}

/**
 * 미리보기용: 본문이 실제로 참조하는 `cid:<id>` 이미지만 staging에 올려 서명 주소로
 * 바꿈. 발송본에는 쓰지 않음. 저장·서명 실패는 그 이미지만 `cid:`로 두고 건수만 기록
 * (경로·파일 이름은 남기지 않음, D-000162).
 */
async function signPreviewImages(
  html: string,
  parsed: ParsedMail,
  images: PreviewImage[],
  s3Key: string,
): Promise<string> {
  let out = html;
  let failed = 0;
  for (const img of images) {
    const re = cidRef(img.contentId);
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    const a = parsed.attachments.find((x) => x.contentId === img.contentId);
    if (!a) continue;
    const path = `${keyBase(s3Key)}/preview/${img.n}.${img.ext}`;
    try {
      await uploadStaged(path, a.content, a.mimeType);
      const url = await createSignedStagedUrl(path, PREVIEW_IMAGE_TTL);
      out = out.replace(re, () => url);
    } catch {
      failed++;
    }
  }
  if (failed > 0)
    console.error(`[Broadcast] ${failed} preview image(s) left as cid`);
  return out;
}

/** UTF-8 바이트 상한으로 자름. 잘린 문자 조각은 버려 문자가 깨지지 않게 함. */
function truncateUtf8(text: string, maxBytes: number): string {
  const cut = new TextDecoder().decode(
    Buffer.from(text, "utf8").subarray(0, maxBytes),
  );
  return cut.replace(/\uFFFD+$/, "");
}

/** 미리보기: 제목·정화된 본문·첨부·수신자 수·같은 메일의 기존 기록. */
export async function previewBroadcast(
  s3Key: string,
): Promise<
  | { ok: true; preview: BroadcastPreview }
  | { ok: false; problem: BroadcastProblem }
> {
  const r = await loadBroadcast(s3Key);
  if (!r.ok) return r;
  const { parsed, body, bareHtml, subject, draft } = r.loaded;
  const [rcpt, existing] = await Promise.all([
    recipients(),
    findBroadcast(parsed.messageId),
  ]);
  const bytes = (v: string | null) =>
    v === null ? 0 : Buffer.byteLength(v, "utf8");
  // 번호는 원본 정화본 기준(초안과 무관). 꼬리말 없는 본문을 한 번만 서명하고
  // 꼬리말은 그 뒤에 붙임(꼬리말에는 cid가 없음).
  const originalHtml =
    parsed.html === null ? null : sanitizeMailHtml(parsed.html);
  const images = previewImages(parsed, originalHtml);
  const signedBare =
    bareHtml === null
      ? null
      : await signPreviewImages(bareHtml, parsed, images, s3Key);
  const editableHtml =
    signedBare !== null && bytes(signedBare) <= PREVIEW_HTML_BUDGET
      ? signedBare
      : null;
  let html =
    signedBare === null || body.html === null
      ? null
      : signedBare + body.html.slice((bareHtml ?? "").length);
  // 응답 총량(html+text)에 예산 적용: 넘으면 html 생략, 그래도 넘으면 text 자름
  let text = body.text;
  const htmlOmitted =
    html !== null && bytes(html) + bytes(text) > PREVIEW_HTML_BUDGET;
  if (htmlOmitted) html = null;
  const textTruncated = bytes(text) > PREVIEW_HTML_BUDGET;
  if (textTruncated) text = truncateUtf8(text, PREVIEW_HTML_BUDGET);
  return {
    ok: true,
    preview: {
      messageId: parsed.messageId,
      subject,
      html,
      editableHtml,
      editable: editableHtml !== null,
      draft: draft && {
        subject: draft.subject,
        removedAttachments: draft.removedAttachments,
        savedAt: draft.savedAt,
        savedBy: draft.savedBy,
      },
      htmlOmitted,
      textTruncated,
      text,
      attachments: parsed.attachments.map((a) => ({
        filename: a.filename,
        size: a.content.byteLength,
        inline: a.disposition === "inline" || a.contentId !== null,
        inBody: inBody(originalHtml, a),
      })),
      recipientCount: rcpt.emails.length,
      existing,
    },
  };
}

/** 시험 발송: 한 주소에만 1통, 기록 없음. Gmail 오류는 throw하지 않음. */
export async function sendBroadcastTest(
  s3Key: string,
  to: string,
): Promise<
  { ok: true } | { ok: false; problem: BroadcastProblem | "send-failed" }
> {
  const r = await loadBroadcast(s3Key);
  if (!r.ok) return r;
  if (!isSingleAddress(to)) return { ok: false, problem: "send-failed" };
  const { subject, body, attachments } = r.loaded;
  try {
    const raw = await composeBroadcast(
      {
        subject,
        html: body.html,
        text: body.text,
        attachments,
      },
      [to],
    );
    await dispatchRaw(await getAdminAccessToken(), raw);
    return { ok: true };
  } catch (e) {
    console.error("[Broadcast] test send failed:", describeError(e));
    return { ok: false, problem: "send-failed" };
  }
}

/** 로그에는 Gmail reason·status만 — 본문·주소는 남기지 않음. */
function describeError(e: unknown): string {
  if (e instanceof GmailQuotaError) return e.message;
  if (e instanceof GmailSendError) return `status ${e.status} ${e.reason}`;
  return e instanceof Error ? e.name : "unknown error";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * 전체 발송. 같은 메일은 한 번만 선점(D-000110), 400명 묶음마다 조립·발송,
 * 묶음 실패는 계속하되 쿼터 오류는 남은 묶음을 중단함(자동 재시도 없음).
 */
export async function sendBroadcast(
  s3Key: string,
  sentBy: string,
): Promise<
  | { ok: true; row: MailBroadcast; skipped: number }
  | {
      ok: false;
      problem: BroadcastProblem | "duplicate" | "no-recipients";
      existing?: MailBroadcast;
    }
> {
  const r = await loadBroadcast(s3Key);
  if (!r.ok) return r;
  const { parsed, subject, body, attachments } = r.loaded;

  const { emails, skipped } = await recipients();
  if (emails.length === 0) return { ok: false, problem: "no-recipients" };
  if (skipped > 0)
    console.error(`[Broadcast] ${skipped} address(es) left out — not plain`);

  const row: MailBroadcast = {
    id: newId(),
    messageId: parsed.messageId,
    subject,
    sentBy,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    recipientCount: emails.length,
    batchesSent: 0,
    batchesFailed: 0,
    status: "sending",
  };
  const claim = await claimBroadcast(row);
  if (!claim.ok)
    return { ok: false, problem: "duplicate", existing: claim.existing };

  let batchesSent = 0;
  let batchesFailed = 0;
  try {
    const accessToken = await getAdminAccessToken();
    const batches = chunk(emails, BATCH_SIZE);
    for (const [i, batch] of batches.entries()) {
      try {
        const raw = await composeBroadcast(
          {
            subject,
            html: body.html,
            text: body.text,
            attachments,
          },
          batch,
        );
        await dispatchRaw(accessToken, raw);
        batchesSent++;
      } catch (e) {
        batchesFailed++;
        console.error(`[Broadcast] batch ${i + 1} failed:`, describeError(e));
        if (e instanceof GmailQuotaError) break; // 남은 묶음 중단
      }
    }
  } catch (e) {
    // 토큰 오류 등 첫 묶음 전 실패 — 아무에게도 나가지 않음
    console.error("[Broadcast] could not start:", describeError(e));
  }

  const status =
    batchesFailed === 0 && batchesSent > 0
      ? "sent"
      : batchesSent === 0
        ? "failed"
        : "partial";
  const patch = {
    status,
    batchesSent,
    batchesFailed,
    recipientCount: emails.length,
    finishedAt: new Date().toISOString(),
  } as const;
  try {
    await finishBroadcast(row.id, patch);
  } catch (e) {
    // 행은 sending으로 남음 = spec '결과 불명' 경로. 예외는 그대로 전파.
    console.error("[Broadcast] could not record the result", describeError(e));
    throw e;
  }

  try {
    // .eml과 그 미리보기 이미지(`<키-확장자>/preview/`) 전부
    const base = `${keyBase(s3Key)}/preview`;
    let previews: string[] = [];
    try {
      previews = (await listStaged(base)).map((f) => `${base}/${f.name}`);
    } catch (e) {
      // 목록 실패가 .eml 삭제를 막지 않게 함
      console.error("[Broadcast] preview listing failed:", describeError(e));
    }
    await removeStaged([s3Key, ...previews]);
  } catch (e) {
    console.error("[Broadcast] staged file removal failed:", describeError(e));
  }
  await deleteDraft(s3Key); // 실패는 안에서 로그만
  return { ok: true, row: { ...row, ...patch }, skipped };
}

/**
 * 초안 저장. 원본을 다시 해석해 입력을 검사하고, 미리보기 서명 주소를 `cid:`로 되돌린
 * 뒤 정화해서 저장함. 클라이언트 HTML은 정화 없이 쓰지 않음.
 */
export async function saveDraft(
  s3Key: string,
  input: { subject: string; html: string; removedAttachments: number[] },
  savedBy: string,
): Promise<
  | { ok: true; savedAt: string }
  | { ok: false; problem: BroadcastProblem | DraftProblem }
> {
  const r = await resolveOriginal(s3Key);
  if (!r.ok) return r;
  const { parsed } = r;

  // HTML 파트가 없는 원본은 편집 대상이 아님(화면도 editable false) (D-000202)
  if (
    parsed.html === null ||
    typeof input.subject !== "string" ||
    typeof input.html !== "string"
  )
    return { ok: false, problem: "bad-input" };
  const subject = input.subject.trim();
  if (subject === "") return { ok: false, problem: "no-subject" };
  const removed = input.removedAttachments;
  if (
    !Array.isArray(removed) ||
    removed.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= parsed.attachments.length,
    ) ||
    new Set(removed).size !== removed.length
  )
    return { ok: false, problem: "bad-input" };
  if (Buffer.byteLength(input.html, "utf8") > PREVIEW_HTML_BUDGET)
    return { ok: false, problem: "too-large-draft" };

  const images = previewImages(
    parsed,
    parsed.html === null ? null : sanitizeMailHtml(parsed.html),
  );
  const clean = sanitizeMailHtml(restoreCids(input.html, s3Key, images));
  // 정화가 엔티티로 늘린 경우도 막음 — 넘으면 다음 미리보기에서 편집할 수 없게 됨
  if (Buffer.byteLength(clean, "utf8") > PREVIEW_HTML_BUDGET)
    return { ok: false, problem: "too-large-draft" };
  // 본문이 아직 쓰는 사진은 뺄 수 없음 — 빼면 받는 쪽에서 깨진 사진 (D-000201)
  if (
    removed.some((i) => {
      const cid = parsed.attachments[i].contentId;
      return cid !== null && references(clean, cid);
    })
  )
    return { ok: false, problem: "bad-input" };
  const visibleText = htmlToText(clean)
    .replace(/[\u00a0\u200b]/g, "")
    .trim();
  if (visibleText === "" && !/<img\b/i.test(clean))
    return { ok: false, problem: "no-body" };

  const savedAt = new Date().toISOString();
  await writeDraft(
    {
      id: draftId(s3Key),
      s3Key,
      messageId: parsed.messageId,
      subject,
      removedAttachments: [...removed].sort((a, b) => a - b),
      savedBy,
      savedAt,
    },
    clean,
  );
  return { ok: true, savedAt };
}
