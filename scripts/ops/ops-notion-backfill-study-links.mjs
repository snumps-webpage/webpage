/**
 * 노션 스터디 DB의 `활동 기록` relation으로 앱 활동의 빈 스터디 연결(`studyId`)을
 * 채운다 — 스터디마다 후보(스터디 제목·학기, 활동 제목·날짜)를 보여 주고 운영자가
 * 연결(y)·건너뜀(n)을 고른다.
 *
 *   node scripts/ops/ops-notion-backfill-study-links.mjs --target dev
 *   node scripts/ops/ops-notion-backfill-study-links.mjs --target prod            # 쓰기 전에 prod ref 입력
 *   node scripts/ops/ops-notion-backfill-study-links.mjs --target dev --dry-run   # 후보·선택·미리보기까지만
 *
 * 왜: 활동↔스터디 연결 필드(마이그레이션 20261015000000)의 backfill은 출석 이벤트가
 * 있는 활동만 채운다. 이주한 옛 스터디 활동의 연결은 노션 relation에만 있다
 * (snumps-webpage/D-000045, D-000050). 10/14 읽기 전용 조회: 노션 스터디 17건, 각각
 * relation 1개, 앱 활동과 제목+시작일로 17/17 유일 일치.
 *
 * 규칙: 노션은 읽기만 한다. 짝짓기는 lib-notion-study-links.mjs matchStudyLinks —
 * 스터디는 제목+학기, 활동은 제목+시작일, 양쪽 모두 하나일 때만(그 밖은 이유와 함께
 * 보고만). **빈 칸만** — 이미 studyId가 있는 활동은 후보로 내지 않고, 적용 직전에
 * 다시 읽어 그새 채워진 것은 뺀다. 쓰기는 flow_set_activity_study, 메일 없음.
 * 마이그레이션 20261015000000 적용 뒤에 돌릴 것.
 *
 * 인증: 노션은 .env의 NOTION_API_KEY·NOTION_DB_STUDIES·NOTION_DB_ACTIVITIES
 * (lib-env.mjs), DB는 `supabase login` 세션(lib-supabase-cli.mjs).
 * 출력: 스터디·활동 제목과 날짜뿐, 개인정보 없음.
 */
import { createInterface } from "node:readline/promises";
import { loadDotenv } from "./lib-env.mjs";
import {
  appRowsFrom,
  currentSql,
  linkSql,
  matchStudyLinks,
} from "./lib-notion-study-links.mjs";
import { queryFor, REF } from "./lib-supabase-cli.mjs";

const USAGE =
  "사용: node scripts/ops/ops-notion-backfill-study-links.mjs --target dev|prod [--dry-run]";
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const targetAt = args.indexOf("--target");
const TARGET = targetAt === -1 ? undefined : args[targetAt + 1];
const known = new Set(["--dry-run", "--target", "dev", "prod"]);
if (
  args.some((a) => !known.has(a)) ||
  (TARGET !== "dev" && TARGET !== "prod")
) {
  console.error(USAGE);
  process.exit(2);
}
if (!process.stdin.isTTY) {
  console.error(
    "터미널에서 직접 입력하며 돌리는 스크립트다 (파이프 입력 불가).",
  );
  process.exit(2);
}
loadDotenv();
const NOTION_KEY = process.env.NOTION_API_KEY;
const DB_STUDIES = process.env.NOTION_DB_STUDIES;
const DB_ACTIVITIES = process.env.NOTION_DB_ACTIVITIES;
if (!NOTION_KEY || !DB_STUDIES || !DB_ACTIVITIES) {
  console.error(
    "NOTION_API_KEY / NOTION_DB_STUDIES / NOTION_DB_ACTIVITIES 없음 — .env를 확인할 것.",
  );
  process.exit(1);
}

const query = queryFor(TARGET);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const headers = {
  authorization: `Bearer ${NOTION_KEY}`,
  "notion-version": "2022-06-28",
  "content-type": "application/json",
};
/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @param {string} url @param {RequestInit} [init] */
async function notion(url, init) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(350); // 노션 API 초당 3회 제한
    const res = await fetch(url, { ...init, headers });
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok)
      throw new Error(
        `노션 ${res.status}: ${(await res.text()).slice(0, 120)}`,
      );
    return res.json();
  }
  throw new Error("노션 요청 한도 초과");
}

/**
 * 노션 DB의 모든 행(페이지 단위로 넘김).
 * @param {string} db
 * @returns {Promise<{ id: string, properties: Record<string, any> }[]>}
 */
