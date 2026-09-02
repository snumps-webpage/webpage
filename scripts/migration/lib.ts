// scripts/migration/lib.ts — 이주 스크립트 공용 모듈 (SUPABASE-MIGRATION-SPEC.md T9 / §8 M-1~5)
//
// 이 디렉터리의 스크립트는 전부 로컬에서 `npx tsx`로 실행하는 독립 스크립트다.
// 의도적으로 src/를 import하지 않는다 ($lib alias는 vite 밖에서 깨짐 — scripts/seed-dev.ts와 동일 방침).
// 필요 env: SUPABASE_URL, SUPABASE_SECRET_KEY (+ Notion 접근 스크립트는 NOTION_API_KEY, NOTION_DB_*).
//
// ⚠️ 자격증명 취급 (M-1): prod `sb_secret` 키는 실행자에게 한정 전달하고, 이주 완료 후 회전한다.
// ⚠️ PII: out/ 산출물(덤프·manifest·tables)은 이메일·전화번호 등 PII를 포함한다 — .gitignore로
//    커밋이 차단되어 있으며, 이주 완료 후 로컬 사본은 안전한 보관처로 옮기거나 파기할 것.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as NotionClient } from "@notionhq/client";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 경로
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
/** 산출물 디렉터리 — .gitignore 대상 (PII 포함). */
export const OUT_DIR = path.join(SCRIPT_DIR, "out");
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  // 임시 파일 → rename: 중단돼도 반쯤 쓰인 JSON을 남기지 않는다.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

// ---------------------------------------------------------------------------
// env 로딩·가드
// ---------------------------------------------------------------------------

/**
 * 리포 루트의 .env를 있으면 읽는다 (단순 KEY=VALUE, 기존 process.env 우선).
 * dotenv 의존성을 추가하지 않기 위한 최소 구현 — 따옴표·주석 라인만 처리.
 */
export function loadDotenv(file = path.join(REPO_ROOT, ".env")): void {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/** Supabase env 가드 — 자격증명 없이 실행하면 크래시 대신 친절한 오류로 종료한다. */
export function requireSupabaseEnv(): { url: string; secretKey: string } {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error(
      "환경 변수가 없습니다: SUPABASE_URL 과 SUPABASE_SECRET_KEY 를 설정한 뒤 다시 실행하세요.\n" +
        "예) SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... npx tsx scripts/migration/00-dump.ts\n" +
        "(이주는 prod 프로젝트 키를 사용한다 — 실행자 한정 전달, 완료 후 회전. 스펙 §8 M-1)",
    );
    process.exit(1);
  }
  return { url, secretKey };
}

export function requireNotionEnv(): string {
  const key = process.env.NOTION_API_KEY;
  if (!key) {
    console.error(
      "환경 변수가 없습니다: NOTION_API_KEY 를 설정한 뒤 다시 실행하세요.\n" +
        "(Notion integration 토큰 — 이주 대상 DB 전부에 integration이 공유돼 있어야 한다)",
    );
    process.exit(1);
  }
  return key;
}

// ---------------------------------------------------------------------------
// 클라이언트 팩토리
// ---------------------------------------------------------------------------

export function supabase(): SupabaseClient {
  const { url, secretKey } = requireSupabaseEnv();
  return createClient(url, secretKey, { auth: { persistSession: false } });
}

export function notion(): NotionClient {
  return new NotionClient({ auth: requireNotionEnv() });
}

export function backupsBucket(): string {
  return process.env.SUPABASE_BACKUPS_BUCKET || "backups";
}

export function assetsBucket(): string {
  return process.env.SUPABASE_ASSETS_BUCKET || "assets";
}

// ---------------------------------------------------------------------------
// Notion DB 목록 — env 이름은 docs/SETUP.md·src/lib/server/notion/*와 일치
// ---------------------------------------------------------------------------

export interface NotionDbRef {
  /** 덤프 파일명·리포트에 쓰는 짧은 이름 */
  key: string;
  env: string;
}

/**
 * env로 명명된 Notion DB 10종. env가 비어 있는 항목은 각 스크립트가 건너뛰고 보고한다.
 * (studies는 코드에서 아직 읽지 않지만 이주 원본으로 존재할 수 있어 후보에 포함 — API-SPEC §9)
 */
export const NOTION_DBS: readonly NotionDbRef[] = [
  { key: "members", env: "NOTION_DB_MEMBERS" },
  { key: "private-info", env: "NOTION_DB_PRIVATE_INFO" },
  { key: "activities", env: "NOTION_DB_ACTIVITIES" },
  { key: "events", env: "NOTION_DB_EVENTS" },
  { key: "attendance-queue", env: "NOTION_DB_ATTENDANCE_QUEUE" },
  { key: "applications", env: "NOTION_DB_APPLICATIONS" },
  { key: "seminars", env: "NOTION_DB_SEMINARS" },
  { key: "seminar-requests", env: "NOTION_DB_SEMINAR_REQUESTS" },
  { key: "settings", env: "NOTION_DB_SETTINGS" },
  { key: "studies", env: "NOTION_DB_STUDIES" },
] as const;

