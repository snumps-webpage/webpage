// S9 이후 재이주 교정: 이주 산출(위생 처리된 232건)이 운영 members/private-info에
// 착지했으므로 → legacy-*로 옮겨 담고 운영 테이블을 비운다. 고아 등록 행도 정리.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function doc(name) {
  const { data, error } = await sb
    .from("app_tables")
    .select("version, doc")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}
async function replaceDoc(name, prev, docBody) {
  const { data, error } = await sb
    .from("app_tables")
    .update({ doc: docBody, version: prev.version + 1 })
    .eq("name", name)
    .eq("version", prev.version)
    .select("name");
  if (error) throw error;
  if (!data.length) throw new Error(`CAS 실패: ${name}`);
}

const [members, infos, legacyM, legacyP, regs, apps] = await Promise.all([
  doc("members"),
  doc("private-info"),
  doc("legacy-members"),
  doc("legacy-private-info"),
  doc("registrations"),
  doc("applications"),
]);

console.log("현재 상태: live members", members.doc.rows.length, "| legacy", legacyM.doc.rows.length,
  "| registrations", regs?.doc.rows.length ?? 0, "| applications", apps?.doc.rows.length ?? 0);

const dashLive = members.doc.rows.filter((r) => /­/.test(r.name)).length;
const dashLegacy = legacyM.doc.rows.filter((r) => /­/.test(r.name)).length;
console.log("soft-hyphen: live", dashLive, "| legacy(교체 전)", dashLegacy);

if (members.doc.rows.length < 200) {
  console.log("live members가 이주 산출로 보이지 않음 — 중단");
  process.exit(1);
}

// 1) 위생 처리본을 legacy로
await replaceDoc("legacy-members", legacyM, members.doc);
await replaceDoc("legacy-private-info", legacyP, infos.doc);
console.log("legacy-* ← 위생 처리된 이주 산출로 교체");

// 2) 운영 테이블 비움 (S9 상태 복원)
await replaceDoc("members", members, { schemaVersion: 1, rows: [] });
await replaceDoc("private-info", infos, { schemaVersion: 1, rows: [] });
console.log("운영 members/private-info 비움");

// 3) 고아 등록 행 정리 (운영 회원이 사라졌으므로 등록도 무효)
if (regs && regs.doc.rows.length > 0) {
  await replaceDoc("registrations", regs, { schemaVersion: 1, rows: [] });
  console.log(`registrations ${regs.doc.rows.length}건 정리 (고아)`);
}

// 검증
const after = await doc("legacy-members");
console.log("검증: legacy soft-hyphen 잔존", after.doc.rows.filter((r) => /­/.test(r.name)).length,
  "| legacy rows", after.doc.rows.length);
