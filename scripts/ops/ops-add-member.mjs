/**
 * 회원 한 명을 직접 추가한다 — 가입 신청 → 관리자 승인을 한 번에.
 *
 *   node scripts/ops/ops-add-member.mjs                  # dev
 *   node scripts/ops/ops-add-member.mjs --target prod    # prod (쓰기 전에 prod ref 입력)
 *   node scripts/ops/ops-add-member.mjs --dry-run        # 검사만 하고 쓰지 않는다
 *
 * 인증: `supabase login` 세션 하나로 된다 — .env나 prod 비밀 키 파일을 읽지 않는다(결정
 * 2026-09-30). 대상은 프로젝트 ref로 지정한다(`db query --linked --project-ref`, 로컬 링크는
 * 바꾸지 않는다). 필요한 것: Supabase CLI, `supabase login`, 이 폴더가 어떤 프로젝트에든 링크돼
 * 있을 것(`supabase link --project-ref <dev ref>` 한 번).
 *
 * 묻는 것: 이름, 학과, 전화번호, 학번, 이메일, 배경지식(선택). 학과는 회원 레코드의 필수
 * 필드라 함께 묻는다. 규칙은 가입 폼과 같다(src/lib/domain/membership-applications.ts ·
 * members.ts의 phoneInput/backgroundInput) — 전화번호는 010-XXXX-XXXX로 맞춰 저장하고,
 * 이메일은 로그인에 쓰이므로 @snu.ac.kr만 받는다(로그인이 SNU 계정만 받는다).
 *
 * 어떻게 넣나: 앱이 쓰는 길 그대로, 한 트랜잭션(DO 블록)에서 — 가입 신청 행을 applications 표에
 * 넣고 관리자 승인과 같은 흐름 함수(flow_approve_application)로 전환한다. 둘 중 하나라도 실패하면
 * 아무것도 남지 않는다. 그래서
 *   - 같은 이메일의 회원이 이미 있으면 새로 만들지 않고 연락처를 갱신하는 "재등록"이 되고,
 *   - 옛 회원 기록(legacy)이 있으면 가입일·직책·프로젝트를 이어받으며,
 *   - 이번 학기 등록(registrations)까지 함께 만들어진다.
 * 관리자 권한은 절대 주지 않는다(부트스트랩 관리자 목록을 비워 넘긴다). 환영 메일은 보내지 않는다.
 *
 * 입력값은 base64로 SQL에 넘기고 DB 안에서 풀기 때문에 어떤 문자를 넣어도 SQL이 되지 않는다.
 * SQL 파일은 소유자 전용 임시 디렉터리에 만들고 끝나면 지운다. 입력값은 확인 화면에만 보인다.
 *
 * 전제: 대상 DB에 흐름 함수가 있어야 한다(마이그레이션 20260928000000). prod는 release-prod.sh로
 * 반영하기 전에는 없으므로, 그 전에는 멈춘다.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { REPO_ROOT } from "./lib-env.mjs";
import {
  addSql,
  inspectSql,
  RULES,
  resultSql,
  termOf,
  toKstIso,
} from "./lib-add-member.mjs";

const REF = { prod: "rwlvnttpaqkhpebtebif", dev: "gcahkryexewswzvtfltj" };

// ---------------------------------------------------------------------------
// 인자
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const targetAt = args.indexOf("--target");
const TARGET = targetAt === -1 ? "dev" : args[targetAt + 1];
const known = new Set(["--dry-run", "--target", "dev", "prod"]);
if (args.some((a) => !known.has(a)) || !(TARGET in REF)) {
  console.error(
    "사용: node scripts/ops/ops-add-member.mjs [--target dev|prod] [--dry-run]",
  );
  process.exit(2);
}
if (!process.stdin.isTTY) {
  console.error(
    "터미널에서 직접 입력하며 돌리는 스크립트다 (파이프 입력 불가).",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Supabase CLI로 SQL 실행 (stdin 없이 — 숨은 프롬프트에서 멈추지 않게)
// ---------------------------------------------------------------------------

const workDir = mkdtempSync(path.join(tmpdir(), "ops-add-member-"));

/** SQL을 대상 프로젝트에서 돌리고 결과 행을 돌려준다. 실패하면 오류 메시지를 던진다. */
function query(sql) {
  const file = path.join(workDir, "q.sql");
  writeFileSync(file, sql, { mode: 0o600 });
  const res = spawnSync(
    "supabase",
    [
      "--workdir",
      REPO_ROOT,
      "db",
      "query",
      "--linked",
      "--project-ref",
      REF[TARGET],
      "--output-format",
      "json",
      "-f",
      file,
    ],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  rmSync(file, { force: true });
  if (res.error) {
    throw new Error(
      res.error.code === "ENOENT"
        ? "supabase CLI가 없다."
        : `supabase 실행 실패: ${res.error.message}`,
    );
  }
  const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  if (res.status !== 0) throw new Error(cliError(out));
  return rowsOf(out);
}

/** CLI 출력에서 오류 문구만 — SQL 본문(base64 입력)은 되풀이하지 않는다. */
function cliError(out) {
  const json = parseJson(out);
  const message =
    json?.error?.message ?? json?.message ?? json?.error ?? undefined;
  const text =
    typeof message === "string"
      ? message
      : (out
          .split("\n")
          .find((l) => /error|ERROR|not found|login|link/i.test(l)) ??
        "원인 불명");
  return text.slice(0, 400);
}

function parseJson(out) {
  const starts = [out.indexOf("{"), out.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const end = Math.max(out.lastIndexOf("}"), out.lastIndexOf("]"));
  try {
    return JSON.parse(out.slice(Math.min(...starts), end + 1));
  } catch {
    return null;
  }
}

/** 행 배열을 찾는다 — 모르는 형식이면 성공으로 치지 않고 던진다. */
function rowsOf(out) {
  const json = parseJson(out);
  if (Array.isArray(json)) return json;
  const find = (v) => {
    if (v && typeof v === "object") {
      if (Array.isArray(v.rows)) return v.rows;
      for (const x of Object.values(v)) {
        const r = find(x);
        if (r) return r;
      }
    }
    return null;
  };
  const rows = find(json);
  if (!rows) throw new Error("조회 결과를 읽지 못했다 (CLI 출력 형식).");
  return rows;
}

let ulid;
try {
  ({ ulid } = await import("ulid"));
} catch {
  console.error("ulid 모듈이 없다 — 리포에서 `pnpm install`을 먼저 실행할 것.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 입력과 진행
// ---------------------------------------------------------------------------

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function ask(label, rule, { optional = false } = {}) {
  for (;;) {
    const raw = await rl.question(
      `${label}${optional ? " (선택, 엔터로 건너뜀)" : ""}: `,
    );
    if (optional && !raw.trim()) return "";
    const r = rule(raw);
    if ("value" in r) return r.value;
    console.log(`  → ${r.error}`);
  }
}

async function main() {
  console.log(
    `\n== 회원 추가 — 대상: ${TARGET} (${REF[TARGET]})${DRY_RUN ? " · dry-run: 쓰지 않음" : ""}\n`,
  );

  // 흐름 함수가 있는지 먼저 — 없으면 입력을 받을 이유가 없다.
  const [probe] = query(
    "select exists (select 1 from pg_proc where proname = 'flow_approve_application') as ok;",
  );
  if (String(probe?.ok) !== "true") {
    console.error(
      `${TARGET} DB에 flow_approve_application 이 없다 — 마이그레이션 적용 전이다` +
        (TARGET === "prod" ? " (release-prod.sh로 반영한 뒤 다시)." : "."),
    );
    return 1;
  }

  const input = {
    name: await ask("이름", RULES.name),
    department: await ask("학과", RULES.department),
    phone: await ask("전화번호", RULES.phone),
    studentId: await ask("학번", RULES.studentId),
    email: await ask("이메일(@snu.ac.kr)", RULES.email),
    background: await ask("배경지식", RULES.background, { optional: true }),
  };

  const now = new Date();
  const nowIso = toKstIso(now);
  const term = termOf(now);

  const [state] = query(inspectSql(input.email, term));
  if (!state) throw new Error("상태 조회 결과가 비었다.");
  const truthy = (v) => String(v) === "true";
  if (truthy(state.pending_app)) {
    console.error(
      "\n같은 이메일의 가입 신청이 이미 대기 중이다 — 관리자 화면의 승인 큐에서 처리할 것.",
    );
    return 1;
  }
  if (state.info_member_id && !state.member_id) {
    console.error(
      "\n이 이메일의 개인정보 행이 있는데 회원 행이 없다 — 데이터를 먼저 확인할 것.",
    );
    return 1;
  }
  if (state.member_status === "withdrawn") {
    console.error("\n탈퇴 절차 중인 회원이다 — 관리자 화면에서 처리할 것.");
    return 1;
  }
  if (state.member_id && truthy(state.registered)) {
    console.error(`\n이미 ${term} 학기에 등록된 회원이다 — 할 일이 없다.`);
    return 1;
  }

  console.log("\n-- 확인");
  console.log(`  이름      ${input.name}`);
  console.log(`  학과      ${input.department}`);
  console.log(`  전화번호  ${input.phone}`);
  console.log(`  학번      ${input.studentId}`);
  console.log(`  이메일    ${input.email}`);
  console.log(`  배경지식  ${input.background || "(없음)"}`);
  console.log(`  학기      ${term}`);
  if (state.member_id) {
    console.log(
      `  → 재등록: 기존 회원("${state.member_name}")의 전화번호·학번·배경지식을 갱신하고 ${term} 학기에 등록한다.` +
        " 이름·학과는 바꾸지 않는다.",
    );
  } else if (truthy(state.legacy)) {
    console.log(
      "  → 신규 회원 — 옛 회원 기록이 있어 가입일·직책·프로젝트를 이어받는다.",
    );
  } else {
    console.log("  → 신규 회원 (준회원, 가입일 오늘).");
  }
  console.log("  관리자 권한은 주지 않고, 환영 메일은 보내지 않는다.");

  if (DRY_RUN) {
    console.log("\n(dry-run) 여기서 멈춘다 — 아무것도 쓰지 않았다.");
    return 0;
  }
  const go = await rl.question("\n이대로 추가한다 [yes 입력 시 진행]: ");
  if (go.trim() !== "yes") {
    console.log("취소했다.");
    return 1;
  }
  if (TARGET === "prod") {
    const ref = (
      await rl.question("prod에 쓴다 — prod 프로젝트 ref를 입력: ")
    ).trim();
    if (ref !== REF.prod) {
      console.log("ref가 다르다 — 취소했다.");
      return 1;
    }
  }

  const applicationId = ulid();
  const application = {
    id: applicationId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    department: input.department,
    studentId: input.studentId,
    background: input.background,
    createdAt: nowIso,
  };
  const approval = {
    id: applicationId,
    now: nowIso,
    today: nowIso.slice(0, 10),
    term,
    adminEmailHashes: [], // 이 스크립트는 관리자를 만들지 않는다
    memberId: ulid(),
    privateInfoId: ulid(),
    registrationId: ulid(),
  };
  try {
    query(addSql(application, approval));
  } catch (e) {
    console.error(`\n추가하지 않았다 — ${e.message}`);
    console.error("한 트랜잭션이라 DB는 시작 전과 같다.");
    return 1;
  }

  const [done] = query(resultSql(input.email, term));
  if (!done?.member_id || String(done.registered) !== "true") {
    console.error(
      "\n명령은 성공했는데 결과가 보이지 않는다 — 관리자 화면에서 확인할 것.",
    );
    return 1;
  }
  console.log(
    `\n완료: ${state.member_id ? "재등록" : "신규 회원"} — 회원 id ${done.member_id}, ${term} 학기 등록.`,
  );
  console.log(
    "앱은 표 버전으로 캐시를 새로 읽는다 — 화면 반영까지 최대 십수 초.",
  );
  return 0;
}

let code = 1;
try {
  code = await main();
} catch (e) {
  console.error(`\n실패: ${e.message}`);
} finally {
  rl.close();
  rmSync(workDir, { recursive: true, force: true });
}
process.exit(code);
