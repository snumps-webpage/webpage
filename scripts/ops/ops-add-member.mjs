/**
 * 회원 한 명을 직접 추가한다 — 가입 신청 → 관리자 승인을 한 번에.
 *
 *   node scripts/ops/ops-add-member.mjs                  # dev (.env)
 *   node scripts/ops/ops-add-member.mjs --target prod    # prod (.env.prod-secrets, ref 입력 확인)
 *   node scripts/ops/ops-add-member.mjs --dry-run        # 검사만 하고 쓰지 않는다
 *
 * 묻는 것: 이름, 학과, 전화번호, 학번, 이메일, 배경지식(선택). 학과는 회원 레코드의 필수
 * 필드라 함께 묻는다. 규칙은 가입 폼과 같다(src/lib/domain/membership-applications.ts ·
 * members.ts의 phoneInput/backgroundInput) — 전화번호는 010-XXXX-XXXX로 맞춰 저장하고,
 * 이메일은 로그인에 쓰이므로 @snu.ac.kr만 받는다(로그인이 SNU 계정만 받는다).
 *
 * 어떻게 넣나: 앱이 쓰는 길 그대로다. 가입 신청 행을 applications 표에 버전 비교(CAS)로
 * 넣고, 관리자 승인과 같은 흐름 함수(flow_approve_application)로 전환한다. 그래서
 *   - 같은 이메일의 회원이 이미 있으면 새로 만들지 않고 연락처를 갱신하는 "재등록"이 되고,
 *   - 옛 회원 기록(legacy)이 있으면 가입일·직책·프로젝트를 이어받으며,
 *   - 이번 학기 등록(registrations)까지 한 트랜잭션에서 만들어진다.
 * 관리자 권한은 절대 주지 않는다(부트스트랩 관리자 목록을 비워 넘긴다). 환영 메일은 보내지 않는다.
 *
 * 전제: 대상 DB에 흐름 함수가 있어야 한다(마이그레이션 20260928000000). prod는
 * release-prod.sh로 반영하기 전에는 없으므로, 그 전에는 멈춘다.
 *
 * 개인정보: 입력값은 확인 화면에만 보이고 어디에도 기록하지 않는다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  loadDotenv,
  parseDotenv,
  REPO_ROOT,
  requireSupabase,
} from "./lib-env.mjs";

const PROD_REF = "rwlvnttpaqkhpebtebif";
const DEV_REF = "gcahkryexewswzvtfltj";
const URL_OF = {
  prod: `https://${PROD_REF}.supabase.co`,
  dev: `https://${DEV_REF}.supabase.co`,
};

// ---------------------------------------------------------------------------
// 인자와 대상
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const targetAt = args.indexOf("--target");
const TARGET = targetAt === -1 ? "dev" : args[targetAt + 1];
const known = new Set(["--dry-run", "--target", "dev", "prod"]);
const unknown = args.filter((a) => !known.has(a));
if (unknown.length || !(TARGET in URL_OF)) {
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

if (TARGET === "prod") {
  // prod 값이 dev .env 값보다 먼저 자리를 잡게 — loadDotenv는 빈 키만 채운다.
  const file = path.join(REPO_ROOT, ".env.prod-secrets");
  if (!existsSync(file)) {
    console.error(".env.prod-secrets 가 없다.");
    process.exit(1);
  }
  const parsed = parseDotenv(readFileSync(file, "utf8"));
  for (const key of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
    if (!parsed[key]) {
      console.error(`.env.prod-secrets 에 ${key} 가 없다.`);
      process.exit(1);
    }
    process.env[key] = parsed[key];
  }
} else {
  loadDotenv();
}
const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
if (url !== URL_OF[TARGET]) {
  console.error(
    `SUPABASE_URL이 ${TARGET}(${URL_OF[TARGET]})가 아니다 — 환경 파일을 확인할 것.`,
  );
  process.exit(1);
}
const sb = await requireSupabase();

// ---------------------------------------------------------------------------
// 규칙 (가입 폼과 같은 것)
// ---------------------------------------------------------------------------

/** src/lib/utils.ts normalizePhoneNumber와 같다. */
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11)
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone.trim();
}