// ---------------------------------------------------------------------------
// Notion 질의 (SDK v5: database → data source 경유)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export type NotionPage = {
  id: string;
  created_time?: string;
  properties: Record<string, any>;
  [k: string]: unknown;
};

export interface DumpFile {
  db: string;
  envName: string;
  databaseId: string;
  dataSourceId: string;
  dumpedAt: string;
  pageCount: number;
  pages: NotionPage[];
}

/** database id → 첫 data source id (SDK v5는 databases.query가 없다). */
export async function resolveDataSourceId(
  client: NotionClient,
  databaseId: string,
): Promise<string> {
  const db: any = await client.databases.retrieve({ database_id: databaseId });
  const ds = db.data_sources?.[0];
  if (!ds) throw new Error(`데이터 소스가 없는 DB입니다: ${databaseId}`);
  return ds.id as string;
}

/** 전체 페이지네이션 질의 — 원본 페이지 객체를 그대로 반환한다. */
export async function queryAllPages(
  client: NotionClient,
  databaseId: string,
): Promise<{ dataSourceId: string; pages: NotionPage[] }> {
  const dataSourceId = await resolveDataSourceId(client, databaseId);
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res: any = await client.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const p of res.results ?? []) {
      if (p && p.object === "page" && "properties" in p)
        pages.push(p as NotionPage);
    }
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return { dataSourceId, pages };
}

/**
 * 비가시 문자 제거 (이주 위생, S7~ 실측): 노션 원본에 soft hyphen(U+00AD)이
 * 이름 앞에 붙어 온 사례 57건 — 화면에서 "-"로 보이고 검색·비교도 오염시킨다.
 * zero-width 계열(U+200B~200D)·BOM(U+FEFF)·word joiner(U+2060)도 함께 걷어낸다.
 * 덤프(00)는 원본 그대로 보존하고, 변환(20)의 문자열 추출에서만 적용한다.
 */
export function stripInvisibles(text: string): string {
  return text.replace(/[\u00ad\u200b-\u200d\ufeff\u2060]/g, "");
}

/** src/lib/server/notion/utils.ts getPropertyValue의 미러 (import 금지 방침). */
export function propValue(property: any): any {
  if (!property) return "";
  switch (property.type) {
    case "title":
      return stripInvisibles((property.title || []).map((t: any) => t.plain_text).join(""));
    case "rich_text":
      return stripInvisibles((property.rich_text || []).map((t: any) => t.plain_text).join(""));
    case "number":
      return property.number ?? 0;
    case "select":
      return stripInvisibles(property.select?.name ?? "");
    case "multi_select":
      return (property.multi_select || []).map((s: any) => stripInvisibles(s.name as string));
    case "date":
      return property.date ?? null; // { start, end } | null — 호출부가 해석
    case "checkbox":
      return property.checkbox ?? false;
    case "email":
      return property.email ?? "";
    case "phone_number":
      return property.phone_number ?? "";
    case "url":
      return property.url ?? "";
    case "status":
      return property.status?.name ?? "";
    case "relation":
      return (property.relation || []).map((r: any) => r.id as string);
    case "files":
      return filesOf(property);
    default:
      return "";
  }
}

export interface NotionFileRef {
  name: string;
  url: string;
  kind: "file" | "external";
}

export function filesOf(property: any): NotionFileRef[] {
  if (!property || property.type !== "files") return [];
  return (property.files || []).flatMap((f: any) => {
    const url = f.file?.url || f.external?.url || "";
    if (!url) return [];
    return [
      {
        name: (f.name as string) || "",
        url,
        kind: f.file?.url ? "file" : "external",
      } satisfies NotionFileRef,
    ];
  });
}

// ---------------------------------------------------------------------------
// 해시·id·slug·날짜
// ---------------------------------------------------------------------------

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Notion 서명 URL은 query가 매번 바뀐다 — query를 벗긴 URL로 안정적 해시를 만든다. */
export function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function notionUrlHash(url: string): string {
  return sha256(stripQuery(url));
}

/** 26자 ULID형 id — Crockford base32, 의존성 0 (scripts/seed-dev.ts와 동일 방식). */
const ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function id(): string {
  const bytes = randomBytes(26);
  let out = "";
  for (let i = 0; i < 26; i++) out += ID_ALPHABET[bytes[i] & 31];
  return out;
}

