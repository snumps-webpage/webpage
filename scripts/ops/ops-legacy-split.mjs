// S9 데이터 이관: members/private-info(노션 이주분) → legacy-* 아카이브로 복사하고
// 운영 테이블을 비운다. registrations 빈 테이블 생성. 멱등: legacy-members가
// 이미 있으면 아무것도 하지 않는다.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function readDoc(name) {
  const { data, error } = await sb
    .from("app_tables")
    .select("version, doc")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createDoc(name, doc) {
  const { error } = await sb
    .from("app_tables")
    .insert({ name, version: 1, doc });
  if (error) throw error;
}

async function replaceDoc(name, prev, doc) {
  const { data, error } = await sb
    .from("app_tables")
    .update({ doc, version: prev.version + 1 })
    .eq("name", name)
    .eq("version", prev.version)
    .select("name");
  if (error) throw error;
  if (!data.length) throw new Error(`CAS 실패: ${name} — 동시 쓰기, 재실행하세요`);
}

const existing = await readDoc("legacy-members");
if (existing) {
  console.log("legacy-members 이미 존재 — 이관 완료 상태로 판단, 종료");
  process.exit(0);
}

const members = await readDoc("members");
const infos = await readDoc("private-info");
if (!members || !infos) throw new Error("members/private-info 원본 없음");

await createDoc("legacy-members", members.doc);
await createDoc("legacy-private-info", infos.doc);
console.log(
  `legacy 복사: members ${members.doc.rows.length}행, private-info ${infos.doc.rows.length}행`,
);

await replaceDoc("members", members, { schemaVersion: 1, rows: [] });
await replaceDoc("private-info", infos, { schemaVersion: 1, rows: [] });
console.log("운영 members/private-info 비움 (새 학기별 등록제 DB 시작)");

if (!(await readDoc("registrations"))) {
  await createDoc("registrations", { schemaVersion: 1, rows: [] });
  console.log("registrations 테이블 생성");
}
console.log("완료");
