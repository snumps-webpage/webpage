import { createHash } from "node:crypto";
import PostalMime from "postal-mime";

/** 첨부·내장 이미지 한 개. postal-mime 결과에서 필요한 필드만 옮김. */
export interface MailAttachment {
  filename: string | null;
  mimeType: string;
  disposition: "inline" | "attachment" | null;
  /** 꺾쇠를 뺀 Content-ID. 내장 이미지(`cid:`) 참조에 쓰임(D-000105) */
  contentId: string | null;
  content: Uint8Array;
}

export interface ParsedMail {
  messageId: string;
  subject: string;
  html: string | null;
  text: string | null;
  attachments: MailAttachment[];
}

/** 해석 거부 사유. 발송 전 미리보기·발송 단계가 사유를 그대로 표시함(D-000128). */
export class BroadcastParseError extends Error {
  constructor(public code: "unreadable" | "no-subject" | "no-body") {
    super(`broadcast .eml rejected: ${code}`);
    this.name = "BroadcastParseError";
  }
}

const FORWARD_PREFIX = /^\s*(?:fwd|fw|전달)\s*:\s*/i;

/** 제목 앞의 `Fwd:`·`FW:`·`전달:`를 반복 제거하고 trim함(D-000104). */
export function stripForwardPrefix(subject: string): string {
  let out = subject;
  while (FORWARD_PREFIX.test(out)) out = out.replace(FORWARD_PREFIX, "");
  return out.trim();
}

const FROM_LINE = /^(?:From|보낸\s*사람)\s*:/i;
const OTHER_KEY_LINE =
  /^(?:Date|Subject|To|Cc|날짜|제목|받는\s*사람|참조)\s*:/i;
const MAX_MARK_LENGTH = 200;
// From 줄 뒤 이 줄 수 안에 다른 알려진 헤더 키가 하나 이상 와야 함
const KEY_LOOKAHEAD = 4;

/** 대시 5개 이상 + 문구 + 대시 5개 이상인 표지 줄인지 선형으로 판정(정규식 없음). */
function isDashLine(line: string): boolean {
  const s = line.trim();
  if (s.length > MAX_MARK_LENGTH) return false;
  let head = 0;
  while (head < s.length && s[head] === "-") head++;
  let tail = 0;
  while (tail < s.length - head && s[s.length - 1 - tail] === "-") tail++;
  return head >= 5 && tail >= 5 && s.slice(head, s.length - tail).trim() !== "";
}

const isKnownHeader = (line: string) =>
  FROM_LINE.test(line.trim()) || OTHER_KEY_LINE.test(line.trim());

/**
 * Gmail 전달 머리말의 시작(대시 줄) 줄 번호를 찾음. 대시 줄 바로 다음 줄이
 * From/보낸사람이고 그 뒤 4줄 안에 Date·Subject·To·Cc(또는 한국어 대응)가 있을
 * 때만 인정함. 문구는 언어에 묶지 않음. 없으면 -1.
 */
function findForwardMark(lines: string[]): number {
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!isDashLine(lines[i]) || !FROM_LINE.test(lines[i + 1].trim())) continue;
    const next = lines.slice(i + 2, i + 2 + KEY_LOOKAHEAD);
    if (next.some((l) => OTHER_KEY_LINE.test(l.trim()))) return i;
  }
  return -1;
}

/**
 * Gmail 전달 텍스트에서 표지 줄 이전(전달자 메모)과 머리말 블록(표지부터 첫 빈
 * 줄까지)을 버림(D-000104). 빈 줄이 없으면 머리말 헤더 줄만 버리고 본문은 남김.
 * 전달 머리말이 아니면 원문 유지.
 */
function stripGmailQuoteText(text: string): string {
  const lines = text.split(/\r?\n/);
  const mark = findForwardMark(lines);
  if (mark < 0) return text;
  const after = lines.slice(mark + 1);
  let skip = after.findIndex((l) => l.trim() === "");
  if (skip < 0) {
    skip = 0;
    while (skip < after.length && isKnownHeader(after[skip])) skip++;
  }
  return after.slice(skip).join("\n").replace(/^\s+/, "");
}

const htmlToLines = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => l.trim());

/**
 * Gmail 전달 HTML에서 인용 본문만 남김(D-000104). `div.gmail_quote` 안의 첫
 * `div.gmail_attr`가 전달 머리말일 때만 `gmail_quote` 앞(전달자 메모)과 그
 * 머리말을 버림. 일반 답장 인용("On ... wrote:")이나 표지가 없으면 원문 유지.
 */
function stripGmailQuoteHtml(html: string): string {
  const start = html.search(
    /<div\b[^>]*class=(?:"[^"]*|'[^']*)\bgmail_quote\b/i,
  );
  if (start < 0) return html;
  const quote = html.slice(start);
  const attr =
    /<div\b[^>]*class=(?:"[^"]*|'[^']*)\bgmail_attr\b[^>]*>[\s\S]*?<\/div>/i;
  const m = attr.exec(quote);
  if (!m || findForwardMark(htmlToLines(m[0])) < 0) return html;
  return quote.replace(attr, "");
}

const blankToNull = (value: string | undefined) =>
  value && value.trim() !== "" ? value : null;

/** `.eml` 원본을 해석함. 거부 사유는 `BroadcastParseError.code`로 구분. */
export async function parseEml(raw: Uint8Array): Promise<ParsedMail> {
  let email;
  try {
    email = await PostalMime.parse(raw);
  } catch {
    throw new BroadcastParseError("unreadable");
  }

  const html = blankToNull(
    email.html === undefined ? undefined : stripGmailQuoteHtml(email.html),
  );
  const text = blankToNull(
    email.text === undefined ? undefined : stripGmailQuoteText(email.text),
  );
  if (html === null && text === null) throw new BroadcastParseError("no-body");

  const subject = stripForwardPrefix(email.subject ?? "");
  if (subject === "") throw new BroadcastParseError("no-subject");

  const headerId = (email.messageId ?? "").replace(/[<>\s]/g, "");
  const messageId =
    headerId !== ""
      ? headerId
      : `sha256:${createHash("sha256").update(raw).digest("hex")}`;

  const attachments = email.attachments.map((a): MailAttachment => {
    const disposition =
      a.disposition === "inline"
        ? "inline"
        : a.disposition === "attachment"
          ? "attachment"
          : null;
    const contentId = (a.contentId ?? "").replace(/[<>\s]/g, "");
    const content =
      typeof a.content === "string"
        ? new TextEncoder().encode(a.content)
        : new Uint8Array(a.content);
    return {
      filename: a.filename,
      mimeType: a.mimeType,
      disposition,
      contentId: contentId === "" ? null : contentId,
      content,
    };
  });

  return { messageId, subject, html, text, attachments };
}