export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "") // 확장자는 content-type에서 다시 정한다
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "file";
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO 8601 instant with +09:00 offset — schemas/common.ts DateTime 형식. */
export function kstISO(d: Date): string {
  const shifted = new Date(d.getTime() + KST_OFFSET_MS);
  return shifted.toISOString().slice(0, 19) + "+09:00";
}

/**
 * Notion 날짜 문자열 → 스키마 DateTime.
 * 날짜만("YYYY-MM-DD")이면 KST 자정으로, 시각 포함이면 KST 오프셋 표기로 정규화한다.
 */
export function toDateTime(notionDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(notionDate))
    return `${notionDate}T00:00:00+09:00`;
  const parsed = new Date(notionDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`해석할 수 없는 날짜 값: ${JSON.stringify(notionDate)}`);
  }
  return kstISO(parsed);
}

/** Date-only "YYYY-MM-DD" (KST 기준). */
export function toDateOnly(notionDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(notionDate)) return notionDate;
  const parsed = new Date(notionDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`해석할 수 없는 날짜 값: ${JSON.stringify(notionDate)}`);
  }
  return new Date(parsed.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 3~8월 = "YY-1", 9~2월 = "YY-2" (1·2월은 전년도) — core/semester.ts 규칙 미러. */
export function currentTerm(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  if (month >= 3 && month <= 8)
    return `${String(year % 100).padStart(2, "0")}-1`;
  const termYear = month >= 9 ? year : year - 1;
  return `${String(termYear % 100).padStart(2, "0")}-2`;
}

// ---------------------------------------------------------------------------
// 덤프 디렉터리·manifest·id-map
// ---------------------------------------------------------------------------

export function dumpDirName(timestamp: string): string {
  return path.join(OUT_DIR, `dump-${timestamp}`);
}

/** out/dump-* 중 가장 최근 디렉터리. 없으면 null. */
export function latestDumpDir(): string | null {
  if (!existsSync(OUT_DIR)) return null;
  const dirs = readdirSync(OUT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("dump-"))
    .map((e) => e.name)
    .sort();
  return dirs.length ? path.join(OUT_DIR, dirs[dirs.length - 1]) : null;
}

/** --dump <dir> 지정이 없으면 최신 덤프를 쓴다. 없으면 종료. */
export function resolveDumpDir(): string {
  const explicit = optValue("--dump");
  const dir = explicit ? path.resolve(explicit) : latestDumpDir();
  if (!dir || !existsSync(dir)) {
    console.error(
      "덤프 디렉터리를 찾을 수 없습니다. 먼저 00-dump.ts를 실행하거나 --dump <dir>로 지정하세요.",
    );
    process.exit(1);
  }
  return dir;
}

export function readDump(dumpDir: string, dbKey: string): DumpFile | null {
  const file = path.join(dumpDir, `${dbKey}.json`);
  return existsSync(file) ? readJson<DumpFile>(file) : null;
}

export interface ManifestEntry {
  key: string;
  sha256: string;
  bytes: number;
  contentType: string;
  /** 진단용 출처 (계약 4필드 외 부가 정보) */
  name?: string;
  sourceDb?: string;
  sourcePageId?: string;
  sourceProp?: string;
}

/** notionUrlHash(질의 파라미터 제거 후 sha256) → 자산 정보 */
export type Manifest = Record<string, ManifestEntry>;

export const MANIFEST_FILE = path.join(OUT_DIR, "assets-manifest.json");

export function loadManifest(): Manifest {
  return existsSync(MANIFEST_FILE) ? readJson<Manifest>(MANIFEST_FILE) : {};
}

export function saveManifest(manifest: Manifest): void {
  writeJson(MANIFEST_FILE, manifest);
}

export const ID_MAP_FILE = path.join(OUT_DIR, "id-map.json");

/** notion page id → 신규 앱 id. 생성·재사용 (재실행 시 id가 흔들리지 않게). */
export function loadIdMap(): Record<string, string> {
  return existsSync(ID_MAP_FILE)
    ? readJson<Record<string, string>>(ID_MAP_FILE)
    : {};
}

export function saveIdMap(map: Record<string, string>): void {
  writeJson(ID_MAP_FILE, map);
}

export function idFor(map: Record<string, string>, notionId: string): string {
  if (!map[notionId]) map[notionId] = id();
  return map[notionId];
}

// ---------------------------------------------------------------------------
// 스토리지 업로드
// ---------------------------------------------------------------------------

export async function uploadToBucket(
  client: SupabaseClient,
  bucket: string,
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<void> {
  const data = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  const { error } = await client.storage
    .from(bucket)
    .upload(key, data, { contentType, upsert: true });
  if (error) {
    throw new Error(
      `스토리지 업로드 실패 (${bucket}/${key}): ${error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// CLI 인자
// ---------------------------------------------------------------------------

export function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

export function optValue(name: string): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
