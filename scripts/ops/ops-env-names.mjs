/**
 * `.env`에 **어떤 이름의 변수가 있는지**만 본다. 값은 절대 출력하지 않는다 —
 * 길이와 "설정됨" 여부만 보여 준다.
 *
 * 왜 필요한가: 스크립트가 `SUPABASE_URL`을 찾는데 `.env`에는 다른 이름으로
 * 들어 있을 수 있다. 파일을 열어 보지 않고도 이름만 맞춰 볼 수 있어야 한다.
 *
 *   node scripts/ops/ops-env-names.mjs            # 전체 이름
 *   node scripts/ops/ops-env-names.mjs SUPABASE   # 이름에 이 글자가 든 것만
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDotenv, REPO_ROOT } from "./lib-env.mjs";

const filter = process.argv[2] ?? "";
const file = path.join(REPO_ROOT, ".env");

if (!existsSync(file)) {
  console.error(`.env 없음: ${file}`);
  process.exit(1);
}

const parsed = parseDotenv(readFileSync(file, "utf8"));
const names = Object.keys(parsed)
  .filter((n) => n.toUpperCase().includes(filter.toUpperCase()))
  .sort();

console.log(
  `.env 변수 ${names.length}개${filter ? ` (필터: ${filter})` : ""}\n`,
);
console.table(
  names.map((name) => ({
    이름: name,
    글자수: parsed[name].length,
    비었나: parsed[name] ? "-" : "비어 있음",
  })),
);
