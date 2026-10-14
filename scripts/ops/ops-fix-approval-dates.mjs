/**
 * 승인을 누른 시각이 일정으로 박힌 신청 경유 세미나를 실제 일시로 고친다.
 *
 *   node scripts/ops/ops-fix-approval-dates.mjs                  # dev
 *   node scripts/ops/ops-fix-approval-dates.mjs --target prod    # prod (쓰기 전에 prod ref 입력)
 *   node scripts/ops/ops-fix-approval-dates.mjs --dry-run        # 대상·입력·미리보기까지만
 *
 * 왜: 9/15 수정(837676e) 전의 승인 코드는 승인 버튼을 누른 시각을 세미나 시작 시각으로
 * 박았다. 그 시기에 승인된 세미나는 일정이 비어 있고 활동·출석 이벤트가 승인 시각을 들고
 * 있다(9/30 운영 백업: 3건, 2026-09-13 19:19). 앱 데이터에는 실제 일시가 없으므로
 * 운영자가 입력한다(snumps-webpage/D-000009, D-000012).
 *
 * 무엇을 하나: 대상을 찾아 보여 주고(lib-fix-approval-dates.mjs targetsSql), 세미나마다
 * 날짜·시작(빈칸 = 시각 미정)·종료(선택)·장소를 받아 미리보기를 보인 뒤, 확인을 받아
 * 관리자 "일정 수정"과 같은 SQL 흐름(flow_update_seminar_schedule)으로 세미나·활동·출석
 * 이벤트를 한 트랜잭션씩 고친다. **메일은 보내지 않는다** — 메일은 앱 서비스 계층이
 * 보내고, 이 스크립트는 그 계층을 거치지 않는다.
 *
 * 인증: `supabase login` 세션 하나(lib-supabase-cli.mjs). .env나 prod 비밀 키를 읽지 않는다.
 * 출력: 세미나 제목·시각·장소뿐(개인정보 없음).
 */
import { createInterface } from "node:readline/promises";
import { toKstIso } from "./lib-add-member.mjs";
import {
  applySql,
  resultSql,
  scheduleFrom,
  targetsSql,
} from "./lib-fix-approval-dates.mjs";
import { queryFor, REF } from "./lib-supabase-cli.mjs";

const USAGE =
  "사용: node scripts/ops/ops-fix-approval-dates.mjs [--target dev|prod] [--dry-run]";
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const targetAt = args.indexOf("--target");
const TARGET = targetAt === -1 ? "dev" : args[targetAt + 1];
const known = new Set(["--dry-run", "--target", "dev", "prod"]);
if (
  args.some((a) => !known.has(a)) ||
  (TARGET !== "dev" && TARGET !== "prod")
) {
  console.error(USAGE);
  process.exit(2);
}
if (!process.stdin.isTTY) {
  console.error(
    "터미널에서 직접 입력하며 돌리는 스크립트다 (파이프 입력 불가).",
  );
  process.exit(2);
}

const query = queryFor(/** @type {"dev" | "prod"} */ (TARGET));
const rl = createInterface({ input: process.stdin, output: process.stdout });

/** @param {string} iso */
const kst = (iso) =>
  iso ? iso.replace("T", " ").replace(/:\d{2}\+09:00$/, "") : "(없음)";

async function main() {
  console.log(`대상: ${TARGET}${DRY_RUN ? " (dry-run — 쓰지 않음)" : ""}`);
  const targets = query(targetsSql()).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    wrongStart: String(r.wrong_start),
  }));
  if (targets.length === 0) {
    console.log(
      "고칠 세미나가 없다 (신청 경유·공개·일정 없음·활동=이벤트 시각인 행 0건).",
    );
    return;
  }
  console.log(`\n승인 시각이 일정으로 박힌 세미나 ${targets.length}건:`);
  targets.forEach((t, i) =>
    console.log(`  ${i + 1}. ${t.title}  — 지금 시각: ${kst(t.wrongStart)}`),
  );

  /** @type {{ id: string, title: string, schedule: { startsAt: string, startTime: string | null, endsAt: string | null, location: string } }[]} */
  const plans = [];
  for (const t of targets) {
    console.log(`\n■ ${t.title}`);
    const go = (await rl.question("  이 세미나를 고칠까? [y/N]: "))
      .trim()
      .toLowerCase();
    if (go !== "y") {
      console.log("  → 건너뜀");
      continue;
    }
    for (;;) {
      const date = await rl.question("  날짜 (YYYY-MM-DD): ");
      const start = await rl.question(
        "  시작 HH:MM (모르면 엔터 — 시각 미정): ",
      );
      const end = start.trim()
        ? await rl.question("  종료 HH:MM (선택, 엔터로 건너뜀): ")
        : "";
      const location = await rl.question("  장소: ");
      const built = scheduleFrom({ date, start, end, location });
      if (built.ok) {
        plans.push({ id: t.id, title: t.title, schedule: built.schedule });
        break;
      }
      console.log(`  → ${built.issue} — 다시 입력`);
    }
  }
  if (plans.length === 0) {
    console.log("\n고칠 것을 고르지 않았다 — 아무것도 바꾸지 않았다.");
    return;
  }

  console.log("\n미리보기 (세미나·활동·출석 이벤트가 함께 바뀐다, 메일 없음):");
  for (const p of plans) {
    const s = p.schedule;
    const when =
      s.startTime === null
        ? `${s.startsAt.slice(0, 10)} (시각 미정)`
        : `${kst(s.startsAt)}${s.endsAt ? ` ~ ${kst(s.endsAt).slice(11)}` : ""}`;
    console.log(`  - ${p.title}: ${when} @ ${s.location}`);
  }
  if (DRY_RUN) {
    console.log("\n(dry-run) 여기서 멈춘다.");
    return;
  }
  const ok = (
    await rl.question("\n이대로 적용한다 [yes 입력 시 진행]: ")
  ).trim();
  if (ok !== "yes") {
    console.log("취소했다 — 아무것도 바꾸지 않았다.");
    return;
  }
  if (TARGET === "prod") {
    const ref = (
      await rl.question("prod에 쓴다 — prod 프로젝트 ref를 입력: ")
    ).trim();
    if (ref !== REF.prod) {
      console.log("ref가 다르다 — 취소했다.");
      return;
    }
  }

  /** @type {string[]} */
  const applied = [];
  for (const p of plans) {
    try {
      query(applySql(p.id, p.schedule, toKstIso(new Date())));
      applied.push(p.id);
      console.log(`  적용: ${p.title}`);
    } catch (e) {
      console.error(
        `  실패: ${p.title} — ${e instanceof Error ? e.message : e}`,
      );
      console.error(
        `  여기서 멈춘다. 적용된 것: ${applied.length}건 (다시 실행하면 남은 것만 대상으로 나온다).`,
      );
      break;
    }
  }
  if (applied.length) {
    console.log("\n재조회:");
    for (const r of query(resultSql(applied))) {
      const sch = /** @type {{ startsAt: string, location: string } | null} */ (
        r.schedule
      );
      const act = /** @type {{ start: string } | null} */ (r.activity_date);
      console.log(
        `  - ${r.title}: 세미나 ${kst(sch?.startsAt ?? "")} @ ${sch?.location ?? "-"} / 활동 ${kst(act?.start ?? "")}`,
      );
    }
  }
}

try {
  await main();
} catch (e) {
  console.error(`중단: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
