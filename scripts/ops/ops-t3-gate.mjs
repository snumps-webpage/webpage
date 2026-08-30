// T3 실측 게이트 — dev 프로젝트에서 스펙 §4의 스토리지 가정을 실측 검증한다.
// 검증 항목:
//  1) createSignedUploadUrl 발급 가능
//  2) 서명 URL 업로드 시 Content-Type이 서명에 안 묶임 (임의 타입 업로드 허용 여부)
//  3) info()가 contentType/size/createdAt 제공 → 승급 검사 유일 강제선 성립
//  4) move()의 destinationBucket 교차 버킷 이동 동작
//  5) 같은 경로 재업로드(upsert 아님) 거부 여부
// 출력에 비밀값 없음 — URL 토큰은 출력하지 않는다.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const STAGING = "staging";
const ASSETS = "assets";
const path = "pending/t3-gate/probe.png";
const assetPath = "t3-gate/probe.png";
const results = [];
const ok = (name, pass, note = "") => {
  results.push({ name, pass, note });
};

// 정리 (이전 실행 잔재)
await sb.storage.from(STAGING).remove([path]);
await sb.storage.from(ASSETS).remove([assetPath]);

// 1) signed upload URL
const { data: signed, error: e1 } = await sb.storage.from(STAGING).createSignedUploadUrl(path);
ok("1 createSignedUploadUrl", !e1, e1?.message ?? "issued");
if (e1) finish();

// 2) 서명 URL로 임의 Content-Type 업로드 (PNG 경로에 text/plain)
const bytes = new TextEncoder().encode("not really a png");
const up = await fetch(signed.signedUrl, {
  method: "PUT",
  headers: { "content-type": "text/plain", "x-upsert": "false" },
  body: bytes,
});
ok("2 upload with mismatched Content-Type", up.ok, `HTTP ${up.status} — ${up.ok ? "타입 미서명 확인(스펙 가정 성립)" : await up.text()}`);

// 3) info()
const { data: info, error: e3 } = await sb.storage.from(STAGING).info(path);
ok(
  "3 info() metadata",
  !e3 && !!info?.contentType && info?.size === bytes.length,
  e3?.message ?? `contentType=${info?.contentType} size=${info?.size} createdAt=${!!info?.createdAt}`,
);

// 4) cross-bucket move
const { error: e4 } = await sb.storage.from(STAGING).move(path, assetPath, { destinationBucket: ASSETS });
const { data: moved, error: e4b } = await sb.storage.from(ASSETS).info(assetPath);
ok("4 cross-bucket move", !e4 && !e4b && !!moved, e4?.message ?? e4b?.message ?? "moved to assets");

// 5) 같은 경로 signed URL 재발급 후 중복 업로드 → 거부 기대 (x-upsert 없이)
const { data: s2, error: e5a } = await sb.storage.from(STAGING).createSignedUploadUrl(path);
if (!e5a) {
  await fetch(s2.signedUrl, { method: "PUT", headers: { "content-type": "text/plain" }, body: bytes });
  const { data: s3, error: e5b } = await sb.storage.from(STAGING).createSignedUploadUrl(path);
  let dupStatus = "n/a";
  if (!e5b) {
    const dup = await fetch(s3.signedUrl, { method: "PUT", headers: { "content-type": "text/plain" }, body: bytes });
    dupStatus = `HTTP ${dup.status}`;
    ok("5 duplicate upload same path", dup.status === 409 || !dup.ok, `${dupStatus} (409 기대)`);
  } else {
    ok("5 duplicate upload same path", true, `재발급 자체 거부: ${e5b.message}`);
  }
} else {
  ok("5 duplicate upload same path", true, `move 후 재발급 거부: ${e5a.message}`);
}

// 정리
await sb.storage.from(STAGING).remove([path]);
await sb.storage.from(ASSETS).remove([assetPath]);

finish();

function finish() {
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  — ${r.note}`);
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
