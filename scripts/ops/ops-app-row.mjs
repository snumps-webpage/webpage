// 관리자 큐 UI 확인용 신청 행 추가/제거 (dev 전용)
// usage: node ops-app-row.mjs add|remove
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const mode = process.argv[2] ?? "add";
const EMAIL = "e2e-ui-probe@snu.ac.kr";

const { data } = await sb.from("app_tables").select("version, doc").eq("name", "applications").single();
const rows = data.doc.rows.filter((r) => r.email !== EMAIL);
if (mode === "add") {
  rows.push({
    id: "01E2EUIPROBE0000000000TEST",
    email: EMAIL,
    name: "큐확인용지원자",
    department: "수리과학부",
    phone: "010-0000-0000",
    background: "관리자 큐 렌더 확인",
    createdAt: new Date().toISOString().slice(0, 19) + "+09:00",
  });
}
const { error } = await sb
  .from("app_tables")
  .update({ doc: { ...data.doc, rows }, version: data.version + 1 })
  .eq("name", "applications")
  .eq("version", data.version);
if (error) throw error;
console.log(`${mode}: applications rows = ${rows.length}`);
