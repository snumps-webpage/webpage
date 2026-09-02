// audit_log append-only 트리거 실측 — dev에서 실행 (테스트 행이 영구 잔존하므로 prod 금지)
// insert 1행 → UPDATE 시도(거부 기대) → DELETE 시도(거부 기대)
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const results = [];
const ok = (name, pass, note = "") => results.push({ name, pass, note });

const { data: ins, error: e1 } = await sb
  .from("audit_log")
  .insert({
    id: `ops-probe-${Math.random().toString(36).slice(2, 10)}`,
    actor: "ops-check",
    action: "ops-trigger-probe",
    target_tb: "none",
    target_id: "none",
    detail: { probe: true },
  })
  .select("id")
  .single();
ok("1 insert", !e1 && !!ins?.id, e1?.message ?? `id=${ins?.id}`);

if (ins?.id) {
  const { error: e2 } = await sb.from("audit_log").update({ action: "tampered" }).eq("id", ins.id);
  ok("2 UPDATE blocked", !!e2, e2?.message ?? "!! update succeeded — trigger missing");

  const { error: e3 } = await sb.from("audit_log").delete().eq("id", ins.id);
  ok("3 DELETE blocked", !!e3, e3?.message ?? "!! delete succeeded — trigger missing");
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  — ${r.note}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
