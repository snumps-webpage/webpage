// 승인 전환 결과 검증: applications에서 제거 + members/private-info 생성 확인 + 정리
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const SRC = "01E2EUIPROBE0000000000TEST";

async function doc(name) {
  const { data } = await sb.from("app_tables").select("version, doc").eq("name", name).single();
  return data;
}

const apps = await doc("applications");
console.log("application row remains:", apps.doc.rows.some((r) => r.id === SRC));

const members = await doc("members");
const m = members.doc.rows.find((r) => r.sourceRequestId === SRC);
console.log("member created:", !!m, m ? `status=${m.status} name=${m.name}` : "");

const infos = await doc("private-info");
const i = infos.doc.rows.find((r) => r.sourceRequestId === SRC);
console.log("private-info created:", !!i, i ? `phone=${i.phone} memberId-match=${i.memberId === m?.id}` : "");

// 정리 — 프로브 회원/개인정보 제거 (테스트 잔재를 dev에 남기지 않는다)
if (process.argv[2] === "cleanup") {
  if (m) {
    const rows = members.doc.rows.filter((r) => r.sourceRequestId !== SRC);
    await sb.from("app_tables").update({ doc: { ...members.doc, rows }, version: members.version + 1 })
      .eq("name", "members").eq("version", members.version);
  }
  if (i) {
    const infos2 = await doc("private-info");
    const rows = infos2.doc.rows.filter((r) => r.sourceRequestId !== SRC);
    await sb.from("app_tables").update({ doc: { ...infos2.doc, rows }, version: infos2.version + 1 })
      .eq("name", "private-info").eq("version", infos2.version);
  }
  console.log("cleanup done");
}
