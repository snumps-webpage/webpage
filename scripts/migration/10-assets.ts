// run: npx tsx scripts/migration/10-assets.ts [--dump <dir>]
//
// M-4: Notion 파일 자산 이주.
// 덤프 JSON에서 file/image 속성을 열거하고(파일 속성: 세미나 `강의 자료`/`활동 사진`,
// 스터디 활동 사진, 회식(활동) 사진 — docs/schema.md·src/lib/constants.ts NOTION_PROPS 기준),
// 각 파일을 내려받아 정규화·sha256 멱등 처리 후:
//
//   1) `assets` 버킷에 §4-3 형태의 키로 업로드
//        seminars/<recordId>/materials/…  seminars/<recordId>/photos/…
//        studies/<recordId>/photos/…      gallery/dinner/…
//   2) `backups` 버킷 `assets-mirror/<key>`에 사본 1부 동시 기록 (B3)
//   3) out/assets-manifest.json 갱신 — { notionUrlHash → { key, sha256, bytes, contentType } }
//
// 멱등: manifest 항목이 있고 sha256이 일치하면 업로드를 건너뛴다. 같은 내용(sha 동일)의
// 파일은 기존 키를 재사용한다(dedupe). URL 해시는 서명 query를 벗긴 URL 기준 —
// Notion 서명 URL은 만료·회전되므로 다운로드 URL은 덤프가 아니라 **신규 API 조회**로 받는다.
//
// (참고) 구 설계의 "토글 재귀" 경고는 페이지 블록 트리를 순회할 때의 함정인데,
// 여기 자산은 전부 DB의 file **속성**에 있어 블록 순회가 없다 — 해당 없음(N/A).
//
// ⚠️ PII 주의: manifest·자산에도 인물 사진 등 개인정보가 포함될 수 있다. out/ 커밋 금지.

import {
  type DumpFile,
  type Manifest,
  type NotionFileRef,
  type NotionPage,
  assetsBucket,
  backupsBucket,
  filesOf,
  idFor,
  loadDotenv,
  loadIdMap,
  loadManifest,
  notion,
  notionUrlHash,
  propValue,
  readDump,
  requireNotionEnv,
  requireSupabaseEnv,
  resolveDumpDir,
  saveIdMap,
  saveManifest,
  sha256,
  slugify,
  supabase,
  uploadToBucket,
} from "./lib";

/* eslint-disable @typescript-eslint/no-explicit-any */

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
};

function extFor(contentType: string, originalName: string): string {
  const mapped =
    EXT_BY_CONTENT_TYPE[contentType.split(";")[0].trim().toLowerCase()];
  if (mapped) return mapped;
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(originalName);
  return m ? m[1].toLowerCase() : "bin";
}

/** §4-3 형태의 키 prefix. recordId는 id-map의 신규 앱 id (20-export와 공유). */
function keyPrefix(
  dbKey: string,
  propName: string,
  page: NotionPage,
  rid: string,
): string {
  if (dbKey === "seminars") {
    return propName === "강의 자료"
      ? `seminars/${rid}/materials`
      : `seminars/${rid}/photos`;
  }
  if (dbKey === "studies") return `studies/${rid}/photos`;
  if (
    dbKey === "activities" &&
    propValue(page.properties["활동 종류"]) === "회식"
  ) {
    return "gallery/dinner";
  }
  return `misc/${dbKey}/${rid}`;
}

/**
 * 페이지 속성의 파일 목록을 **신규 조회**로 받아온다 (덤프 속 서명 URL은 만료됨).
 * pages.properties.retrieve는 유형에 따라 단일 property_item 또는 list를 돌려준다.
 */
async function fetchFreshFiles(
  client: ReturnType<typeof notion>,
  pageId: string,
  propertyId: string,
): Promise<NotionFileRef[]> {
  const res: any = await (client as any).pages.properties.retrieve({
    page_id: pageId,
    property_id: propertyId,
  });
  if (res.object === "list") {
    return (res.results ?? []).flatMap((item: any) => filesOf(item));
  }
  return filesOf(res);
}