const RULES = {
  name: (v) => {
    const s = v.trim();
    if (!s) return { error: "이름을 입력해 주세요." };
    if (s.length > 60) return { error: "이름은 60자 이하로 입력해 주세요." };
    return { value: s };
  },
  department: (v) => {
    const s = v.trim();
    if (!s) return { error: "학과를 입력해 주세요." };
    if (s.length > 100) return { error: "학과는 100자 이하로 입력해 주세요." };
    return { value: s };
  },
  phone: (v) => {
    const s = normalizePhone(v);
    return /^010-\d{4}-\d{4}$/.test(s)
      ? { value: s }
      : { error: "전화번호는 010-XXXX-XXXX 형식이어야 합니다." };
  },
  studentId: (v) => {
    const s = v.trim();
    return /^\d{4}-?\d{4,6}$/.test(s)
      ? { value: s }
      : { error: "학번을 2024-12345 형식으로 입력해 주세요." };
  },
  email: (v) => {
    const s = v.trim().toLowerCase();
    if (s.length > 200)
      return { error: "이메일은 200자 이하로 입력해 주세요." };
    if (!/^[^\s@,;<>()"\\[\]]+@snu\.ac\.kr$/.test(s))
      return { error: "서울대학교 이메일(@snu.ac.kr)을 입력해 주세요." };
    return { value: s };
  },
  background: (v) => {
    const s = v.trim();
    return s.length > 2000
      ? { error: "배경지식은 2,000자 이하로 입력해 주세요." }
      : { value: s };
  },
};

// ---------------------------------------------------------------------------
// 시각·학기 (src/lib/server/core/time.ts · src/lib/domain/term.ts와 같다)
// ---------------------------------------------------------------------------

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function toKstIso(d) {
  const t = new Date(d.getTime() + KST_OFFSET_MS);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}+09:00`
  );
}
function termOf(d) {
  const t = new Date(d.getTime() + KST_OFFSET_MS);
  const year = t.getUTCFullYear();
  const month = t.getUTCMonth() + 1;
  const yy = (y) => String(y % 100).padStart(2, "0");
  if (month >= 3 && month <= 8) return `${yy(year)}-1`;
  return `${yy(month >= 9 ? year : year - 1)}-2`;
}

// ULID — src/lib/server/core/id.ts와 같은 형식
const { ulid } = await import("ulid");

// ---------------------------------------------------------------------------
// 저장소 (src/lib/server/data/store.ts와 같은 방식)
// ---------------------------------------------------------------------------

async function readRows(name) {
  const { data, error } = await sb
    .from("app_tables")
    .select("doc, version")
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error(`${name} 읽기 실패: ${error.message}`);
  if (!data) return { rows: [], version: null, doc: null };
  return {
    rows: data.doc?.rows ?? [],
    version: Number(data.version),
    doc: data.doc,
  };
}

/** rows를 바꿔 버전 비교로 쓴다. 다른 쓰기와 겹치면 새로 읽어 다시 한다. */
async function mutateRows(name, change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { rows, version, doc } = await readRows(name);
    const next = change(structuredClone(rows));
    const nextDoc = { ...(doc ?? { schemaVersion: 1 }), rows: next };
    if (version === null) {
      const { data, error } = await sb
        .from("app_tables")
        .insert({ name, version: 1, doc: nextDoc })
        .select();
      if (!error && data?.length) return;
      if (error && error.code !== "23505")
        throw new Error(`${name} 쓰기 실패: ${error.message}`);
    } else {
      const { data, error } = await sb
        .from("app_tables")
        .update({ doc: nextDoc, version: version + 1 })
        .eq("name", name)
        .eq("version", version)
        .select();
      if (error) throw new Error(`${name} 쓰기 실패: ${error.message}`);
      if (data?.length) return;
    }
    await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
  }
  throw new Error(`${name}: 다른 쓰기와 계속 겹친다 — 잠시 뒤 다시.`);
}

// ---------------------------------------------------------------------------
// 입력
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
async function yes(question) {
  return (
    (await rl.question(`${question} [yes 입력 시 진행]: `)).trim() === "yes"
  );
}

async function main() {
  console.log(
    `\n== 회원 추가 — 대상: ${TARGET}${DRY_RUN ? " (dry-run: 쓰지 않음)" : ""}\n`,
  );

  // 흐름 함수가 있는지: 인자 없이 부르면 app_require가 아무것도 잠그거나 쓰기 전에 거부한다.
  const probe = await sb.rpc("flow_approve_application", { p: {} });
  if (
    probe.error?.code === "PGRST202" ||
    /could not find the function/i.test(probe.error?.message ?? "")
  ) {
    console.error(
      `${TARGET} DB에 flow_approve_application 이 없다 — 마이그레이션 적용 전이다` +
        (TARGET === "prod" ? " (release-prod.sh로 반영한 뒤 다시)." : "."),
    );
    return 1;
  }
  if (probe.error?.message !== "VALIDATION_FAILED") {
    console.error(
      `흐름 함수 확인이 예상과 다르다: ${probe.error?.message ?? "오류 없음"}`,
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

  // 지금 상태로 무엇이 일어날지 판정한다.
  const [infos, members, regs, apps, legacyInfos] = await Promise.all([
    readRows("private-info"),
    readRows("members"),
    readRows("registrations"),
    readRows("applications"),
    readRows("legacy-private-info"),
  ]);
  const sameEmail = (r) => (r.email ?? "").trim().toLowerCase() === input.email;
  if (apps.rows.some(sameEmail)) {
    console.error(
      "\n같은 이메일의 가입 신청이 이미 대기 중이다 — 관리자 화면의 승인 큐에서 처리할 것.",
    );
    return 1;
  }
  const existingInfo = infos.rows.find(sameEmail);
  const existingMember = existingInfo
    ? members.rows.find((m) => m.id === existingInfo.memberId)
    : null;
  if (existingInfo && !existingMember) {
    console.error(
      "\n이 이메일의 개인정보 행이 있는데 회원 행이 없다 — 데이터를 먼저 확인할 것.",
    );
    return 1;
  }
  if (existingMember?.status === "withdrawn") {
    console.error("\n탈퇴 절차 중인 회원이다 — 관리자 화면에서 처리할 것.");
    return 1;
  }
  if (
    existingMember &&
    regs.rows.some((r) => r.memberId === existingMember.id && r.term === term)
  ) {
    console.error(`\n이미 ${term} 학기에 등록된 회원이다 — 할 일이 없다.`);
    return 1;
  }
  const legacy = !existingInfo && legacyInfos.rows.some(sameEmail);

  console.log("\n-- 확인");
  console.log(`  이름      ${input.name}`);
  console.log(`  학과      ${input.department}`);
  console.log(`  전화번호  ${input.phone}`);
  console.log(`  학번      ${input.studentId}`);
  console.log(`  이메일    ${input.email}`);
  console.log(`  배경지식  ${input.background || "(없음)"}`);
  console.log(`  학기      ${term}`);
  if (existingMember) {
    console.log(
      `  → 재등록: 기존 회원("${existingMember.name}")의 전화번호·학번·배경지식을 갱신하고 ${term} 학기에 등록한다.` +
        " 이름·학과는 바꾸지 않는다.",
    );
  } else if (legacy) {
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
  if (!(await yes("\n이대로 추가한다"))) {
    console.log("취소했다.");
    return 1;
  }
  if (TARGET === "prod") {
    const ref = (
      await rl.question("prod에 쓴다 — prod 프로젝트 ref를 입력: ")
    ).trim();
    if (ref !== PROD_REF) {
      console.log("ref가 다르다 — 취소했다.");
      return 1;
    }
  }

  // 1) 가입 신청 행 — 폼이 만드는 것과 같은 모양
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
  await mutateRows("applications", (rows) => {
    if (rows.some(sameEmail))
      throw new Error("그새 같은 이메일의 신청이 들어왔다 — 중단.");
    return [...rows, application];
  });

  // 2) 관리자 승인과 같은 전환 (한 트랜잭션)
  const { data, error } = await sb.rpc("flow_approve_application", {
    p: {
      id: applicationId,
      now: nowIso,
      today: nowIso.slice(0, 10),
      term,
      adminEmailHashes: [], // 이 스크립트는 관리자를 만들지 않는다
      memberId: ulid(),
      privateInfoId: ulid(),
      registrationId: ulid(),
    },
  });
  if (error && ["CONFLICT", "NOT_FOUND"].includes(error.message)) {
    // 그 사이 관리자가 승인 큐에서 이 신청을 먼저 처리했다 — 거둘 것도, 다시 할 것도 없다.
    console.error(
      `\n전환하지 않았다: 그 사이 이 신청이 이미 처리됐다(${error.message}) — 관리자 화면에서 결과를 확인할 것.`,
    );
    return 1;
  }
  if (error) {
    console.error(
      `\n전환 실패: ${error.message}${error.details ? ` (${error.details})` : ""}`,
    );
    // 남은 신청 행을 거둔다 — 남기면 관리자 승인 큐에 뜬다.
    try {
      await mutateRows("applications", (rows) =>
        rows.filter((a) => a.id !== applicationId),
      );
      console.error("넣었던 가입 신청 행은 지웠다 — DB는 시작 전과 같다.");
    } catch (e) {
      console.error(
        `넣었던 가입 신청 행을 지우지 못했다(${e.message}) — 관리자 화면의 승인 큐에서 반려할 것.`,
      );
    }
    return 1;
  }

  console.log(
    `\n완료: ${existingMember ? "재등록" : "신규 회원"} — 회원 id ${data?.memberId ?? "?"}, ${term} 학기 등록.`,
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
}
process.exit(code);
