/**
 * 전 라우트 실측 스모크 — **디스크의 모든 라우트**를 실제 데이터의 id로 훑는다.
 *
 * `smoke-routes.sh`는 손으로 적은 목록이라 그 뒤에 생긴 라우트(동적 경로,
 * `/media`, 관리자 하위 화면, API)가 빠져 있었다. 여기서는 라우트를 직접
 * 열거하고, 파라미터는 운영 데이터에서 꺼내 채운다 — 빈 값으로 404를 받고
 * "통과"라고 말하지 않기 위해서다.
 *
 * 검사하는 것:
 *  - 상태 코드가 기대와 같은가
 *  - 본문에 서버 오류 흔적이 있는가 (SvelteKit 오류 페이지·스택)
 *  - 200인데 본문이 비어 있지는 않은가
 *
 *   BASE=http://127.0.0.1:5199 node scripts/ops/ops-smoke-all.mjs
 *
 * 읽기 전용. dev 서버의 `dev_preview`로 회원·관리자 화면까지 본다.
 */
import { loadDotenv } from "./lib-env.mjs";

loadDotenv();

const BASE = process.env.BASE ?? "http://127.0.0.1:5199";

/**
 * `dev_preview`는 **개발 전용**이다 (`resolveDevPreviewRole`는 `dev`가 아니면
 * null을 돌려준다). 운영 주소로 같은 경로를 부르면 게스트로 취급돼 회원 존은
 * 303, 관리자 존은 404가 나온다 — 그것이 정상이고, 우회로가 배포본에 없다는
 * 증거이기도 하다. 환경에 따라 기대를 바꾸지 않으면 이 도구가 정상을 실패로
 * 보고한다.
 */
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(BASE);

/** 운영 데이터에서 파라미터를 꺼낸다 (없으면 해당 라우트는 건너뛴다). */
async function sampleIds() {
  const { requireSupabase } = await import("./lib-env.mjs");
  const sb = await requireSupabase({ optional: true });
  if (!sb) return {};
  const { data } = await sb.from("app_tables").select("name, doc");
  const rowsOf = (name) =>
    (data ?? []).find((t) => t.name === name)?.doc?.rows ?? [];

  const seminars = rowsOf("seminars");
  const published = seminars.find((s) => s.publicationStatus === "published");
  const withAsset = seminars.find(
    (s) => (s.materials ?? []).length || (s.photos ?? []).length,
  );
  const events = rowsOf("events");
  const event = events[0];

  return {
    seminarId: published?.id ?? seminars[0]?.id,
    studyId: rowsOf("studies")[0]?.id,
    memberId: rowsOf("members")[0]?.id,
    assetKey: withAsset
      ? (withAsset.materials?.[0] ?? withAsset.photos?.[0])
      : undefined,
    eventPath: event ? `${event.pathId}/${event.attendCode}` : undefined,
    requestId: rowsOf("seminar-requests")[0]?.id,
  };
}

const ids = await sampleIds();

