// run: npx tsx scripts/migration/20-export-tables.ts [--dump <dir>] [--force]
//
// M-3: Notion 덤프 → 앱 테이블 10종 변환·업로드 (API-SPEC §9 이주 변환 규칙 전부).
//
//   - members.status 전원 "associate" (정회원·동문 간주 금지 — 재분류는 이주 후 별도 작업)
//   - isAlumni/alumniRevoked 전원 false
//   - roles: `임원` multi_select "25-2 회장" → {term,title}, 정규식 ^(\d{2}-[12])\s+(.+)$
//     — 매칭 실패 항목은 전부 리포트 후 **중단** (조용한 드롭 금지)
//   - isAdmin: private-info 이메일을 env ADMINS_EMAILS(콤마 구분)와 대조
//   - publicContact: 전원 null (기존 공개 연락처는 동의 재확인 후 수동 이전)
//   - project: `개인 프로젝트` checkbox → { title: "" } | null
//   - private-info.mailPrefs = { announcements: true }
//   - activities.type / events.type: "Seminar" → "세미나" 통일 (닫힌 집합 밖 값은 중단)
//   - events.applicantIds/presenterIds = [] (백필 보류), studies.participantIds = []
//   - applications: **이주 대상 아님** — 빈 rows로 기록 (§9)
//   - file 속성 → out/assets-manifest.json 의 key (10-assets.ts 선행 필수)
//   - id-map.json 생성·재사용 (notionId → 신규 id, 재실행에도 id 고정)
//   - 전 테이블 { schemaVersion: 1, rows } 봉투, app_tables version=1 초기화
//
// 보호: version > 1 인 app_tables 행은 --force 없이 덮어쓰지 않는다 (운영 데이터 보호).
//
// ⚠️ 검증 주의: 아래 구조 검사는 API-SPEC §2를 손으로 옮긴 근사치다. 권위 있는 게이트는
//    앱의 Zod 스키마(src/lib/server/data/schemas/*) — 업로드 전후로 사본에 대해
//    `pnpm exec vitest run src/lib/server/data` 를 실행해 쓰기 게이트 통과를 확인할 것.

import {
  type DumpFile,
  currentTerm,
  filesOf,
  hasFlag,
  id,
  idFor,
  kstISO,
  loadDotenv,
  loadIdMap,
  loadManifest,
  notionUrlHash,
  propValue,
  readDump,
  requireSupabaseEnv,
  resolveDumpDir,
  saveIdMap,
  supabase,
  toDateOnly,
  toDateTime,
  writeJson,
  OUT_DIR,
} from "./lib";
import path from "node:path";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROLE_RE = /^(\d{2}-[12])\s+(.+)$/;
const ACTIVITY_TYPES = new Set(["세미나", "스터디", "회의", "회식", "기타"]);
const EVENT_STATUSES = new Set(["draft", "active", "expired", "cancelled"]);

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

const errors: string[] = [];
const warnings: string[] = [];

function fail(msg: string): void {
  errors.push(msg);
}
function warn(msg: string): void {
  warnings.push(msg);
}

/** Notion id 비교용 정규화 (rich_text로 저장된 id는 대시 유무가 흔들린다). */
function nid(raw: string): string {
  return raw.replace(/-/g, "").toLowerCase().trim();
}

function normalizeType(raw: string, where: string): string {
  const value = raw === "Seminar" ? "세미나" : raw; // §9: 'Seminar' → '세미나' 통일
  if (!ACTIVITY_TYPES.has(value)) {
    fail(
      `${where}: 활동 종류 "${raw}" 는 닫힌 집합(세미나|스터디|회의|회식|기타) 밖 — 원본 정리 후 재실행`,
    );
    return "기타";
  }
  return value;
}

