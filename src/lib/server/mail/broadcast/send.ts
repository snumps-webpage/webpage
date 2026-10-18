import { env } from "$env/dynamic/private";
import { stringify } from "devalue";
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
  /** 편집 불가일 때만: 꼬리말 포함 미리보기 본문. 편집 가능하면 null (D-000208) */
  html: string | null;
  /** 꼬리말 없는 편집용 HTML(미리보기와 같은 서명 주소). 편집 불가면 null */
  editableHtml: string | null;
  /** 편집 가능할 때만: 꼬리말 HTML 조각. 미리보기 = `editableHtml + footerHtml` (D-000208) */
  footerHtml: string | null;
  editable: boolean;
  /** 편집 불가 이유: HTML 본문 없음 / 미리보기 예산 초과 (D-000209) */
  notEditableReason: "no-html" | "too-large" | null;
  draft: {
    subject: string;
    removedAttachments: number[];
    savedAt: string;
    savedBy: string;
  } | null;
  /** 응답이 전송 크기 상한(PREVIEW_RESPONSE_BUDGET)을 넘어 HTML을 뺐으면 true(텍스트본만 보여 줌, D-000212) */
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

/**
 * `cid:<id>`를 값 경계까지 맞추는 정규식(`cid:img1`이 `cid:img10`에 걸리지 않게).
 * 경계: 따옴표·공백·`>`·`)` 또는 따옴표 엔티티(`&quot;` `&#34;` `&#39;` `&apos;`
 * `&#x22;` `&#x27;`). Jodit이 style 속성을 `url(&quot;cid:…&quot;)`로 다시 쓰는 경우를
 * 참조로 봄. 미리보기 서명·본문 사진 분류·발송 첨부 판정·D-000201 검사가 모두 이
 * 하나를 씀 (D-000211).
 */
