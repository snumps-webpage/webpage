// 이름 앞 "-" 현상 분석 — prod legacy-members 이름 패턴 통계 (이름 자체는 마스킹)
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const { data } = await sb.from("app_tables").select("doc").eq("name", "legacy-members").single();
const rows = data.doc.rows;

const dash = rows.filter((r) => /^\s*-/.test(r.name));
console.log("total:", rows.length, "| dash-prefixed:", dash.length);
for (const r of dash.slice(0, 8)) {
  const masked = r.name.replace(/[가-힣A-Za-z]/g, (c, i) => (i > 3 ? "○" : c));
  console.log(`  name=${JSON.stringify(masked)} joinedAt=${r.joinedAt} status=${r.status} roles=${r.roles.length}`);
}
// 다른 특수문자 패턴도 훑기
const weird = rows.filter((r) => /^[^가-힣A-Za-z]/.test(r.name) && !/^\s*-/.test(r.name));
console.log("other non-letter prefixes:", weird.length);
const firstChars = {};
for (const r of weird) {
  const c = r.name[0];
  const code = c.codePointAt(0).toString(16).padStart(4, "0");
  firstChars[`U+${code} ${JSON.stringify(c)}`] = (firstChars[`U+${code} ${JSON.stringify(c)}`] ?? 0) + 1;
}
console.table(firstChars);
for (const r of weird.slice(0, 5)) {
  const masked = r.name.replace(/[가-힣A-Za-z]/g, (c, i) => (i > 3 ? "○" : c));
  console.log("  sample:", JSON.stringify(masked));
}
