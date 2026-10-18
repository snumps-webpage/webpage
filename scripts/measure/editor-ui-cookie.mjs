// editor-ui.py용 — 실측 서버의 시험 AUTH_SECRET으로 위조한 관리자 세션 쿠키 값을 파일로 남긴다.
// 실측 서버 전용 값이라 운영·dev에서는 쓸모가 없다. 출력하지 않는다.
//
//   node scripts/measure/editor-ui-cookie.mjs <저장 경로>
import fs from "node:fs";
import { session } from "./lib.mjs";

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/measure/editor-ui-cookie.mjs <저장 경로>");
  process.exit(2);
}
const cookie = await session("admin@snu.ac.kr", "관리자 / 학부생 / 수리과학부");
fs.writeFileSync(out, cookie.split("=").slice(1).join("="), { mode: 0o600 });