/** [경로, 기대 상태 정규식, 설명] */
const ROUTES = [
  // --- 게스트 공개면 ---
  ["/", /^200$/, "게스트"],
  ["/login", /^200$/, "게스트"],
  ["/about", /^200$/, "게스트"],
  ["/about/charter", /^200$/, "게스트"],
  ["/about/charter/history/2026-1", /^(200|404)$/, "게스트·동적"],
  ["/about/executives", /^200$/, "게스트"],
  ["/about/elections", /^200$/, "게스트"],
  ["/about/press", /^200$/, "게스트"],
  ["/about/finance", /^200$/, "게스트"],
  ["/archive", /^200$/, "게스트"],
  ["/archive/seminars", /^200$/, "게스트"],
  ["/archive/studies", /^200$/, "게스트"],
  ["/archive/activities", /^200$/, "게스트"],
  ["/archive/gallery", /^200$/, "게스트"],
  ["/archive/projects", /^200$/, "게스트"],
  ["/archive/problems", /^200$/, "게스트"],
  ["/archive/discussions", /^200$/, "게스트"],
  ["/archive/misc", /^200$/, "게스트"],
  ["/archive/misc/integration-bee", /^200$/, "게스트"],
  ["/members", /^200$/, "게스트"],
  ["/robots.txt", /^200$/, "게스트"],
  ["/sitemap.xml", /^200$/, "게스트"],
  ["/signup", /^(200|302|303)$/, "게스트"],
  ["/wait", /^(200|302|303)$/, "게스트"],

  // --- 게스트가 막혀야 하는 곳 ---
  ["/study", /^(302|303)$/, "차단"],
  ["/settings/notifications", /^(302|303)$/, "차단"],
  ["/seminar/apply", /^(302|303)$/, "차단"],
  ["/events/manage", /^(302|303)$/, "차단"],
  ["/admin", /^404$/, "차단(존재 은폐)"],
  ["/admin/members", /^404$/, "차단(존재 은폐)"],
  ["/admin/mail", /^404$/, "차단(존재 은폐)"],
  ["/admin/executives", /^404$/, "차단(존재 은폐)"],

  // --- 회원 ---
  ["/study?dev_preview=member", /^200$/, "회원"],
  ["/study/apply?dev_preview=member", /^200$/, "회원"],
  ["/seminar/apply?dev_preview=member", /^200$/, "회원"],
  ["/settings/notifications?dev_preview=member", /^200$/, "회원"],
  ["/settings/withdraw?dev_preview=member", /^200$/, "회원"],
  ["/events/manage?dev_preview=member", /^200$/, "회원"],
  ["/withdraw/pending?dev_preview=member", /^(200|302|303)$/, "회원"],
  ["/signup/edit?dev_preview=member", /^(200|302|303)$/, "회원"],

  // --- 관리자 ---
  ["/admin?dev_preview=admin", /^200$/, "관리자"],
  ["/admin/members?dev_preview=admin", /^200$/, "관리자"],
  ["/admin/activities?dev_preview=admin", /^200$/, "관리자"],
  ["/admin/seminars?dev_preview=admin", /^200$/, "관리자"],
  ["/admin/studies?dev_preview=admin", /^200$/, "관리자"],
  ["/admin/gallery?dev_preview=admin", /^200$/, "관리자"],
  ["/admin/mail?dev_preview=admin", /^200$/, "관리자"],
  ["/admin/executives?dev_preview=admin", /^200$/, "관리자"],
  ["/admin/events/new?dev_preview=admin", /^200$/, "관리자"],
  ["/admin/events/connect?dev_preview=admin", /^200$/, "관리자"],

  // --- API (게스트) ---
  // Bearer(CRON_SECRET) 전용 — 인증 없이 부르면 401이 맞다(핑 감시용은 헤더를 붙인다).
  ["/api/health", /^401$/, "API·차단"],
  ["/api/admin/applications", /^(401|404)$/, "API·차단"],
  ["/api/admin/seminar-requests", /^(401|404)$/, "API·차단"],
  ["/api/admin/study-requests", /^(401|404)$/, "API·차단"],
  ["/api/cron/maintenance", /^(401|501)$/, "API·차단"],
  ["/api/cron/sync-events", /^(401|501)$/, "API·차단"],
];

