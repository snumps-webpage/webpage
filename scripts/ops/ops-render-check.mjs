/**
 * 렌더링 실측 — 실제 브라우저로 페이지를 띄워 **보이는 글자**를 검사한다.
 *
 * 상태 코드가 200이어도 화면은 깨질 수 있다: `undefined`가 글자로 찍히거나,
 * 날짜가 `Invalid Date`로 나오거나, 이미지 `src`가 빈 문자열이거나, 객체가
 * `[object Object]`로 새어 나오는 식이다. 그런 것들은 서버 로그에 아무것도
 * 남기지 않는다 — 눈으로 보거나 이렇게 훑어야 잡힌다.
 *
 * 하이드레이션 이후의 DOM을 본다(`--dump-dom`). `<script>` 안의 직렬화
 * 페이로드는 제외한다 — 거기 있는 `null`은 정상이고, 화면 글자가 아니다.
 *
 *   BASE=http://127.0.0.1:5199 node scripts/ops/ops-render-check.mjs
 *
 * 읽기 전용.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadDotenv } from "./lib-env.mjs";

const run = promisify(execFile);
loadDotenv();

const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const BROWSER = process.env.CHROMIUM ?? "chromium";

/** 크로미움 자체가 내는 잡음 — 앱의 오류가 아니다. */
const BROWSER_NOISE =
  /ev_root_ca_metadata|Failed to decode OID|GLES|Vulkan|dbus|gpu_|sandbox|DevTools listening|Fontconfig|libva/i;

/** 화면에 나오면 안 되는 글자들. */
const TEXT_DEFECTS = [
  ["undefined", /(^|[\s>(])undefined([\s<).,]|$)/],
  ["NaN", /(^|[\s>(])NaN([\s<).,]|$)/],
  ["Invalid Date", /Invalid Date/],
  ["[object Object]", /\[object Object\]/],
  ["빈 서식 자리", /\{\{[a-zA-Z_]+\}\}/],
];

/** 검사할 화면 — 게스트·회원·관리자 대표 경로. */
const PAGES = (process.env.PAGES ?? "").split(",").filter(Boolean);

async function renderedDom(path) {
  const { stdout, stderr } = await run(
    BROWSER,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--virtual-time-budget=8000",
      "--dump-dom",
      `${BASE}${path}`,
    ],
    { maxBuffer: 40 * 1024 * 1024, timeout: 60_000 },
  );
  return { dom: stdout, stderr };
}

/** `<script>`·`<style>` 내용을 뺀 "보이는 글자". */
function visibleText(dom) {
  return dom
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

export async function checkPage(path) {
  /** @type {string[]} */
  const problems = [];
  let dom = "";
  let stderr = "";
  try {
    ({ dom, stderr } = await renderedDom(path));
  } catch (e) {
    return {
      path,
      problems: [
        `렌더 실패: ${e instanceof Error ? e.message.slice(0, 80) : e}`,
      ],
    };
  }

  const text = visibleText(dom);
  for (const [label, pattern] of TEXT_DEFECTS) {
    // 메일 템플릿 편집기는 `{{변수}}`를 **보여 주는 것이 일**이다.
    if (label === "빈 서식 자리" && path.startsWith("/admin/mail")) continue;
    if (pattern.test(text)) problems.push(`화면에 "${label}"`);
  }

  // 빈 링크·이미지 — 자산 URL이 비면 이렇게 나온다(W-8의 재발 감지).
  if (/<img[^>]+src=""/.test(dom)) problems.push('빈 img src=""');
  if (/<a[^>]+href=""/.test(dom)) problems.push('빈 a href=""');

  // 브라우저 콘솔의 앱 오류
  const consoleErrors = stderr
    .split("\n")
    .filter(
      (line) => /ERROR|Uncaught|SEVERE/.test(line) && !BROWSER_NOISE.test(line),
    )
    .slice(0, 3);
  for (const line of consoleErrors)
    problems.push(`콘솔: ${line.trim().slice(0, 100)}`);

  return { path, problems, chars: text.length };
}

const targets = PAGES.length
  ? PAGES
  : [
      "/",
      "/about",
      "/about/executives",
      "/archive",
      "/archive/seminars",
      "/archive/studies",
      "/archive/activities",
      "/archive/gallery",
      "/archive/projects",
      "/members",
      "/login",
      "/study?dev_preview=member",
      "/seminar/apply?dev_preview=member",
      "/events/manage?dev_preview=member",
      "/settings/notifications?dev_preview=member",
      "/admin?dev_preview=admin",
      "/admin/seminars?dev_preview=admin",
      "/admin/members?dev_preview=admin",
      "/admin/mail?dev_preview=admin",
      "/admin/gallery?dev_preview=admin",
    ];

const rows = [];
let failed = 0;
for (const path of targets) {
  const result = await checkPage(path);
  if (result.problems.length) failed += 1;
  rows.push({
    경로: path.slice(0, 46),
    글자수: result.chars ?? 0,
    문제: result.problems.length
      ? result.problems.join(" · ").slice(0, 70)
      : "ok",
  });
}

console.table(rows);
console.log(`\n화면 ${rows.length}개 · 문제 있는 화면 ${failed}개`);
process.exit(failed ? 1 : 0);
