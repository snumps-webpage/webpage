// publishable 키의 데이터 접근이 전부 막히는지 확인 — 행 0개 또는 오류가 정답
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.PUBKEY);
const results = [];

for (const table of ["app_tables", "app_queues", "audit_log"]) {
  const { data, error } = await sb.from(table).select("*").limit(1);
  const denied = !!error || (data ?? []).length === 0;
  results.push({ name: `select ${table} (publishable)`, pass: denied, note: error?.message ?? `rows=${data?.length ?? 0}` });
}

// 쓰기도 막혀야 한다
const { error: werr } = await sb.from("app_tables").insert({ name: "rls-probe", doc: {} });
results.push({ name: "insert app_tables (publishable)", pass: !!werr, note: werr?.message ?? "!! insert succeeded" });

// private 버킷 열람도 막혀야 한다
const { data: ls, error: lerr } = await sb.storage.from("staging").list("pending");
results.push({
  name: "list staging bucket (publishable)",
  pass: !!lerr || (ls ?? []).length === 0,
  note: lerr?.message ?? `entries=${ls?.length ?? 0}`,
});

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  — ${r.note}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
