/**
 * 이주 감사 — **노션에 있는데 앱에 없는 것**을 찾는다 (감사 C-12 / 부록 D).
 *
 * 두 가지를 본다.
 *  1. 노션 각 DB의 속성별 **채움 수**와 **페이지 본문 유무**. 이주 스크립트는
 *     속성만 읽었으므로(`20-export-tables.ts`), 본문에 적힌 것은 전부 넘어오지
 *     않았다 — 세미나의 활동 링크가 그랬다.
 *  2. 앱 테이블(Supabase)의 행 수·주요 필드 채움 수. 자격증명이 없으면 이쪽은
 *     건너뛰고 노션 쪽만 보고한다.
 *
 * 출력은 **수치와 속성 이름**뿐이다. 셀 값(회원 이름·이메일 등)은 찍지 않는다.
 *
 *   node scripts/ops/ops-migration-audit.mjs
 *
 * 읽기 전용 — 노션에도 Supabase에도 아무것도 쓰지 않는다.
 */
import { loadDotenv } from "./lib-env.mjs";

loadDotenv();

// 노션 본문 스캔은 수백 페이지를 훑어 오래 걸린다. 앱 쪽 수치만 급할 때가 있다.
const SKIP_NOTION = process.argv.includes("--skip-notion");

const token = process.env.NOTION_API_KEY;
if (!token && !SKIP_NOTION) {
  console.error("NOTION_API_KEY 없음 (--skip-notion 으로 앱 쪽만 볼 수 있다)");
  process.exit(1);
}

const headers = {
  authorization: `Bearer ${token}`,
  "notion-version": "2022-06-28",
  "content-type": "application/json",
};

