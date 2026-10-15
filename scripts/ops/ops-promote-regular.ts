/**
 * 첫 일괄 승급 — 회칙 기준 정회원 요건을 이미 채운 준회원을 `regular`로 올린다.
 *
 *   npx tsx scripts/ops/ops-promote-regular.ts                         # dev, 미리보기
 *   npx tsx scripts/ops/ops-promote-regular.ts --target prod           # prod, 미리보기
 *   npx tsx scripts/ops/ops-promote-regular.ts --target prod --apply   # prod에 쓴다 (ref 입력)
 *
 * 왜: 매일 maintenance cron이 요건을 채운 준회원을 승급하지만(services/member-standing.ts,
 * snumps-webpage/D-000073·079), 그 단계가 배포되기 전부터 요건을 채운 회원이 있다.
 * 첫 회는 미리보기를 보여 주고 질문한 뒤 적용한다(D-000080).
 *
 * 무엇을 하나: 판정에 필요한 표를 읽어(회원은 id·legacyMemberId·status만) cron과
 * **같은 순수 함수**로 후보를 고른다(lib-promote-regular.ts → src/lib/domain/member-activity.ts).
 * 기본은 미리보기 — 후보 수와 회원 id만 출력한다(이름 없음). `--apply`면 대상
 * 프로젝트 ref를 입력받고, 후보를 **다시 계산**해 그때도 `associate`인 행만 setStatus와
 * 같은 필드로 바꾸고 audit `member.auto-promote` 행을 남긴 뒤 재조회한다.
 *
 * 인증: `supabase login` 세션 하나(lib-supabase-cli.mjs). .env나 prod 비밀 키를 읽지 않는다.
 * 출력: 회원 id와 지위뿐(개인정보 없음).
 */
import { createInterface } from "node:readline/promises";
import { ulid } from "ulid";
import { toKstIso } from "./lib-add-member.mjs";
import {
  applySql,
  candidatesFrom,
  readSql,
  resultSql,
  tablesFrom,
} from "./lib-promote-regular";
import { queryFor, REF } from "./lib-supabase-cli.mjs";

const USAGE =
  "사용: npx tsx scripts/ops/ops-promote-regular.ts [--target dev|prod] [--apply]";
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const targetAt = args.indexOf("--target");
const TARGET = targetAt === -1 ? "dev" : args[targetAt + 1];
const known = new Set(["--apply", "--target", "dev", "prod"]);
if (
  args.some((a) => !known.has(a)) ||
  (TARGET !== "dev" && TARGET !== "prod")
) {
  console.error(USAGE);
  process.exit(2);
}
if (APPLY && !process.stdin.isTTY) {
  console.error(
    "--apply는 터미널에서 직접 입력하며 돌린다 (파이프 입력 불가).",
  );
  process.exit(2);
}

const target = TARGET as "dev" | "prod";
const query = queryFor(target);

function candidatesNow(): string[] {
  const [row] = query(readSql());
  if (!row) throw new Error("표를 읽지 못했다.");
  return candidatesFrom(tablesFrom(row), new Date()).sort();
}

async function main() {
  console.log(`대상: ${target}${APPLY ? "" : " (미리보기 — 쓰지 않음)"}`);
  const preview = candidatesNow();
  console.log(
    `\n승급 대상(이번 학기 등록·준회원·활동 기록 3회 이상): ${preview.length}명`,
  );
  for (const id of preview) console.log(`  - ${id}`);
  if (!APPLY) {
    console.log("\n(미리보기) 적용하려면 --apply.");
    return;
  }
  if (preview.length === 0) {
    console.log("\n승급할 회원이 없다 — 아무것도 바꾸지 않았다.");
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ref = (
      await rl.question(`\n${target}에 쓴다 — ${target} 프로젝트 ref를 입력: `)
    ).trim();
    if (ref !== REF[target]) {
      console.log("ref가 다르다 — 취소했다.");
      return;
    }
  } finally {
    rl.close();
  }

  // 미리보기와 확인 사이에 바뀌었을 수 있다 — 다시 계산한다
  const memberIds = candidatesNow();
  if (memberIds.length === 0) {
    console.log("다시 계산하니 대상이 없다 — 아무것도 바꾸지 않았다.");
    return;
  }
  query(
    applySql({
      memberIds,
      now: toKstIso(new Date()),
      audits: memberIds.map((memberId) => ({ id: ulid(), memberId })),
    }),
  );

  console.log("\n재조회:");
  const rows = query(resultSql(memberIds));
  for (const r of rows) console.log(`  - ${r.id}: ${r.status}`);
  const promoted = rows.filter((r) => r.status === "regular").length;
  console.log(`정회원 ${promoted}/${memberIds.length}명.`);
  const remaining = candidatesNow();
  console.log(`남은 승급 대상: ${remaining.length}명.`);
}

try {
  await main();
} catch (e) {
  console.error(`중단: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
}