async function main() {
  loadDotenv();
  requireSupabaseEnv();
  requireNotionEnv();

  const dumpDir = resolveDumpDir();
  const notionClient = notion();
  const supa = supabase();
  const manifest: Manifest = loadManifest();
  const idMap = loadIdMap();

  // sha256 → 기존 키 (내용 동일 파일 dedupe)
  const keyBySha = new Map<string, string>();
  for (const entry of Object.values(manifest))
    keyBySha.set(entry.sha256, entry.key);

  // 덤프에서 files 속성 보유 페이지 열거 (구조·페이지 id는 덤프에서, URL은 신규 조회에서)
  const targets: {
    db: string;
    page: NotionPage;
    propName: string;
    propId: string;
    fileCount: number;
  }[] = [];
  const dumpFiles = new Map<string, DumpFile>();
  for (const dbKey of [
    "seminars",
    "studies",
    "activities",
    "seminar-requests",
    "settings",
    "members",
    "private-info",
    "events",
    "applications",
    "attendance-queue",
  ]) {
    const dump = readDump(dumpDir, dbKey);
    if (!dump) continue;
    dumpFiles.set(dbKey, dump);
    for (const page of dump.pages) {
      for (const [propName, prop] of Object.entries<any>(page.properties)) {
        if (prop?.type === "files" && (prop.files?.length ?? 0) > 0) {
          targets.push({
            db: dbKey,
            page,
            propName,
            propId: prop.id,
            fileCount: prop.files.length,
          });
        }
      }
    }
  }

  console.log(`파일 속성 ${targets.length}건 발견 (덤프: ${dumpDir})`);

  let uploaded = 0;
  let skipped = 0;
  let deduped = 0;
  const failures: string[] = [];

  for (const t of targets) {
    const rid = idFor(idMap, t.page.id);
    const prefix = keyPrefix(t.db, t.propName, t.page, rid);

    let fresh: NotionFileRef[];
    try {
      fresh = await fetchFreshFiles(notionClient, t.page.id, t.propId);
    } catch (err) {
      failures.push(
        `${t.db}/${t.page.id} ${t.propName}: 신규 조회 실패 — ${err instanceof Error ? err.message : err}`,
      );
      continue;
    }

    for (const file of fresh) {
      const urlHash = notionUrlHash(file.url);
      const existing = manifest[urlHash];

      let body: Buffer;
      let contentType: string;
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = Buffer.from(await res.arrayBuffer());
        contentType =
          res.headers.get("content-type")?.split(";")[0].trim() ||
          "application/octet-stream";
      } catch (err) {
        failures.push(
          `${t.db}/${t.page.id} ${t.propName} "${file.name}": 다운로드 실패 — ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }

      const digest = sha256(body);

      // 멱등: manifest 항목이 있고 sha가 일치하면 재업로드하지 않는다.
      if (existing && existing.sha256 === digest) {
        skipped++;
        continue;
      }

      // 내용 dedupe: 동일 sha의 파일이 이미 올라가 있으면 그 키를 재사용한다.
      const dedupKey = keyBySha.get(digest);
      let key: string;
      if (dedupKey) {
        key = dedupKey;
        deduped++;
      } else {
        const ext = extFor(contentType, file.name);
        key = `${prefix}/${slugify(file.name)}-${digest.slice(0, 8)}.${ext}`;
        await uploadToBucket(supa, assetsBucket(), key, body, contentType);
        // B3: 승격 자산과 동일하게 backups에 사본 1부 동시 기록 (오삭제 복구 계층)
        await uploadToBucket(
          supa,
          backupsBucket(),
          `assets-mirror/${key}`,
          body,
          contentType,
        );
        keyBySha.set(digest, key);
        uploaded++;
      }

      manifest[urlHash] = {
        key,
        sha256: digest,
        bytes: body.length,
        contentType,
        name: file.name,
        sourceDb: t.db,
        sourcePageId: t.page.id,
        sourceProp: t.propName,
      };
      saveManifest(manifest); // 파일마다 저장 — 중단돼도 진행분은 멱등하게 남는다
    }
  }

  saveIdMap(idMap);
  saveManifest(manifest);

  const entries = Object.values(manifest);
  const distinctKeys = new Set(entries.map((e) => e.key));
  const totalBytes = [...distinctKeys].reduce((sum, key) => {
    const e = entries.find((x) => x.key === key);
    return sum + (e?.bytes ?? 0);
  }, 0);

  console.log("\n자산 이주 결과");
  console.table([
    { 항목: "신규 업로드", 값: uploaded },
    { 항목: "멱등 스킵 (sha 일치)", 값: skipped },
    { 항목: "내용 중복 재사용", 값: deduped },
    { 항목: "manifest 항목 수", 값: entries.length },
    { 항목: "고유 자산 수", 값: distinctKeys.size },
    { 항목: "총 용량 (MB)", 값: (totalBytes / 1024 / 1024).toFixed(1) },
  ]);
  console.log(
    "→ 위 실측치를 스펙 §4-4 산수(1GB 잔여율)에 기록할 것 (M-4). 80% 도달 시 PDF 상한 하향.",
  );

  if (failures.length) {
    console.error(`\n실패 ${failures.length}건:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("자산 이주 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