/** @param {string} url @param {RequestInit} [init] */
async function api(url, init) {
  const res = await fetch(url, { ...init, headers });
  if (!res.ok)
    throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** 속성 하나가 "채워져 있는가" — 타입마다 빈 값의 모양이 다르다. */
function filled(prop) {
  if (!prop) return false;
  switch (prop.type) {
    case "title":
    case "rich_text":
      return (prop[prop.type] ?? []).some((t) => (t.plain_text ?? "").trim());
    case "relation":
      return (prop.relation ?? []).length > 0;
    case "multi_select":
      return (prop.multi_select ?? []).length > 0;
    case "files":
      return (prop.files ?? []).length > 0;
    case "select":
      return !!prop.select;
    case "date":
      return !!prop.date?.start;
    case "checkbox":
      return prop.checkbox === true;
    case "email":
    case "phone_number":
    case "url":
      return !!prop[prop.type];
    case "number":
      return prop.number !== null && prop.number !== undefined;
    case "formula":
      return false; // 파생값 — 이주 대상이 아니다
    default:
      return false;
  }
}

/** 페이지 본문에 글이 있는가 (자식 한 단계까지). */
async function hasBody(pageId) {
  try {
    const res = await api(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=50`,
    );
    for (const block of res.results ?? []) {
      const rich = block[block.type]?.rich_text ?? [];
      if (rich.some((r) => (r.plain_text ?? "").trim())) return true;
      if (block.has_children && (await hasBody(block.id))) return true;
    }
  } catch {
    /* 접근 불가는 "모름"으로 둔다 */
  }
  return false;
}

/**
 * 이주 스크립트(`20-export-tables.ts`)가 **실제로 읽는** 속성.
 * 여기 없는 속성은 노션에 값이 있어도 앱으로 오지 않았다.
 */
const MAPPED = {
  seminars: ["제목", "학기", "비고", "진행자", "강의 자료", "활동 사진"],
  "seminar-requests": [
    "제목",
    "설명",
    "선수 지식",
    "예상 소요 시간",
    "진행자",
    "승인됨",
  ],
  activities: ["활동명", "일정", "활동 종류", "출석"],
  members: [
    "이름",
    "학과",
    "가입일",
    "임원",
    "개인 프로젝트",
    "개인 정보",
    "활동 기록",
  ],
  "private-info": ["이름", "이메일", "전화번호", "배경 지식", "회원 정보"],
  applications: ["이름", "학과", "이메일", "전화 번호", "배경 지식", "수락됨"],
  studies: ["분야명", "학기", "교재", "비고", "주최자", "활동 사진"],
};

const DATABASES = [
  ["seminars", "NOTION_DB_SEMINARS", "제목"],
  ["seminar-requests", "NOTION_DB_SEMINAR_REQUESTS", "제목"],
  ["activities", "NOTION_DB_ACTIVITIES", "활동명"],
  ["members", "NOTION_DB_MEMBERS", "이름"],
  ["private-info", "NOTION_DB_PRIVATE_INFO", "이름"],
  ["applications", "NOTION_DB_APPLICATIONS", "이름"],
  ["studies", "NOTION_DB_STUDIES", "분야명"],
  ["events", "NOTION_DB_EVENTS", "Title"],
  ["attendance-queue", "NOTION_DB_ATTENDANCE_QUEUE", "Title"],
  ["settings", "NOTION_DB_SETTINGS", "Title"],
];

console.log(SKIP_NOTION ? "# 앱 감사 (노션 생략)\n" : "# 노션 원본 감사\n");

/** @type {Record<string, number>} */
const notionCounts = {};

for (const [label, envName] of SKIP_NOTION ? [] : DATABASES) {
  const dbId = process.env[envName];
  if (!dbId) {
    console.log(`\n## ${label} — ${envName} 미설정 (조회 불가)`);
    continue;
  }

  let db;
  try {
    db = await api(`https://api.notion.com/v1/databases/${dbId}`);
  } catch (e) {
    console.log(
      `\n## ${label} — 조회 실패: ${e instanceof Error ? e.message : e}`,
    );
    continue;
  }

  const rows = [];
  let cursor = undefined;
  do {
    const page = await api(
      `https://api.notion.com/v1/databases/${dbId}/query`,
      {
        method: "POST",
        body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      },
    );
    rows.push(...(page.results ?? []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  notionCounts[label] = rows.length;
  const mapped = MAPPED[label] ?? [];

  console.log(`\n## ${label} — ${rows.length}행`);
  const table = Object.entries(db.properties ?? {}).map(([name, prop]) => {
    const count = rows.filter((r) => filled(r.properties?.[name])).length;
    return {
      속성: name,
      타입: prop.type,
      채움: `${count}/${rows.length}`,
      이주: mapped.includes(name) ? "○" : prop.type === "formula" ? "-" : "✗",
    };
  });
  console.table(table);

  const unmappedWithData = table.filter(
    (t) => t.이주 === "✗" && !t.채움.startsWith("0/"),
  );
  if (unmappedWithData.length) {
    console.log(
      `  ⚠ 값이 있는데 이주되지 않은 속성: ${unmappedWithData
        .map((t) => `${t.속성}(${t.채움})`)
        .join(", ")}`,
    );
  }

  // 본문은 이주가 한 번도 읽지 않은 영역이다.
  let bodies = 0;
  for (const row of rows) if (await hasBody(row.id)) bodies += 1;
  if (bodies) {
    console.log(
      `  ⚠ 페이지 본문에 글이 있는 행: ${bodies}/${rows.length} (이주 대상 아님)`,
    );
  }
}

// ---- 앱 쪽 (자격증명이 있을 때만) -------------------------------------------
if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
  );
  const { data, error } = await sb.from("app_tables").select("name, doc");
  if (error) {
    console.log(`\n# 앱 테이블 조회 실패: ${error.message}`);
  } else {
    console.log("\n# 앱 테이블 대조\n");
    const pairs = {
      seminars: "seminars",
      "seminar-requests": "seminar-requests",
      activities: "activities",
      members: "members",
      "private-info": "private-info",
      studies: "studies",
    };
    console.table(
      (data ?? []).map((row) => {
        const rows = row.doc?.rows ?? [];
        const notionLabel = Object.entries(pairs).find(
          ([, v]) => v === row.name,
        )?.[0];
        return {
          테이블: row.name,
          앱행수: rows.length,
          노션행수: notionLabel ? (notionCounts[notionLabel] ?? "-") : "-",
        };
      }),
    );

    const seminars =
      (data ?? []).find((t) => t.name === "seminars")?.doc?.rows ?? [];
    const activities =
      (data ?? []).find((t) => t.name === "activities")?.doc?.rows ?? [];
    const members =
      (data ?? []).find((t) => t.name === "members")?.doc?.rows ?? [];
    const studies =
      (data ?? []).find((t) => t.name === "studies")?.doc?.rows ?? [];
    const gallery =
      (data ?? []).find((t) => t.name === "gallery-dinner")?.doc?.rows ?? [];

    console.log("\n## 비어 있는 화면의 근거\n");
    console.table([
      {
        화면: "/archive/seminars 일시",
        지표: "schedule 있는 세미나",
        값: `${seminars.filter((s) => s.schedule).length}/${seminars.length}`,
      },
      {
        화면: "세미나↔출석",
        지표: "activityId 있는 세미나",
        값: `${seminars.filter((s) => s.activityId).length}/${seminars.length}`,
      },
      {
        화면: "/archive/gallery",
        지표: "사진 있는 세미나·스터디·회식",
        값: `${seminars.filter((s) => (s.photos ?? []).length).length}·${studies.filter((s) => (s.photos ?? []).length).length}·${gallery.length}`,
      },
      {
        화면: "세미나 자료",
        지표: "materials 있는 세미나",
        값: `${seminars.filter((s) => (s.materials ?? []).length).length}/${seminars.length}`,
      },
      {
        화면: "/archive/projects",
        지표: "project.title 채워진 회원",
        값: `${members.filter((m) => m.project?.title).length}/${members.filter((m) => m.project).length} (project 있는 회원 기준)`,
      },
      {
        화면: "/about/executives",
        지표: "roles 있는 회원",
        값: `${members.filter((m) => (m.roles ?? []).length).length}/${members.length}`,
      },
      {
        화면: "출석 기록",
        지표: "attendeeIds 있는 활동",
        값: `${activities.filter((a) => (a.attendeeIds ?? []).length).length}/${activities.length}`,
      },
      {
        화면: "회원 상태",
        지표: "정회원(active)",
        값: `${members.filter((m) => m.status === "active").length}/${members.length}`,
      },
    ]);
  }
} else {
  console.log(
    "\n# 앱 테이블 대조 생략 — SUPABASE_URL / SUPABASE_SECRET_KEY 없음",
  );
}
