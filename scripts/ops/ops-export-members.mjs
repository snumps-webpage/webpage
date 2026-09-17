/**
 * 학기별 회원 명부를 엑셀로 뽑는다 — 이름 · 학과 · 전화번호 · 학번.
 *
 * 기준은 **등록**(`registrations`)이다. 회원 자격의 행사 권한은 학기 단위 등록으로
 * 생기므로(S9), "26-2 회원"은 26-2에 등록한 사람이지 회원 표 전체가 아니다.
 *
 *   node scripts/ops/ops-export-members.mjs --term 26-2
 *   node scripts/ops/ops-export-members.mjs --term 26-2 --out /some/dir
 *
 * 만들어진 파일에는 **전화번호와 학번이 들어 있다.** 기본 저장 위치(`exports/`)는
 * `.gitignore`에 있고, 스크립트는 값을 화면에 찍지 않는다 — 몇 명인지와 빈 칸이
 * 몇인지만 보고한다.
 *
 * 읽기 전용: 운영 DB에 아무것도 쓰지 않는다.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadDotenv, REPO_ROOT } from "./lib-env.mjs";
import { buildXlsx } from "./lib-xlsx.mjs";

loadDotenv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SECRET_KEY 없음");
  process.exit(1);
}

const termArg = process.argv.indexOf("--term");
const term = termArg !== -1 ? process.argv[termArg + 1] : null;
if (!term) {
  console.error("학기를 지정할 것: --term 26-2");
  process.exit(1);
}
const outArg = process.argv.indexOf("--out");
const outDir =
  outArg !== -1 ? process.argv[outArg + 1] : path.join(REPO_ROOT, "exports");

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(url, key);

const { data, error } = await sb.from("app_tables").select("name, doc");
if (error) {
  console.error(`app_tables 조회 실패: ${error.message}`);
  process.exit(1);
}
const rowsOf = (name) =>
  (data ?? []).find((t) => t.name === name)?.doc?.rows ?? [];

const registrations = rowsOf("registrations");
const members = rowsOf("members");
const privateInfo = rowsOf("private-info");

const registered = new Set(
  registrations.filter((r) => r.term === term).map((r) => r.memberId),
);
if (registered.size === 0) {
  const terms = [...new Set(registrations.map((r) => r.term))].sort();
  console.error(
    `${term} 등록자가 없다. 있는 학기: ${terms.join(", ") || "(없음)"}`,
  );
  process.exit(1);
}

const memberById = new Map(members.map((m) => [m.id, m]));
const infoByMember = new Map(privateInfo.map((p) => [p.memberId, p]));

/** 빈 칸은 "" 로 둔다 — 없는 값을 지어내지 않는다. */
const people = [...registered]
  .map((id) => {
    const member = memberById.get(id);
    const info = infoByMember.get(id);
    return {
      name: member?.name ?? "",
      department: member?.department ?? "",
      phone: info?.phone ?? "",
      studentId: info?.studentId ?? "",
      missingMember: !member,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));

const rows = [
  ["이름", "학과", "전화번호", "학번"],
  ...people.map((p) => [p.name, p.department, p.phone, p.studentId]),
];

mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `회원명부-${term}.xlsx`);
if (existsSync(file)) {
  console.error(`이미 있는 파일이다 (덮어쓰지 않는다): ${file}`);
  process.exit(1);
}
writeFileSync(file, buildXlsx(rows, `${term} 회원`));

// 값이 아니라 **빈 칸의 수**만 보고한다.
const blanks = {
  이름: people.filter((p) => !p.name).length,
  학과: people.filter((p) => !p.department).length,
  전화번호: people.filter((p) => !p.phone).length,
  학번: people.filter((p) => !p.studentId).length,
};
const missing = people.filter((p) => p.missingMember).length;

console.log(`${term} 등록 회원 ${people.length}명 → ${file}`);
console.table([blanks]);
if (missing) {
  console.log(`⚠ 등록은 있는데 회원 행이 없는 건: ${missing}`);
}
console.log(
  "\n이 파일에는 전화번호·학번이 들어 있다 — 공유 범위를 확인하고, 커밋하지 말 것.",
);
