// run: npx tsx scripts/migration/30-verify.ts [--dump <dir>]
//
// M-5: 이주 검증 (행 수 · dangling 0 · 자산 대조) — 무변경 계약.
//
//   1) 행 수: 업로드된 app_tables의 각 테이블 rows 수를 덤프 기대치와 대조
//      (applications·study-requests는 §9에 따라 기대치 0,
//       gallery-dinner는 변환 산출물 out/tables와 대조)
//   2) dangling: attendeeIds/presenterIds/organizerIds/memberId 등 관계 ⊆ members ids,
//      events.activityId ⊆ activities ids
//   3) 자산: 테이블이 참조하는 s3Key ⊆ manifest 키, manifest의 고유 키가 assets 버킷에 실재
//
// 전부 통과하면 0, 하나라도 실패하면 pass/fail 표 출력 후 exit 1.

import {
  type Manifest,
  loadDotenv,
  loadManifest,
  readDump,
  readJson,
  requireSupabaseEnv,
  resolveDumpDir,
  supabase,
  OUT_DIR,
} from "./lib";
import { existsSync } from "node:fs";
import path from "node:path";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TABLE_NAMES = [
  "members",
  "private-info",
  "activities",
  "events",
  "applications",
  "seminar-requests",
  "study-requests",
  "studies",
  "seminars",
  "gallery-dinner",
] as const;

interface CheckRow {
  검사: string;
  기대: string | number;
  실제: string | number;
  결과: "PASS" | "FAIL";
}

