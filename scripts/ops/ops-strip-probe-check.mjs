// 차단 검증 프로브: 저장된 신청 행의 비가시 문자 검사 후 행 제거 (dev 전용)
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const email = process.argv[2];
const INVISIBLE = /[­​-‍﻿⁠]/;

const { data } = await sb
  .from("app_tables")
  .select("version, doc")
  .eq("name", "applications")
  .single();
const row = data.doc.rows.find((r) => r.email === email);
if (!row) {
  console.log("FAIL — 신청 행이 저장되지 않음 (제출 자체가 실패?)");
  process.exit(1);
}
let dirty = 0;
for (const [k, v] of Object.entries(row)) {
  if (typeof v === "string" && INVISIBLE.test(v)) {
    console.log(`FAIL — ${k} 에 비가시 문자 잔존`);
    dirty += 1;
  }
}
console.log(`저장된 값: name=${JSON.stringify(row.name)} studentId=${JSON.stringify(row.studentId)} phone=${JSON.stringify(row.phone)}`);
console.log(dirty === 0 ? "PASS — 전 필드 클린 (입구 차단 작동)" : `FAIL ${dirty}건`);

// 정리
const rows = data.doc.rows.filter((r) => r.email !== email);
await sb
  .from("app_tables")
  .update({ doc: { ...data.doc, rows }, version: data.version + 1 })
  .eq("name", "applications")
  .eq("version", data.version);
console.log("프로브 행 정리 완료");
process.exit(dirty === 0 ? 0 : 1);
