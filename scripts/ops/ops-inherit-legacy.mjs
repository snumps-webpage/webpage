// 소급 교정: legacyMemberId가 연결된 운영 회원의 joinedAt/roles/project를
// legacy 원본에서 상속한다 (승인 로직 수정 이전에 생성된 행 대상).
// - joinedAt: legacy 값으로 교체 (원 가입일 보존)
// - roles: legacy 이력 + 기존 신규 이력 합집합 (term+title 중복 제거)
// - project: 신규 행에 없을 때만 legacy 값
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

const [members, legacy] = await Promise.all([doc("members"), doc("legacy-members")]);
const legacyById = new Map(legacy.doc.rows.map((m) => [m.id, m]));

let changed = 0;
const report = [];
const rows = members.doc.rows.map((m) => {
  if (!m.legacyMemberId) return m;
  const src = legacyById.get(m.legacyMemberId);
  if (!src) return m;
  const roleKey = (r) => `${r.term}|${r.title}`;
  const mergedRoles = [
    ...src.roles,
    ...m.roles.filter((r) => !src.roles.some((s) => roleKey(s) === roleKey(r))),
  ];
  const next = {
    ...m,
    joinedAt: src.joinedAt ?? m.joinedAt,
    roles: mergedRoles,
    project: m.project ?? src.project ?? null,
  };
  if (JSON.stringify(next) !== JSON.stringify(m)) {
    changed += 1;
    report.push({
      member: m.name,
      joinedAt: `${m.joinedAt} → ${next.joinedAt}`,
      roles: `${m.roles.length} → ${next.roles.length}`,
    });
    return next;
  }
  return m;
});

console.log("live members:", members.doc.rows.length, "| legacy 연결:",
  members.doc.rows.filter((m) => m.legacyMemberId).length, "| 교정 대상:", changed);
if (report.length) console.table(report);

if (changed > 0) {
  const { data, error } = await sb
    .from("app_tables")
    .update({ doc: { ...members.doc, rows }, version: members.version + 1 })
    .eq("name", "members")
    .eq("version", members.version)
    .select("name");
  if (error) throw error;
  if (!data.length) throw new Error("CAS 실패 — 재실행하세요");
  console.log("교정 완료");
} else {
  console.log("교정할 행 없음");
}
