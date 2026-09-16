/**
 * 노션 원본 **스키마 점검** — 이주 때 무엇이 매핑에서 빠졌는지 원본으로 확인한다.
 *
 * 왜 필요한가: 이주 스크립트(`20-export-tables.ts`)는 세미나에서 제목·학기·비고·
 * 진행자·자료·사진만 옮겼고 활동에서는 제목·일정·종류·출석만 옮겼다. 그래서
 * "장소는 원본에 있었는가, 아니면 애초에 없었는가"를 코드만 봐서는 알 수 없다.
 * 그 답에 따라 복구 가능 범위가 달라진다.
 *
 * **출력은 속성의 이름과 타입뿐이다.** 셀 값(회원 이름·이메일 등)은 찍지 않는다 —
 * 진단에 필요한 것은 스키마이지 사람들의 데이터가 아니다. 값이 꼭 필요하면
 * `--sample N` 을 명시해야 하고, 그때도 제목·날짜 계열만 보여 준다.
 *
 *   node scripts/ops/ops-notion-inspect.mjs              # 스키마만
 *   node scripts/ops/ops-notion-inspect.mjs --sample 3   # 날짜·제목 계열 값 3건까지
 *
 * 읽기 전용: 노션에 아무것도 쓰지 않는다.
 */
import { loadDotenv } from "./lib-env.mjs";

loadDotenv();

const token = process.env.NOTION_API_KEY;
if (!token) {
  console.error(
    "NOTION_API_KEY 없음 — .env 또는 환경변수에 넣고 다시 실행할 것.",
  );
  process.exit(1);
}

const sampleArg = process.argv.indexOf("--sample");
const sampleCount = sampleArg !== -1 ? Number(process.argv[sampleArg + 1]) : 0;

/** 이주 스크립트가 쓰는 것과 같은 env 이름들. */
const DATABASES = [
  ["seminars", "NOTION_DB_SEMINARS"],
  ["seminar-requests", "NOTION_DB_SEMINAR_REQUESTS"],
  ["activities", "NOTION_DB_ACTIVITIES"],
  ["events", "NOTION_DB_EVENTS"],
  ["members", "NOTION_DB_MEMBERS"],
  ["private-info", "NOTION_DB_PRIVATE_INFO"],
  ["attendance-queue", "NOTION_DB_ATTENDANCE_QUEUE"],
  ["applications", "NOTION_DB_APPLICATIONS"],
  ["studies", "NOTION_DB_STUDIES"],
  ["settings", "NOTION_DB_SETTINGS"],
];

const NOTION = "https://api.notion.com/v1";
const headers = {
  authorization: `Bearer ${token}`,
  "notion-version": "2022-06-28",
  "content-type": "application/json",
};

/** @param {string} url @param {RequestInit} [init] */
async function api(url, init) {
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** 제목·날짜 계열만 값으로 보여 준다 — 사람 데이터는 찍지 않는다. */
const SAFE_TYPES = new Set(["title", "date", "select", "checkbox", "number"]);

/** @param {any} prop */
function renderValue(prop) {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return (prop.title ?? []).map((t) => t.plain_text).join("");
    case "date":
      return prop.date ? `${prop.date.start} → ${prop.date.end ?? "-"}` : "";
    case "select":
      return prop.select?.name ?? "";
    case "checkbox":
      return String(prop.checkbox);
    case "number":
      return String(prop.number ?? "");
    default:
      return "";
  }
}

let anyFound = false;

for (const [label, envName] of DATABASES) {
  const id = process.env[envName];
  if (!id) {
    console.log(`\n### ${label} — ${envName} 미설정 (건너뜀)`);
    continue;
  }

  console.log(`\n### ${label}  (${envName})`);
  try {
    const db = await api(`${NOTION}/databases/${id}`);
    anyFound = true;
    const title =
      (db.title ?? []).map((t) => t.plain_text).join("") || "(제목 없음)";
    console.log(`제목: ${title}`);
    const props = Object.entries(db.properties ?? {}).map(([name, p]) => ({
      속성: name,
      타입: p.type,
    }));
    console.table(props);

    if (sampleCount > 0) {
      const query = await api(`${NOTION}/databases/${id}/query`, {
        method: "POST",
        body: JSON.stringify({ page_size: Math.min(sampleCount, 10) }),
      });
      const safeNames = Object.entries(db.properties ?? {})
        .filter(([, p]) => SAFE_TYPES.has(p.type))
        .map(([name]) => name);
      const rows = (query.results ?? []).map((page) => {
        /** @type {Record<string, string>} */
        const row = {};
        for (const name of safeNames)
          row[name] = renderValue(page.properties?.[name]).slice(0, 40);
        return row;
      });
      console.log(`샘플 ${rows.length}건 (제목·날짜·선택 계열만):`);
      console.table(rows);
    }
  } catch (e) {
    console.log(`조회 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (!anyFound) {
  console.log(
    "\n조회된 데이터베이스가 없다 — NOTION_DB_* 가 비어 있거나, 통합(integration)이 해당 DB에 공유되지 않았다.",
  );
}
