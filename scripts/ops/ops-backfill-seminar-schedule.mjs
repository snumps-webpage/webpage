// 세미나 일정 백필: seminars.activityId(null) ← 활동 테이블의 "제목 N회차" 매칭.
// 순수 DB 갱신 — 앱 서비스/메일 디스패처를 일절 호출하지 않는다 (발송 0 보장).
// usage: node ops-backfill-seminar-schedule.mjs [apply]
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const APPLY = process.argv[2] === "apply";

async function doc(name) {
  const { data, error } = await sb
    .from("app_tables")
    .select("version, doc")
    .eq("name", name)
    .single();
  if (error) throw error;
  return data;
}

const [seminars, activities] = await Promise.all([doc("seminars"), doc("activities")]);
const seminarActs = activities.doc.rows.filter((a) => a.type === "세미나");

const report = [];
let matched = 0;
const rows = seminars.doc.rows.map((s) => {
  if (s.activityId) return s; // 기존 연결은 절대 덮지 않는다
  // 후보: "제목" 또는 "제목 N회차" — 여러 회차면 가장 이른 날짜(1회차)를 앵커로
  const cands = seminarActs.filter(
    (a) => a.title === s.title || a.title.startsWith(`${s.title} `),
  );
  if (cands.length === 0) {
    report.push({ seminar: s.title.slice(0, 30), match: "(없음)", date: "-" });
    return s;
  }
  cands.sort((x, y) => x.date.start.localeCompare(y.date.start));
  const pick = cands[0];
  matched += 1;
  report.push({
    seminar: s.title.slice(0, 30),
    match: pick.title.slice(0, 34),
    date: pick.date.start.slice(0, 10),
    sessions: cands.length,
  });
  return { ...s, activityId: pick.id };
});

console.table(report);
console.log(`세미나 ${seminars.doc.rows.length}건 중 매칭 ${matched}건, 미매칭 ${seminars.doc.rows.length - matched - seminars.doc.rows.filter((s) => s.activityId).length}건`);

if (!APPLY) {
  console.log("\n(미리보기 — 적용하려면 'apply' 인자)");
  process.exit(0);
}
const { data, error } = await sb
  .from("app_tables")
  .update({ doc: { ...seminars.doc, rows }, version: seminars.version + 1 })
  .eq("name", "seminars")
  .eq("version", seminars.version)
  .select("name");
if (error) throw error;
if (!data.length) throw new Error("CAS 실패 — 재실행");
console.log("적용 완료 (메일 발송 경로 미사용)");
