// 회원명 비가시 문자 전수 검사 — 모든 관련 테이블의 모든 문자열 필드 대상.
// 대상 문자: soft hyphen(U+00AD), zero-width(U+200B~200D), BOM(U+FEFF), word joiner(U+2060)
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const INVISIBLE = /[­​-‍﻿⁠]/;

const TABLES = [
  "members",
  "private-info",
  "legacy-members",
  "legacy-private-info",
  "applications",
  "seminars",
  "studies",
  "seminar-requests",
  "activities",
];

function scan(value, path, hits) {
  if (typeof value === "string") {
    if (INVISIBLE.test(value)) hits.push(path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, `${path}[${i}]`, hits));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) scan(v, `${path}.${k}`, hits);
  }
}

let total = 0;
for (const name of TABLES) {
  const { data } = await sb.from("app_tables").select("doc").eq("name", name).maybeSingle();
  const rows = data?.doc?.rows ?? [];
  const hits = [];
  rows.forEach((r, i) => scan(r, `${name}[${i}]`, hits));
  console.log(`${name.padEnd(20)} rows=${String(rows.length).padStart(3)}  비가시문자=${hits.length}`);
  total += hits.length;
  for (const h of hits.slice(0, 5)) console.log(`   → ${h}`);
}
console.log(total === 0 ? "\n✅ 전체 클린" : `\n⚠️ 총 ${total}건 잔존`);