async function main() {
  loadDotenv();
  requireSupabaseEnv();

  const dumpDir = resolveDumpDir();
  const manifest = loadManifest();
  const idMap = loadIdMap();
  const force = hasFlag("--force");
  const nowISO = kstISO(new Date());
  const term = currentTerm();

  const admins = (process.env.ADMINS_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (admins.length === 0) {
    warn(
      "ADMINS_EMAILS 가 비어 있음 — 전원 isAdmin=false 로 이주된다. 의도가 아니면 env를 설정하고 재실행할 것.",
    );
  }

  /** file 속성 → manifest key. manifest에 없으면 오류 (10-assets.ts 미완료). */
  function assetKeys(prop: any, where: string): string[] {
    const keys: string[] = [];
    for (const f of filesOf(prop)) {
      const entry = manifest[notionUrlHash(f.url)];
      if (!entry) {
        fail(
          `${where}: 파일 "${f.name}" 이 assets-manifest에 없음 — 10-assets.ts 먼저 실행`,
        );
        continue;
      }
      keys.push(entry.key);
    }
    return keys;
  }

  // -------------------------------------------------------------------------
  // 덤프 로드
  // -------------------------------------------------------------------------
  const dumps = new Map<string, DumpFile>();
  for (const key of [
    "members",
    "private-info",
    "activities",
    "events",
    "applications",
    "seminars",
    "seminar-requests",
    "studies",
  ]) {
    const d = readDump(dumpDir, key);
    if (d) dumps.set(key, d);
  }
  const membersDump = dumps.get("members");
  if (!membersDump) {
    console.error(
      `members 덤프가 없습니다 (${dumpDir}) — 00-dump.ts 먼저 실행하세요.`,
    );
    process.exit(1);
  }

  const memberIdByNid = new Map(
    membersDump.pages.map((p) => [nid(p.id), idFor(idMap, p.id)]),
  );

  /** 회원 relation 목록 → 신규 id 목록. dangling은 경고 후 제외 (목록은 리포트에 남긴다). */
  function mapMemberIds(notionIds: string[], where: string): string[] {
    const out: string[] = [];
    for (const raw of notionIds) {
      const mapped = memberIdByNid.get(nid(raw));
      if (!mapped) {
        warn(
          `${where}: 회원 relation ${raw} 이 members 덤프에 없음 (탈퇴·삭제 추정) — 제외`,
        );
        continue;
      }
      out.push(mapped);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // private-info 먼저 (isAdmin 대조에 이메일 필요)
  // -------------------------------------------------------------------------
  const emailByMemberNid = new Map<string, string>();
  const privateInfo: any[] = [];
  for (const page of dumps.get("private-info")?.pages ?? []) {
    const where = `private-info/${page.id}`;
    const relation: string[] = propValue(page.properties["회원 정보"]) || [];
    if (relation.length === 0) {
      fail(
        `${where}: 회원 정보 relation 없음 — 소유자를 알 수 없는 PII 행. 원본 정리 후 재실행`,
      );
      continue;
    }
    const memberNid = nid(relation[0]);
    const memberId = memberIdByNid.get(memberNid);
    if (!memberId) {
      fail(`${where}: 연결된 회원 ${relation[0]} 이 members 덤프에 없음`);
      continue;
    }
    const email = String(propValue(page.properties["이메일"]) || "");
    if (email) emailByMemberNid.set(memberNid, email.toLowerCase());
    privateInfo.push({
      id: idFor(idMap, page.id),
      memberId,
      email,
      phone: String(propValue(page.properties["전화번호"]) || ""),
      background: String(propValue(page.properties["배경 지식"]) || ""),
      mailPrefs: { announcements: true }, // §9
      sourceRequestId: null,
    });
  }

  // -------------------------------------------------------------------------
  // members
  // -------------------------------------------------------------------------
  const roleFailures: string[] = [];
  const members: any[] = [];
  for (const page of membersDump.pages) {
    const where = `members/${page.id}`;
    const roleTags: string[] = propValue(page.properties["임원"]) || [];
    const roles: { term: string; title: string }[] = [];
    for (const tag of roleTags) {
      const m = ROLE_RE.exec(tag.trim());
      if (!m) {
        roleFailures.push(
          `${where}: 임원 태그 "${tag}" 파싱 실패 (^(\\d{2}-[12])\\s+(.+)$ 불일치)`,
        );
        continue;
      }
      roles.push({ term: m[1], title: m[2] });
    }

    const joinRaw = propValue(page.properties["가입일"]);
    const email = emailByMemberNid.get(nid(page.id));
    const hasProject = propValue(page.properties["개인 프로젝트"]) === true;

    members.push({
      id: idFor(idMap, page.id),
      name: String(propValue(page.properties["이름"]) || ""),
      department: String(propValue(page.properties["학과"]) || ""),
      joinedAt: joinRaw?.start ? toDateOnly(joinRaw.start) : null,
      status: "associate", // §9: 전원 associate — 정회원·동문 간주 금지
      statusChangedAt: nowISO,
      withdrawal: null,
      isAlumni: false, // §9: 재분류 작업에서 부여
      alumniRevoked: false,
      roles,
      isAdmin: email !== undefined && admins.includes(email),
      publicContact: null, // §9: 동의 재확인 후 수동 이전
      project: hasProject ? { title: "" } : null, // §9: 내용은 추후 입력
      sourceRequestId: null,
    });
  }
  if (roleFailures.length) {
    console.error(
      `임원 태그 파싱 실패 ${roleFailures.length}건 — 원본 정리 후 재실행 (조용한 드롭 금지):`,
    );
    for (const f of roleFailures) console.error(`  - ${f}`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // activities
  // -------------------------------------------------------------------------
  const activitiesDump = dumps.get("activities");
  const activityIdByNid = new Map<string, string>();
  const activities: any[] = [];
  for (const page of activitiesDump?.pages ?? []) {
    const where = `activities/${page.id}`;
    const date = propValue(page.properties["일정"]);
    if (!date?.start) {
      fail(`${where}: 일정 없음 — DateRange.start 필수. 원본 정리 후 재실행`);
      continue;
    }
    const rid = idFor(idMap, page.id);
    activityIdByNid.set(nid(page.id), rid);
    activities.push({
      id: rid,
      title: String(propValue(page.properties["활동명"]) || ""),
      date: {
        start: toDateTime(date.start),
        end: date.end ? toDateTime(date.end) : null,
      },
      type: normalizeType(
        String(propValue(page.properties["활동 종류"]) || ""),
        where,
      ),
      attendeeIds: mapMemberIds(
        propValue(page.properties["출석"]) || [],
        where,
      ),
      sourceRequestId: null,
    });
  }

  // -------------------------------------------------------------------------
  // events — activityId는 NotionPageId(rich_text) → activities 매핑
  // -------------------------------------------------------------------------
  const events: any[] = [];
  for (const page of dumps.get("events")?.pages ?? []) {
    const where = `events/${page.id}`;
    const date = propValue(page.properties["Date"]);
    if (!date?.start) {
      fail(`${where}: Date 없음 — DateRange.start 필수`);
      continue;
    }
    const rawStatus = String(propValue(page.properties["Status"]) || "draft");
    let status = rawStatus;
    if (rawStatus === "pending") {
      status = "draft"; // 레거시 표기 정규화
      warn(`${where}: status "pending" → "draft" 로 정규화`);
    }
    if (!EVENT_STATUSES.has(status)) {
      fail(
        `${where}: status "${rawStatus}" 는 draft|active|expired|cancelled 밖`,
      );
      continue;
    }
    const linkedActivity = String(
      propValue(page.properties["NotionPageId"]) || "",
    );
    const activityId = linkedActivity
      ? activityIdByNid.get(nid(linkedActivity))
      : undefined;
    if (!activityId) {
      fail(
        `${where}: 연결 활동(NotionPageId="${linkedActivity}") 을 activities 덤프에서 찾지 못함 — activityId는 null 불허`,
      );
      continue;
    }
    events.push({
      id: idFor(idMap, page.id),
      title: String(propValue(page.properties["Title"]) || ""),
      date: {
        start: toDateTime(date.start),
        end: date.end ? toDateTime(date.end) : null,
      },
      type: normalizeType(
        String(propValue(page.properties["Type"]) || ""),
        where,
      ),
      status,
      pathId: String(propValue(page.properties["PathId"]) || ""),
      attendCode: String(propValue(page.properties["AttendCode"]) || ""),
      activityId,
      applicantIds: [], // §9: 백필 보류
      presenterIds: [], // §9: 백필 보류
      studyId: null,
      sessionNo: null,
      autoGenerated: false,
      sourceRequestId: null,
    });
  }

  // -------------------------------------------------------------------------
  // seminar-requests — requesterId는 첫 진행자로 대신 (Notion에 신청자 필드 없음)
  // -------------------------------------------------------------------------
  const seminarRequests: any[] = [];
  for (const page of dumps.get("seminar-requests")?.pages ?? []) {
    const where = `seminar-requests/${page.id}`;
    const presenterIds = mapMemberIds(
      propValue(page.properties["진행자"]) || [],
      where,
    );
    if (presenterIds.length === 0) {
      fail(
        `${where}: 진행자 없음 — requesterId를 정할 수 없음. 원본 정리 후 재실행`,
      );
      continue;
    }
    const attachment = page.properties["강의 자료"];
    seminarRequests.push({
      id: idFor(idMap, page.id),
      title: String(propValue(page.properties["제목"]) || ""),
      description: String(propValue(page.properties["설명"]) || ""),
      prerequisites: String(propValue(page.properties["선수 지식"]) || ""),
      duration: String(propValue(page.properties["예상 소요 시간"]) || ""),
      presenterIds,
      attachment:
        attachment?.type === "url" ? String(propValue(attachment) || "") : "",
      requesterId: presenterIds[0],
      status:
        propValue(page.properties["승인됨"]) === true ? "approved" : "pending",
      createdAt: page.created_time ? toDateTime(page.created_time) : nowISO,
    });
  }

  // -------------------------------------------------------------------------
  // seminars (아카이브)
  // -------------------------------------------------------------------------
  const seminars: any[] = [];
  for (const page of dumps.get("seminars")?.pages ?? []) {
    const where = `seminars/${page.id}`;
    const semester = String(propValue(page.properties["학기"]) || "");
    if (!/^\d{2}-(?:[12SW])$/.test(semester)) {
      fail(`${where}: 학기 "${semester}" 가 YY-1|YY-2|YY-S|YY-W 형식이 아님`);
      continue;
    }
    seminars.push({
      id: idFor(idMap, page.id),
      title: String(propValue(page.properties["제목"]) || ""),
      semester,
      note: String(propValue(page.properties["비고"]) || ""),
      presenterIds: mapMemberIds(
        propValue(page.properties["진행자"]) || [],
        where,
      ),
      externalPresenters: "",
      materials: assetKeys(page.properties["강의 자료"], `${where} 강의 자료`),
      photos: assetKeys(page.properties["활동 사진"], `${where} 활동 사진`),
      activityId: null,
      sourceRequestId: null,
    });
  }

  // -------------------------------------------------------------------------
  // studies — NOTION_DB_STUDIES 덤프가 있을 때만 (§9: 과거 학기 finished)
  // -------------------------------------------------------------------------
  const studies: any[] = [];
  for (const page of dumps.get("studies")?.pages ?? []) {
    const where = `studies/${page.id}`;
    const titleProp = Object.values<any>(page.properties).find(
      (p) => p?.type === "title",
    );
    const semester = String(propValue(page.properties["학기"]) || "");
    if (!/^\d{2}-(?:[12SW])$/.test(semester)) {
      fail(`${where}: 학기 "${semester}" 가 YY-1|YY-2|YY-S|YY-W 형식이 아님`);
      continue;
    }
    const organizerIds = mapMemberIds(
      propValue(page.properties["주최자"]) || [],
      where,
    );
    if (organizerIds.length === 0) {
      fail(
        `${where}: 주최자 없음 — organizerIds는 최소 1명. 원본 정리 후 재실행`,
      );
      continue;
    }
    const photos = Object.entries<any>(page.properties)
      .filter(([, p]) => p?.type === "files")
      .flatMap(([name, p]) => assetKeys(p, `${where} ${name}`));
    studies.push({
      id: idFor(idMap, page.id),
      title: String(propValue(titleProp) || ""),
      semester,
      textbook: String(propValue(page.properties["교재"]) || ""),
      description: String(propValue(page.properties["설명"]) || ""),
      note: String(propValue(page.properties["비고"]) || ""),
      organizerIds,
      participantIds: [], // §9
      pendingParticipantIds: [],
      pendingTransfer: null,
      schedule: [],
      transferHistory: [],
      photos,
      status: semester === term ? "ongoing" : "finished", // §9: 과거 학기 finished
      sourceRequestId: null,
    });
  }

  // -------------------------------------------------------------------------
  // gallery-dinner — 회식 활동의 사진을 연도별로 묶는다
  // -------------------------------------------------------------------------
  const byYear = new Map<
    string,
    { photos: string[]; activityRids: string[] }
  >();
  for (const page of activitiesDump?.pages ?? []) {
    if (propValue(page.properties["활동 종류"]) !== "회식") continue;
    const fileProps = Object.entries<any>(page.properties).filter(
      ([, p]) => p?.type === "files" && (p.files?.length ?? 0) > 0,
    );
    if (fileProps.length === 0) continue;
    const date = propValue(page.properties["일정"]);
    const year = date?.start
      ? String(toDateOnly(date.start)).slice(0, 4)
      : "미상";
    const photos = fileProps.flatMap(([name, p]) =>
      assetKeys(p, `activities(회식)/${page.id} ${name}`),
    );
    const bucket = byYear.get(year) ?? { photos: [], activityRids: [] };
    bucket.photos.push(...photos);
    bucket.activityRids.push(idFor(idMap, page.id));
    byYear.set(year, bucket);
  }
  const galleryDinner = [...byYear.entries()].map(([year, g]) => ({
    id: id(),
    year,
    photos: g.photos,
    // 해당 연도의 회식 활동이 정확히 1건일 때만 연결 — 여러 건이면 null (수동 보정 대상)
    activityId: g.activityRids.length === 1 ? g.activityRids[0] : null,
  }));

  // -------------------------------------------------------------------------
  // 테이블 확정 (§9: applications 미이주, study-requests는 Notion 원본 없음)
  // -------------------------------------------------------------------------
  const tables: Record<(typeof TABLE_NAMES)[number], any[]> = {
    members,
    "private-info": privateInfo,
    activities,
    events,
    applications: [], // §9: 이주 대상 아님 — 처리 완료 건은 잔존시키지 않는다
    "seminar-requests": seminarRequests,
    "study-requests": [],
    studies,
    seminars,
    "gallery-dinner": galleryDinner,
  };

  // -------------------------------------------------------------------------
  // 구조 검증 — API-SPEC §2를 손으로 옮긴 근사치 (권위는 앱 Zod 스키마)
  // -------------------------------------------------------------------------
  structuralValidate(tables, fail);
  console.warn(
    "⚠️ 위 구조 검사는 근사치다 — 권위 있는 Zod 게이트는 앱 스키마: " +
      "`pnpm exec vitest run src/lib/server/data` 를 사본에 대해 실행해 확인할 것.",
  );

  // -------------------------------------------------------------------------
  // 산출물 저장 + 오류 시 업로드 전 중단
  // -------------------------------------------------------------------------
  for (const [name, rows] of Object.entries(tables)) {
    writeJson(path.join(OUT_DIR, "tables", `${name}.json`), {
      schemaVersion: 1,
      rows,
    });
  }
  saveIdMap(idMap);

  if (warnings.length) {
    console.warn(`\n경고 ${warnings.length}건:`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }
  if (errors.length) {
    console.error(`\n오류 ${errors.length}건 — 업로드하지 않고 중단합니다:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // app_tables UPSERT — version=1 초기화, version>1 행은 --force 없이 보호
  // -------------------------------------------------------------------------
  const supa = supabase();
  const { data: existing, error: selErr } = await supa
    .from("app_tables")
    .select("name, version")
    .in("name", [...TABLE_NAMES]);
  if (selErr) throw new Error(`app_tables 조회 실패: ${selErr.message}`);

  const protectedRows = (existing ?? []).filter(
    (r: any) => Number(r.version) > 1,
  );
  if (protectedRows.length && !force) {
    console.error(
      "다음 테이블은 version > 1 (운영 중 쓰기 흔적) — 덮어쓰면 라이브 데이터가 유실됩니다:",
    );
    for (const r of protectedRows)
      console.error(`  - ${r.name} (version ${r.version})`);
    console.error("정말 재이주하려면 --force 로 다시 실행하세요.");
    process.exit(1);
  }

  const upserts = Object.entries(tables).map(([name, rows]) => ({
    name,
    version: 1, // M-3: version=1 초기화
    doc: { schemaVersion: 1, rows },
  }));
  const { error: upErr } = await supa.from("app_tables").upsert(upserts);
  if (upErr) throw new Error(`app_tables upsert 실패: ${upErr.message}`);

  console.log(`\n업로드 완료 (version=1 초기화${force ? ", --force" : ""})`);
  console.table(
    Object.entries(tables).map(([name, rows]) => ({
      table: name,
      rows: rows.length,
    })),
  );
  console.log(
    `관리자 매칭: ${members.filter((m) => m.isAdmin).length}명 (ADMINS_EMAILS 대조)`,
  );
  console.log(
    `산출물: ${path.join(OUT_DIR, "tables")}/*.json, ${path.join(OUT_DIR, "id-map.json")}`,
  );
}

// ---------------------------------------------------------------------------
// 구조 검증기 — 필드 존재 + 타입만 정직하게 (API-SPEC §2 하드코딩)
// ---------------------------------------------------------------------------

type Check = (v: any) => boolean;
const str: Check = (v) => typeof v === "string";
const nonEmpty: Check = (v) => typeof v === "string" && v.length > 0;
const strOrNull: Check = (v) => v === null || typeof v === "string";
const bool: Check = (v) => typeof v === "boolean";
const idArr: Check = (v) => Array.isArray(v) && v.every(nonEmpty);
const strArr: Check = (v) => Array.isArray(v) && v.every(str);
const dateTime: Check = (v) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v);
const dateOnlyOrNull: Check = (v) =>
  v === null || /^\d{4}-\d{2}-\d{2}$/.test(String(v));
const dateRange: Check = (v) =>
  !!v && dateTime(v.start) && (v.end === null || dateTime(v.end));
const term: Check = (v) => typeof v === "string" && /^\d{2}-[12]$/.test(v);
// 기록 학기: 방학 학기(YY-S/YY-W) 포함 — 임원 role term은 위의 정규 학기만.
const semesterCheck: Check = (v) => typeof v === "string" && /^\d{2}-(?:[12SW])$/.test(v);
const oneOf =
  (...values: string[]): Check =>
  (v) =>
    values.includes(v);
const nul: Check = (v) => v === null; // 이주 초기값이 null로 고정된 필드
const objOrNull =
  (inner: Record<string, Check>): Check =>
  (v) =>
    v === null || (!!v && Object.entries(inner).every(([k, c]) => c(v[k])));

const TABLE_CHECKS: Record<string, Record<string, Check>> = {
  members: {
    id: nonEmpty,
    name: nonEmpty,
    department: str,
    joinedAt: dateOnlyOrNull,
    status: oneOf("associate", "regular", "withdrawn"),
    statusChangedAt: dateTime,
    withdrawal: nul,
    isAlumni: bool,
    alumniRevoked: bool,
    roles: (v) =>
      Array.isArray(v) && v.every((r) => term(r?.term) && nonEmpty(r?.title)),
    isAdmin: bool,
    publicContact: strOrNull,
    project: objOrNull({ title: str }),
    sourceRequestId: strOrNull,
  },
  "private-info": {
    id: nonEmpty,
    memberId: nonEmpty,
    email: (v) => typeof v === "string" && (v === "" || /.+@.+\..+/.test(v)),
    phone: str,
    background: str,
    mailPrefs: (v) => !!v && bool(v.announcements),
    sourceRequestId: strOrNull,
  },
  activities: {
    id: nonEmpty,
    title: nonEmpty,
    date: dateRange,
    type: oneOf("세미나", "스터디", "회의", "회식", "기타"),
    attendeeIds: idArr,
    sourceRequestId: strOrNull,
  },
  events: {
    id: nonEmpty,
    title: nonEmpty,
    date: dateRange,
    type: oneOf("세미나", "스터디", "회의", "회식", "기타"),
    status: oneOf("draft", "active", "expired", "cancelled"),
    pathId: nonEmpty,
    attendCode: nonEmpty,
    activityId: nonEmpty,
    applicantIds: idArr,
    presenterIds: idArr,
    studyId: strOrNull,
    sessionNo: (v) => v === null || (Number.isInteger(v) && v > 0),
    autoGenerated: bool,
    sourceRequestId: strOrNull,
  },
  applications: {
    id: nonEmpty,
    name: nonEmpty,
    email: (v) => typeof v === "string" && /.+@.+\..+/.test(v),
    phone: str,
    department: str,
    background: str,
    createdAt: dateTime,
  },
  "seminar-requests": {
    id: nonEmpty,
    title: nonEmpty,
    description: str,
    prerequisites: str,
    duration: str,
    presenterIds: idArr,
    attachment: str,
    requesterId: nonEmpty,
    status: oneOf("pending", "approved", "rejected", "withdrawn"),
    createdAt: dateTime,
  },
  "study-requests": {
    id: nonEmpty,
    title: nonEmpty,
    textbook: str,
    description: str,
    semester: semesterCheck,
    requesterId: nonEmpty,
    status: oneOf("pending", "approved", "rejected", "withdrawn"),
    createdAt: dateTime,
  },
  studies: {
    id: nonEmpty,
    title: nonEmpty,
    semester: semesterCheck,
    textbook: str,
    description: str,
    note: str,
    organizerIds: (v) => idArr(v) && v.length >= 1,
    participantIds: idArr,
    pendingParticipantIds: idArr,
    pendingTransfer: nul,
    schedule: (v) => Array.isArray(v),
    transferHistory: (v) => Array.isArray(v),
    photos: strArr,
    status: oneOf("recruiting", "ongoing", "finished"),
    sourceRequestId: strOrNull,
  },
  seminars: {
    id: nonEmpty,
    title: nonEmpty,
    semester: semesterCheck,
    note: str,
    presenterIds: idArr,
    externalPresenters: str,
    materials: strArr,
    photos: strArr,
    activityId: strOrNull,
    sourceRequestId: strOrNull,
  },
  "gallery-dinner": {
    id: nonEmpty,
    year: nonEmpty,
    photos: strArr,
    activityId: strOrNull,
  },
};

function structuralValidate(
  tables: Record<string, any[]>,
  fail: (msg: string) => void,
): void {
  for (const [name, rows] of Object.entries(tables)) {
    const checks = TABLE_CHECKS[name];
    rows.forEach((row, i) => {
      for (const [field, check] of Object.entries(checks)) {
        if (!check(row[field])) {
          fail(
            `${name}[${i}] (id=${row.id ?? "?"}): 필드 ${field} 구조 검증 실패 — 값: ${JSON.stringify(row[field])}`,
          );
        }
      }
    });
  }
}

main().catch((err) => {
  console.error(
    "테이블 익스포트 실패:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
