// 라이브 applications 행의 비가시 문자 1회 정리 (입구 차단 배포 전 유입분)
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const strip = (t) => t.replace(/[­​-‍﻿⁠]/g, "");

const { data } = await sb
  .from("app_tables")
  .select("version, doc")
  .eq("name", "applications")
  .single();
let changed = 0;
const rows = data.doc.rows.map((r) => {
  const next = { ...r };
  for (const k of ["name", "department", "phone", "studentId", "background"]) {
    if (typeof next[k] === "string" && strip(next[k]) !== next[k]) {
      next[k] = strip(next[k]);
      changed += 1;
    }
  }
  return next;
});
if (changed > 0) {
  const { data: upd, error } = await sb
    .from("app_tables")
    .update({ doc: { ...data.doc, rows }, version: data.version + 1 })
    .eq("name", "applications")
    .eq("version", data.version)
    .select("name");
  if (error) throw error;
  if (!upd.length) throw new Error("CAS 실패 — 재실행");
}
console.log(`applications ${data.doc.rows.length}행 중 필드 ${changed}건 정리`);