// --- 실데이터가 필요한 라우트 ---
if (ids.seminarId) {
  ROUTES.push([`/archive/seminars/${ids.seminarId}`, /^200$/, "게스트·동적"]);
}
if (ids.studyId) {
  ROUTES.push([
    `/study/${ids.studyId}?dev_preview=member`,
    /^(200|404)$/,
    "회원·동적",
  ]);
  ROUTES.push([
    `/study/${ids.studyId}/manage?dev_preview=member`,
    /^(200|403|404)$/,
    "회원·동적",
  ]);
  ROUTES.push([
    `/study/${ids.studyId}/attendance?dev_preview=member`,
    /^(200|403|404)$/,
    "회원·동적",
  ]);
}
if (ids.memberId) {
  ROUTES.push([
    `/admin/members/${ids.memberId}?dev_preview=admin`,
    /^200$/,
    "관리자·동적",
  ]);
}
if (ids.requestId) {
  // pending이 아니거나 본인 신청이 아니면 홈으로 302 — 승인된 신청이 그렇다.
  ROUTES.push([
    `/seminar/edit/${ids.requestId}?dev_preview=member`,
    /^(200|302|303|403|404)$/,
    "회원·동적",
  ]);
}
if (ids.eventPath) {
  // 활성 이벤트가 아니면 403 — 링크를 알아도 닫힌 출석은 열리지 않는다.
  ROUTES.push([
    `/events/${ids.eventPath}?dev_preview=member`,
    /^(200|403|404)$/,
    "회원·동적",
  ]);
}
if (ids.assetKey) {
  // 공개된 세미나의 자산은 게스트도 받는다 → 서명 URL로 302.
  ROUTES.push([`/media/${ids.assetKey}`, /^(302|404)$/, "자산 프록시"]);
}
ROUTES.push(["/media/없는/키.pdf", /^404$/, "자산 프록시·거절"]);
ROUTES.push(["/존재하지-않는-경로", /^404$/, "없는 경로"]);

// 서버가 없는데 66개를 전부 두드리면 "실패 66건"이라는 쓸모없는 표가 나온다.
// 한 번 찔러 보고, 없으면 그 사실만 말한다.
try {
  await fetch(BASE, { method: "HEAD" });
} catch {
  console.error(
    `서버에 닿지 않는다: ${BASE}\n` +
      (IS_LOCAL
        ? "로컬이라면 먼저 개발 서버를 띄울 것:\n" +
          "  SUPABASE_URL=… SUPABASE_SECRET_KEY=… npx vite dev --port 5199"
        : "BASE 주소를 확인할 것."),
  );
  process.exit(1);
}

/** SvelteKit 오류 페이지·스택 흔적 */
const ERROR_MARKERS =
  /Internal Error|Internal Server Error|500 —|Cannot read properties of|TypeError:|ReferenceError:|at Module\./i;

let failed = 0;
const results = [];

for (const [path, expectLocal, kind] of ROUTES) {
  // 운영에서는 dev_preview가 통하지 않는다 — 회원 존은 로그인으로, 관리자 존은
  // 존재 은폐 404로 막히는 것이 옳다.
  const expect =
    !IS_LOCAL && path.includes("dev_preview=")
      ? path.includes("dev_preview=admin")
        ? /^404$/
        : /^(302|303)$/
      : expectLocal;
  let code = "ERR";
  let note = "";
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    code = String(res.status);
    const body = await res.text();
    if (!expect.test(code)) {
      note = `기대 ${expect}`;
      failed += 1;
    } else if (ERROR_MARKERS.test(body)) {
      note = "본문에 오류 흔적";
      failed += 1;
    } else if (
      code === "200" &&
      (res.headers.get("content-type") ?? "").includes("text/html") &&
      body.trim().length < 200
    ) {
      // 빈 껍데기 응답을 잡는 검사다. robots.txt처럼 짧은 것이 정상인
      // 비-HTML 응답에는 적용하지 않는다.
      note = `본문이 너무 짧다 (${body.trim().length}자)`;
      failed += 1;
    }
  } catch (e) {
    note = `요청 실패: ${e instanceof Error ? e.message : e}`;
    failed += 1;
  }
  results.push({
    경로: path.slice(0, 52),
    종류: kind,
    코드: code,
    비고: note || "ok",
  });
}

console.table(results);
console.log(
  `\n라우트 ${results.length}개 · 실패 ${failed}개` +
    (ids.seminarId ? "" : "  (운영 데이터 없이 실행 — 동적 경로 일부 생략)"),
);
process.exit(failed ? 1 : 0);
