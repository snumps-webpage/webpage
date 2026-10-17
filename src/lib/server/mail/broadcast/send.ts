import { env } from "$env/dynamic/private";
import { uploadSpec } from "$lib/domain/uploads";
import { newId } from "$lib/server/core/id";
import type { MailBroadcast } from "$lib/server/data/schemas";
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
import { BroadcastParseError, parseEml, type ParsedMail } from "./parse";
import { sanitizeMailHtml, withFooter } from "./sanitize";
import { claimBroadcast, findBroadcast, finishBroadcast } from "./store";

/** staging 경로 접두. 이 밖의 키는 거부함(D-000128). */
export const BROADCAST_PREFIX = "pending/broadcast-eml/";
/** `.eml` 상한 (D-000145). */
export const BROADCAST_MAX_BYTES = uploadSpec("broadcast-eml").maxBytes;

export type BroadcastProblem =
  "bad-key" | "missing" | "too-large" | "unreadable" | "no-subject" | "no-body";

export interface BroadcastPreview {
  messageId: string;
  subject: string;
  html: string | null;
  /** 치환 뒤 HTML이 PREVIEW_HTML_BUDGET을 넘어 뺐으면 true(텍스트본만 보여 줌) */
  htmlOmitted: boolean;
  /** 텍스트본이 혼자 예산을 넘어 앞부분만 남겼으면 true */
  textTruncated: boolean;
  text: string;
  attachments: { filename: string | null; size: number; inline: boolean }[];
  recipientCount: number;
  existing: MailBroadcast | null;
}

interface LoadedBroadcast {
  parsed: ParsedMail;
  /** 정화 + 꼬리말까지 끝난 발송본 (`cid:` 유지) */
  body: { html: string | null; text: string };
}

// announcements.ts의 siteOrigin()과 같은 규칙 (중복 1곳 허용).
function siteOrigin(): string {
  return env.SITE_ORIGIN || "https://snumps.vercel.app";
}

/**
 * 공통 적재: 경로 확인 → 크기 확인 → 다시 읽기 → 해석 → 정화 → 꼬리말.
 * 클라이언트가 준 HTML·제목은 쓰지 않고 항상 staging 파일에서 다시 만든다.
 */
async function loadBroadcast(
  s3Key: string,
): Promise<
  | { ok: true; loaded: LoadedBroadcast }
  | { ok: false; problem: BroadcastProblem }
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

  let parsed: ParsedMail;
  try {
    parsed = await parseEml(raw);
  } catch (e) {
    if (e instanceof BroadcastParseError) return { ok: false, problem: e.code };
    throw e;
  }
  const html = parsed.html === null ? null : sanitizeMailHtml(parsed.html);
  const body = withFooter(
    { html, text: parsed.text },
    `${siteOrigin()}/settings/notifications`,
  );
  return { ok: true, loaded: { parsed, body } };
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

/** `.eml` 키에서 확장자를 뗀 경로. 미리보기 객체는 그 아래 `/preview/`에 둠. */
const previewBase = (s3Key: string) => s3Key.replace(/\.[^./]+$/, "");

/**
 * 미리보기용: 본문이 실제로 참조하는 `cid:<id>` 이미지만 staging에 올려 서명 주소로
 * 바꿈. 발송본에는 쓰지 않음. 저장·서명 실패는 그 이미지만 `cid:`로 두고 건수만 기록
 * (경로·파일 이름은 남기지 않음, D-000162).
 */
async function signPreviewImages(
  html: string,
  parsed: ParsedMail,
  s3Key: string,
): Promise<string> {
  let out = html;
  let failed = 0;
  let n = 0;
  for (const a of parsed.attachments) {
    if (!a.contentId) continue;
    // 속성 값을 깨뜨릴 수 있는 MIME 형식은 치환하지 않음(cid 유지)
    if (!SAFE_MIME.test(a.mimeType)) continue;
    // 이미지가 아닌 첨부는 저장·치환하지 않음. SVG도 제외 — 서명 주소를 직접 열면
    // 그 안의 스크립트가 저장소 도메인에서 실행될 수 있음
    const mime = a.mimeType.toLowerCase();
    if (!mime.startsWith("image/") || mime.startsWith("image/svg")) continue;
    // `cid:img1`이 `cid:img10`의 접두로 바뀌지 않게 값 경계까지 맞춤
    const re = new RegExp(
      `cid:${a.contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=["'\\s>])`,
      "g",
    );
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    n++;
    const ext = PREVIEW_EXT[a.mimeType.toLowerCase()] ?? "bin";
    const path = `${previewBase(s3Key)}/preview/${n}.${ext}`;
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
  const { parsed, body } = r.loaded;
  const [rcpt, existing] = await Promise.all([
    recipients(),
    findBroadcast(parsed.messageId),
  ]);
  let html =
    body.html === null
      ? null
      : await signPreviewImages(body.html, parsed, s3Key);
  // 응답 총량(html+text)에 예산 적용: 넘으면 html 생략, 그래도 넘으면 text 자름
  const bytes = (v: string | null) =>
    v === null ? 0 : Buffer.byteLength(v, "utf8");
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
      subject: parsed.subject,
      html,
      htmlOmitted,
      textTruncated,
      text,
      attachments: parsed.attachments.map((a) => ({
        filename: a.filename,
        size: a.content.byteLength,
        inline: a.disposition === "inline" || a.contentId !== null,
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
  const { parsed, body } = r.loaded;
  try {
    const raw = await composeBroadcast(
      {
        subject: parsed.subject,
        html: body.html,
        text: body.text,
        attachments: parsed.attachments,
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
  const { parsed, body } = r.loaded;

  const { emails, skipped } = await recipients();
  if (emails.length === 0) return { ok: false, problem: "no-recipients" };
  if (skipped > 0)
    console.error(`[Broadcast] ${skipped} address(es) left out — not plain`);

  const row: MailBroadcast = {
    id: newId(),
    messageId: parsed.messageId,
    subject: parsed.subject,
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
            subject: parsed.subject,
            html: body.html,
            text: body.text,
            attachments: parsed.attachments,
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
    const base = `${previewBase(s3Key)}/preview`;
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
  return { ok: true, row: { ...row, ...patch }, skipped };
}
