/**
 * 운영 데이터 스냅샷 — **배포 전 롤백 수단**.
 *
 * 왜 필요한가: 이 저장소의 롤백은 `git revert`로 되지 않는다. 배포된 코드가
 * 모르는 필드는 읽는 순간 벗겨지고, 한 번의 쓰기가 표 전체를 다시 쓴다. 되돌릴
 * 유일한 길은 **데이터를 되돌리는 것**이고, 그러려면 되돌릴 사본이 있어야 한다.
 *
 * 그런데 주간 백업(`backups/dumps/`)은 비어 있다 — 한 번도 만들어지지 않았다.
 * 이 스크립트는 그 공백을 메운다.
 *
 * 받는 것: `app_tables`(앱 상태 전부) · `app_queues`(출석 큐) · `audit_log`.
 * 파일은 **로컬에만** 쓴다 — 버킷에 올리는 것은 별도 결정이다.
 *
 *   node scripts/ops/ops-backup-db.mjs                    # ./backups/ 에 저장
 *   node scripts/ops/ops-backup-db.mjs --out /some/dir
 *
 * 복원은 `--restore <파일>`이 아니다. 이 스크립트는 **읽기만** 한다 — 복원은
 * 무엇을 어디까지 되돌릴지 사람이 정한 뒤에 할 일이다.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadDotenv, REPO_ROOT, requireSupabase } from "./lib-env.mjs";

loadDotenv();

const sb = await requireSupabase();
const url = process.env.SUPABASE_URL;

const outArg = process.argv.indexOf("--out");
const outDir =
  outArg !== -1 ? process.argv[outArg + 1] : path.join(REPO_ROOT, "backups");

/** Required arrays from the atomic snapshot; missing arrays prevent saving. */
const TABLES = ["app_tables", "app_queues", "audit_log"];

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const snapshot = {
  takenAt: new Date().toISOString(),
  project: url,
  tables: {},
};
const report = [];

// The SQL function reads all three tables in one statement snapshot. Paging
// separate SELECTs can mix states across an attendance approval transaction.
const { data: tables, error: readError } = await sb.rpc(
  "flow_backup_snapshot",
  { p: {} },
);
if (readError)
  throw new Error(`스냅샷 조회 실패: ${readError.code ?? "unknown"}`);
for (const table of TABLES) {
  const data = tables?.[table];
  if (!Array.isArray(data)) {
    report.push({ 테이블: table, 행: "-", 비고: "실패: 스냅샷 테이블 없음" });
    continue;
  }
  snapshot.tables[table] = data;
  report.push({
    테이블: table,
    행: data.length,
    비고: `${(JSON.stringify(data).length / 1024).toFixed(1)} KB`,
  });
}

console.table(report);

// 롤백 사본은 셋이 다 있어야 쓸모가 있다 — 하나라도 빠지면 저장하지 않는다.
const missing = TABLES.filter((t) => !(t in snapshot.tables));
if (missing.length) {
  console.error(`\n받지 못한 테이블: ${missing.join(", ")} — 저장하지 않는다.`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `supabase-${stamp}.json`);
if (existsSync(file)) {
  console.error(`이미 있는 파일이다: ${file}`);
  process.exit(1);
}
const body = JSON.stringify(snapshot, null, 2);
writeFileSync(file, body);

// 쓴 것을 다시 읽어 행 수가 맞는지 본다 — "받았다고 생각했는데 비어 있는" 사본을
// 배포 직전에 발견하지 않도록.
const readBack = JSON.parse(readFileSync(file, "utf8")); // 디스크의 파일을 — 메모리의 문자열이 아니라
const mismatch = Object.entries(snapshot.tables).filter(
  ([name, rows]) => (readBack.tables[name] ?? []).length !== rows.length,
);
if (mismatch.length) {
  console.error(
    "저장본의 행 수가 다르다:",
    mismatch.map(([n]) => n).join(", "),
  );
  process.exit(1);
}

console.log(`\n저장: ${file}`);
console.log(`크기: ${(body.length / 1024).toFixed(1)} KB · 확인: 행 수 일치`);
console.log(
  "\n이 파일에는 회원 개인정보(이메일·전화번호)가 들어 있다 — 커밋하지 말 것.",
);
