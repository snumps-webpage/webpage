import sanitizeHtml from "sanitize-html";

/**
 * 태그를 벗길 때 내용(텍스트)도 함께 버리는 태그 (D-000152).
 * 허용 태그(style)는 그대로 유지되고, 나머지는 내용째 제거된다.
 */
const NON_TEXT_TAGS = [
  "script",
  "style",
  "textarea",
  "select",
  "option",
  "noscript",
  "form",
  "button",
  "iframe",
  "object",
];

/**
 * 전체 공지 .eml 본문 정화 허용 목록(spec sanitize.ts 항목, D-000100).
 * 허용 목록에 없는 태그는 벗기고, script·form·iframe 등은 내용째 제거한다.
 * `allowedSchemes: []`로 기본 scheme을 비우고 태그별로만 허용한다.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "img",
    "a",
    "p",
    "div",
    "span",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "blockquote",
    "pre",
    "code",
    "font",
    "center",
    "style",
  ],
  allowedAttributes: {
    "*": [
      "style",
      "align",
      "valign",
      "width",
      "height",
      "bgcolor",
      "color",
      "border",
      "cellpadding",
      "cellspacing",
      "colspan",
      "rowspan",
      "href",
      "src",
      "alt",
      "title",
      "target",
    ],
  },
  allowedSchemes: [],
  allowedSchemesByTag: {
    a: ["http", "https", "mailto"],
    img: ["http", "https", "cid"],
  },
  // style 블록 허용(spec)에 필요한 옵션 — 없으면 sanitize-html이 style을
  // 허용하면서 경고를 낸다.
  allowVulnerableTags: true,
  nonTextTags: NON_TEXT_TAGS,
  disallowedTagsMode: "discard",
};

const FOOTER_SENTENCE =
  "이 메일은 SNUMPS 전체 공지로 재발송되었습니다. 수신 설정:";

/** 수신 메일 HTML을 허용 목록으로 정화한다 (D-000100). */
export function sanitizeMailHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/** 정화된 HTML에서 태그를 걷어 텍스트 대체본을 만든다. */
export function htmlToText(html: string): string {
  // 블록 경계는 태그를 벗기기 전에 줄바꿈으로 바꾼다
  const withBreaks = html.replace(
    /<br\s*\/?>|<\/(?:p|div|li|tr|h[1-6]|blockquote)\s*>/gi,
    "$&\n",
  );
  const stripped = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: NON_TEXT_TAGS,
  });
  // &amp;는 마지막에 복원해 이중 디코딩을 막는다
  return stripped
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 정화된 본문 끝에 수신 설정 꼬리말을 붙인다.
 * 텍스트 본문이 없으면 HTML에서 태그를 걷어 만든다.
 */
export function withFooter(
  body: { html: string | null; text: string | null },
  optOutUrl: string,
): { html: string | null; text: string } {
  const baseText = body.text ?? (body.html ? htmlToText(body.html) : "");
  const text = `${baseText}\n\n-- \n${FOOTER_SENTENCE} ${optOutUrl}`;
  const html =
    body.html === null
      ? null
      : `${body.html}<hr><p>${FOOTER_SENTENCE} <a href="${optOutUrl}">${optOutUrl}</a></p>`;
  return { html, text };
}