async function main() {
  loadDotenv();
  requireSupabaseEnv();

  const dumpDir = resolveDumpDir();
  const manifest: Manifest = loadManifest();
  const supa = supabase();

  const results: CheckRow[] = [];
  function check(
    name: string,
    expected: string | number,
    actual: string | number,
  ) {
    results.push({
      검사: name,
      기대: expected,
      실제: actual,
      결과: expected === actual ? "PASS" : "FAIL",
    });
  }

  // -------------------------------------------------------------------------
  // app_tables 로드
  // -------------------------------------------------------------------------
  const { data, error } = await supa
    .from("app_tables")
    .select("name, version, doc")
    .in("name", [...TABLE_NAMES]);
  if (error) throw new Error(`app_tables 조회 실패: ${error.message}`);

  const docs = new Map<string, any>();
  for (const row of data ?? []) docs.set(row.name, row);
  const rowsOf = (name: string): any[] => docs.get(name)?.doc?.rows ?? [];

  check("app_tables 행 존재", TABLE_NAMES.length, docs.size);

  // -------------------------------------------------------------------------
  // 1) 행 수 — 덤프 기대치 대조
  // -------------------------------------------------------------------------
  const dumpCount = (db: string): number =>
    readDump(dumpDir, db)?.pageCount ?? 0;

  const expectations: Record<string, number> = {
    members: dumpCount("members"),
    "private-info": dumpCount("private-info"),
    activities: dumpCount("activities"),
    events: dumpCount("events"),
    applications: 0, // §9: 이주 대상 아님
    "seminar-requests": dumpCount("seminar-requests"),
    "study-requests": 0, // Notion 원본 없음
    studies: dumpCount("studies"),
    seminars: dumpCount("seminars"),
  };
  for (const [name, expected] of Object.entries(expectations)) {
    check(`행 수: ${name}`, expected, rowsOf(name).length);
  }
  // gallery-dinner는 회식 활동을 연도별로 묶은 파생 테이블 — 변환 산출물과 대조
  const galleryLocal = path.join(OUT_DIR, "tables", "gallery-dinner.json");
  if (existsSync(galleryLocal)) {
    const local = readJson<{ rows: any[] }>(galleryLocal);
    check(
      "행 수: gallery-dinner (out/tables 대조)",
      local.rows.length,
      rowsOf("gallery-dinner").length,
    );
  } else {
    check(
      "행 수: gallery-dinner (out/tables 존재)",
      "있음",
      "없음 — 20-export 먼저 실행",
    );
  }

  // 봉투·버전
  for (const name of TABLE_NAMES) {
    const row = docs.get(name);
    if (!row) continue;
    check(`봉투 schemaVersion: ${name}`, 1, row.doc?.schemaVersion ?? "없음");
  }

  // -------------------------------------------------------------------------
  // 2) dangling 관계 0
  // -------------------------------------------------------------------------
  const memberIds = new Set(rowsOf("members").map((m: any) => m.id));
  const activityIds = new Set(rowsOf("activities").map((a: any) => a.id));
  const studyIds = new Set(rowsOf("studies").map((s: any) => s.id));

  let dangling = 0;
  const danglingDetail: string[] = [];
  function refCheck(
    where: string,
    ids: (string | null)[],
    universe: Set<string>,
  ) {
    for (const ref of ids) {
      if (ref === null) continue;
      if (!universe.has(ref)) {
        dangling++;
        danglingDetail.push(`${where}: ${ref}`);
      }
    }
  }

  for (const p of rowsOf("private-info"))
    refCheck(`private-info/${p.id}.memberId`, [p.memberId], memberIds);
  for (const a of rowsOf("activities"))
    refCheck(`activities/${a.id}.attendeeIds`, a.attendeeIds ?? [], memberIds);
  for (const e of rowsOf("events")) {
    refCheck(`events/${e.id}.applicantIds`, e.applicantIds ?? [], memberIds);
    refCheck(`events/${e.id}.presenterIds`, e.presenterIds ?? [], memberIds);
    refCheck(`events/${e.id}.activityId`, [e.activityId], activityIds);
    refCheck(`events/${e.id}.studyId`, [e.studyId ?? null], studyIds);
  }
  for (const s of rowsOf("seminars"))
    refCheck(`seminars/${s.id}.presenterIds`, s.presenterIds ?? [], memberIds);
  for (const r of rowsOf("seminar-requests")) {
    refCheck(
      `seminar-requests/${r.id}.presenterIds`,
      r.presenterIds ?? [],
      memberIds,
    );
    refCheck(
      `seminar-requests/${r.id}.requesterId`,
      [r.requesterId],
      memberIds,
    );
  }
  for (const st of rowsOf("studies")) {
    refCheck(`studies/${st.id}.organizerIds`, st.organizerIds ?? [], memberIds);
    refCheck(
      `studies/${st.id}.participantIds`,
      st.participantIds ?? [],
      memberIds,
    );
  }
  check("dangling 관계", 0, dangling);
  if (danglingDetail.length) {
    console.error("dangling 상세:");
    for (const d of danglingDetail) console.error(`  - ${d}`);
  }

  // -------------------------------------------------------------------------
  // 3) 자산 — 참조 ⊆ manifest, manifest 고유 키가 버킷에 실재
  // -------------------------------------------------------------------------
  const manifestKeys = new Set(Object.values(manifest).map((e) => e.key));

  const referenced = new Set<string>();
  for (const s of rowsOf("seminars"))
    for (const k of [...(s.materials ?? []), ...(s.photos ?? [])])
      referenced.add(k);
  for (const st of rowsOf("studies"))
    for (const k of st.photos ?? []) referenced.add(k);
  for (const g of rowsOf("gallery-dinner"))
    for (const k of g.photos ?? []) referenced.add(k);

  const unresolved = [...referenced].filter((k) => !manifestKeys.has(k));
  check("테이블 참조 자산 ⊆ manifest", 0, unresolved.length);
  if (unresolved.length) {
    console.error("manifest에 없는 참조:");
    for (const k of unresolved) console.error(`  - ${k}`);
  }

  const assetsBucketName = process.env.SUPABASE_ASSETS_BUCKET || "assets";
  let missingInBucket = 0;
  for (const key of manifestKeys) {
    const { data: exists, error: exErr } = await (
      supa.storage.from(assetsBucketName) as any
    ).exists(key);
    if (exErr || !exists) {
      missingInBucket++;
      console.error(
        `  - 버킷에 없음: ${assetsBucketName}/${key}${exErr ? ` (${exErr.message})` : ""}`,
      );
    }
  }
  check(
    `manifest 자산 실재 (${assetsBucketName} 버킷, ${manifestKeys.size}개)`,
    0,
    missingInBucket,
  );

  // -------------------------------------------------------------------------
  // 결과
  // -------------------------------------------------------------------------
  console.table(results);
  const failed = results.filter((r) => r.결과 === "FAIL");
  if (failed.length) {
    console.error(`검증 실패 ${failed.length}건.`);
    process.exit(1);
  }
  console.log("검증 전부 통과.");
}

main().catch((err) => {
  console.error("검증 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
