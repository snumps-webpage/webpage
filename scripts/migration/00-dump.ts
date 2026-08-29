// run: npx tsx scripts/migration/00-dump.ts
//
// M-2: 전 Notion DB 원본 덤프.
// env로 명명된 DB(NOTION_DB_* — lib.ts NOTION_DBS 10종) 중 존재하는 것 전부를
// 페이지네이션으로 완전 조회해 원본 JSON 그대로 저장한다.
//
//   로컬:   scripts/migration/out/dump-<timestamp>/<db>.json
//   원격:   backups 버킷 `notion-dump/<timestamp>/<db>.json` (private — M-2 목적지)
//
// ⚠️ PII 주의: 덤프에는 이메일·전화번호·배경 지식 등 개인정보가 그대로 들어 있다.
//    로컬 사본은 .gitignore(scripts/migration/out/)로 커밋이 차단되며, backups 버킷은
//    private이어야 한다. 이주 완료 후 로컬 사본은 파기하거나 안전한 보관처로 옮길 것.

import {
  NOTION_DBS,
  type DumpFile,
  backupsBucket,
  dumpDirName,
  loadDotenv,
  notion,
  queryAllPages,
  requireNotionEnv,
  requireSupabaseEnv,
  supabase,
  uploadToBucket,
  writeJson,
} from "./lib";
import path from "node:path";

async function main() {
  loadDotenv();
  requireSupabaseEnv();
  requireNotionEnv();

  const notionClient = notion();
  const supa = supabase();
  const bucket = backupsBucket();

  // 파일명·스토리지 키에 안전한 timestamp (예: 20260830T031500Z)
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "Z");
  const dumpDir = dumpDirName(timestamp);

  const rows: { db: string; env: string; pages: number | string }[] = [];

  for (const ref of NOTION_DBS) {
    const databaseId = process.env[ref.env];
    if (!databaseId) {
      rows.push({ db: ref.key, env: ref.env, pages: "건너뜀 (env 없음)" });
      continue;
    }

    console.log(`덤프 중: ${ref.key} (${ref.env})...`);
    const { dataSourceId, pages } = await queryAllPages(
      notionClient,
      databaseId,
    );

    const dump: DumpFile = {
      db: ref.key,
      envName: ref.env,
      databaseId,
      dataSourceId,
      dumpedAt: new Date().toISOString(),
      pageCount: pages.length,
      pages,
    };

    const file = path.join(dumpDir, `${ref.key}.json`);
    writeJson(file, dump);

    const remoteKey = `notion-dump/${timestamp}/${ref.key}.json`;
    await uploadToBucket(
      supa,
      bucket,
      remoteKey,
      JSON.stringify(dump),
      "application/json",
    );

    rows.push({ db: ref.key, env: ref.env, pages: pages.length });
  }

  console.log(`\n덤프 완료 → ${dumpDir}`);
  console.log(`백업 버킷 사본 → ${bucket}/notion-dump/${timestamp}/`);
  console.table(rows);
  console.log(
    "⚠️ 덤프에는 PII가 포함된다 — out/ 은 커밋 금지, 완료 후 로컬 사본 파기.",
  );
}

main().catch((err) => {
  console.error("덤프 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