async function allRows(db) {
  /** @type {{ id: string, properties: Record<string, any> }[]} */
  const out = [];
  /** @type {string | undefined} */
  let cursor;
  do {
    const page = await notion(
      `https://api.notion.com/v1/databases/${db}/query`,
      {
        method: "POST",
        body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      },
    );
    for (const row of page.results ?? [])
      out.push({ id: row.id, properties: row.properties ?? {} });
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** @param {{ plain_text: string }[] | undefined} rich */
const plain = (rich) => (rich ?? []).map((t) => t.plain_text).join("");

/** @param {string | null} start */
const dayOf = (start) => (start ? start.slice(0, 10) : "(일정 없음)");

/** @param {string} label */
async function yesNo(label) {
  const a = (await rl.question(`  ${label} [y/N]: `)).trim().toLowerCase();
  return a === "y";
}

const appRows = () => appRowsFrom(query(currentSql()));

async function main() {
  console.log(`대상: ${TARGET}${DRY_RUN ? " (dry-run — 쓰지 않음)" : ""}`);
  const notionStudies = (await allRows(/** @type {string} */ (DB_STUDIES))).map(
    (r) => {
      const rel = r.properties["활동 기록"];
      return {
        id: r.id,
        title: plain(r.properties["분야명"]?.title),
        semester: r.properties["학기"]?.select?.name ?? "",
        activityIds: (rel?.relation ?? []).map(
          (/** @type {{ id: string }} */ x) => x.id,
        ),
        relationTruncated: rel?.has_more === true,
      };
    },
  );
  const notionActivities = (
    await allRows(/** @type {string} */ (DB_ACTIVITIES))
  ).map((r) => ({
    id: r.id,
    title: plain(r.properties["활동명"]?.title),
    start: r.properties["일정"]?.date?.start ?? null,
    type: r.properties["활동 종류"]?.select?.name ?? "",
  }));

  const app = appRows();
  const { pairs, unmatched } = matchStudyLinks(
    notionStudies,
    notionActivities,
    app.studies,
    app.activities,
  );
  console.log(
    `노션 스터디 ${notionStudies.length}개·활동 ${notionActivities.length}개, 후보 ${pairs.length}개`,
  );
  for (const u of unmatched) console.log(`  건너뜀: ${u.title} — ${u.reason}`);
  if (pairs.length === 0) {
    console.log("\n연결할 후보가 없다 — 아무것도 바꾸지 않았다.");
    return;
  }

  const studyById = new Map(app.studies.map((s) => [s.id, s]));
  const activityById = new Map(app.activities.map((a) => [a.id, a]));
  /** @type {{ studyId: string, activityId: string, label: string }[]} */
  const plans = [];
  for (const p of pairs) {
    const s = /** @type {import("./lib-notion-study-links.mjs").AppStudy} */ (
      studyById.get(p.studyId)
    );
    const a =
      /** @type {import("./lib-notion-study-links.mjs").AppActivity} */ (
        activityById.get(p.activityId)
      );
    const label = `${s.title} (${s.semester}) ← 「${a.title}」 ${dayOf(a.start)}`;
    console.log(`\n■ 스터디: ${s.title} (${s.semester})`);
    console.log(
      `  활동: 「${a.title}」 ${dayOf(a.start)} · 앱 종류 ${a.type} · 노션 종류 ${p.notionActivity.type || "(없음)"}`,
    );
    if (await yesNo("이 활동을 이 스터디에 연결할까?"))
      plans.push({ studyId: p.studyId, activityId: p.activityId, label });
    else console.log("  → 건너뜀");
  }

  if (plans.length === 0) {
    console.log("\n고른 것이 없다 — 아무것도 바꾸지 않았다.");
    return;
  }
  console.log("\n미리보기 (빈 연결만 채움, 메일 없음):");
  for (const p of plans) console.log(`  - ${p.label}`);
  if (DRY_RUN) {
    console.log("\n(dry-run) 여기서 멈춘다.");
    return;
  }
  if (
    (await rl.question("\n이대로 적용한다 [yes 입력 시 진행]: ")).trim() !==
    "yes"
  ) {
    console.log("취소했다 — 아무것도 바꾸지 않았다.");
    return;
  }
  if (TARGET === "prod") {
    const ref = (
      await rl.question("prod에 쓴다 — prod 프로젝트 ref를 입력: ")
    ).trim();
    if (ref !== REF.prod) {
      console.log("ref가 다르다 — 취소했다.");
      return;
    }
  }

  // 그새 연결됐거나 사라진 것은 빼고 쓴다 — 빈 연결만
  const now = appRows();
  const nowStudies = new Set(now.studies.map((s) => s.id));
  const nowActivities = new Map(now.activities.map((a) => [a.id, a]));
  /** @type {typeof plans} */
  const applied = [];
  for (const p of plans) {
    const a = nowActivities.get(p.activityId);
    if (!a || !nowStudies.has(p.studyId)) {
      console.log(`  사라짐: ${p.label} — 건너뜀`);
      continue;
    }
    if (a.studyId !== null) {
      console.log(`  이미 연결됨: ${p.label} — 건너뜀`);
      continue;
    }
    try {
      query(linkSql(p.activityId, p.studyId));
      applied.push(p);
      console.log(`  적용: ${p.label}`);
    } catch (e) {
      console.error(
        `  실패: ${p.label} — ${e instanceof Error ? e.message : e}`,
      );
      console.error(
        `  여기서 멈춘다. 적용된 것: ${applied.length}건 (다시 실행하면 빈 연결만 다시 후보로 나온다).`,
      );
      break;
    }
  }
  if (applied.length) {
    const after = new Map(appRows().activities.map((a) => [a.id, a]));
    console.log("\n재조회:");
    for (const p of applied) {
      const ok = after.get(p.activityId)?.studyId === p.studyId;
      console.log(
        `  - ${p.label}: ${ok ? "연결됨" : "연결 안 됨 — 확인 필요"}`,
      );
    }
  }
  console.log(`\n끝: ${applied.length}건 적용.`);
}

try {
  await main();
} catch (e) {
  console.error(`중단: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
