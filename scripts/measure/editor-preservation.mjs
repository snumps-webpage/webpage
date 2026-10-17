#!/usr/bin/env node
// 편집기(Jodit 4.17.1, iframe 모드) 보존 회귀 시험.
// 사용: node scripts/measure/editor-preservation.mjs [--html <파일>] [--jodit-config <JSON>]
// 측정은 Python Playwright(editor-preservation.py)가 한다. 기준 미달이면 exit 1.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
// Playwright는 저장소 의존성이 아니다: 사용자 site-packages의 python3로 실행(-I 금지).
const r = spawnSync(
  "python3",
  [
    join(here, "editor-preservation.py"),
    "--root",
    root,
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
if (r.error) {
  console.error("python3 실행 실패:", r.error.message);
  process.exit(2);
}
process.exit(r.status ?? 2);