function cidRef(contentId: string): RegExp {
  return new RegExp(
    `cid:${contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=["'\\s>)]|&(?:quot|apos|#34|#39|#[xX]22|#[xX]27);)`,
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
/** 초안 입력 HTML 상한(UTF-8 바이트, 저장 전·정화 후 각각). 응답 크기 상한은 아래(D-000212). */
export const PREVIEW_HTML_BUDGET = 3_000_000;
/**
 * 미리보기 action 응답 상한(실제 전송 바이트). Vercel 응답 한도 4.5MB 아래로 둠(D-000162).
 * Kit은 `JSON.stringify({ type, status, data: devalue.stringify(data) })`로 두 번
 * 직렬화하므로 태그 많은 본문은 3MB가 5MB 넘게 늘어남 — 그래서 본문 바이트가 아니라
 * 직렬화 결과를 잼(D-000212).
 */
export const PREVIEW_RESPONSE_BUDGET = 4_000_000;
/** Kit action 응답과 같은 직렬화의 UTF-8 바이트(`type`·`status` 약 40바이트는 여유에 포함). */
const wireBytes = (v: unknown) =>
  Buffer.byteLength(JSON.stringify({ data: stringify(v) }), "utf8");
/**
 * 초안 저장 검사용 가정: 미리보기 서명 주소의 최대 길이(문자). 저장 때는 서명이 없으므로
 * `cid:` 참조를 이 길이의 자리표시로 바꿔 쟀음. 실제 Supabase 서명 주소(도메인 + 경로 +
 * JWT 토큰)는 약 400~600자, 한글 경로를 퍼센트 인코딩하면 최악 약 1000자이므로
 * 두 배 여유를 둠(D-000212, D-000216-b).
 */
const SIGNED_URL_MAX_LENGTH = 2048;
/** 초안 저장 검사의 미리보기 응답 나머지 필드(`existing` 등) 여유 바이트. */
const SAVE_RESPONSE_SLACK = 20_000;
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
  // 번호는 원본 정화본 기준(초안과 무관). 꼬리말 없는 본문을 한 번만 서명하고
  // 꼬리말은 그 뒤에 붙임(꼬리말에는 cid가 없음).
  const originalHtml =
    parsed.html === null ? null : sanitizeMailHtml(parsed.html);
  const images = previewImages(parsed, originalHtml);
  const signedBare =
    bareHtml === null
      ? null
      : await signPreviewImages(bareHtml, parsed, images, s3Key);
  const footerHtml =
    signedBare === null || body.html === null
      ? null
      : body.html.slice((bareHtml ?? "").length);
  // 응답에는 본문을 한 번만 담음(D-000208). 예산은 실제 전송 크기로 판정함(D-000212):
  // 후보 응답을 Kit action 응답과 같은 방식으로 직렬화한 UTF-8 바이트가 상한 이하인지.
  // 순서: 편집 가능 조합 → 편집 불가(html) → html 생략 → text 자름.
  const base = {
    messageId: parsed.messageId,
    subject,
    draft: draft && {
      subject: draft.subject,
      removedAttachments: draft.removedAttachments,
      savedAt: draft.savedAt,
      savedBy: draft.savedBy,
    },
    attachments: parsed.attachments.map((a) => ({
      filename: a.filename,
      size: a.content.byteLength,
      inline: a.disposition === "inline" || a.contentId !== null,
      inBody: inBody(originalHtml, a),
    })),
    recipientCount: rcpt.emails.length,
    existing,
  };
  const assemble = (
    editable: boolean,
    html: string | null,
    text: string,
    htmlOmitted: boolean,
    textTruncated: boolean,
  ): BroadcastPreview => ({
    ...base,
    html,
    editableHtml: editable ? signedBare : null,
    footerHtml: editable ? footerHtml : null,
    editable,
    notEditableReason: editable
      ? null
      : signedBare === null
        ? "no-html"
        : "too-large",
    htmlOmitted,
    textTruncated,
    text,
  });
  const fits = (p: BroadcastPreview) => wireBytes(p) <= PREVIEW_RESPONSE_BUDGET;
  const text = body.text;
  const canShowHtml = signedBare !== null && footerHtml !== null;
  if (canShowHtml) {
    // 편집용 본문이 저장 입력 상한(3MB)을 넘으면 saveDraft가 거부하므로 편집 불가(D-000214).
    const editBodyFits =
      Buffer.byteLength(signedBare, "utf8") <= PREVIEW_HTML_BUDGET;
    const edit = assemble(true, null, text, false, false);
    if (editBodyFits && fits(edit)) return { ok: true, preview: edit };
    const full = assemble(false, signedBare + footerHtml, text, false, false);
    if (fits(full)) return { ok: true, preview: full };
  }
  const omitted = canShowHtml;
  const plain = assemble(false, null, text, omitted, false);
  if (fits(plain)) return { ok: true, preview: plain };
  // text가 혼자 상한을 넘음: 들어가는 가장 긴 앞부분을 이분 탐색(측정 약 23회)
  let lo = 0;
  let hi = Buffer.byteLength(text, "utf8");
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(assemble(false, null, truncateUtf8(text, mid), omitted, true)))
      lo = mid;
    else hi = mid - 1;
  }
  return {
    ok: true,
    preview: assemble(false, null, truncateUtf8(text, lo), omitted, true),
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
  // 이 초안으로 만들 편집용 미리보기 응답이 상한을 넘으면 저장 뒤 다시 열 때 편집할 수
  // 없게 되므로 같은 측정으로 미리 막음. 서명 주소는 최대 길이 자리표시로 근사(D-000212).
  const approxHtml = images.reduce(
    (h, img) =>
      h.replace(cidRef(img.contentId), () => "x".repeat(SIGNED_URL_MAX_LENGTH)),
    clean,
  );
  const wrapped = withFooter(
    { html: approxHtml, text: null },
    `${siteOrigin()}/settings/notifications`,
  );
  const approxResponse = {
    subject,
    editableHtml: approxHtml,
    footerHtml: (wrapped.html ?? "").slice(approxHtml.length),
    text: wrapped.text,
    attachments: parsed.attachments.map((a) => ({
      filename: a.filename,
      size: a.content.byteLength,
      inline: a.disposition === "inline" || a.contentId !== null,
      inBody: true,
    })),
    slack: "x".repeat(SAVE_RESPONSE_SLACK),
  };
  if (wireBytes(approxResponse) > PREVIEW_RESPONSE_BUDGET)
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
