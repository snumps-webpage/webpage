/**
 * 노션 세미나 페이지 **본문**에만 있던 영상 링크·선수지식·소요시간을 앱 세미나의 빈 칸에
 * 채운다 — 후보를 하나씩 보여 주고 운영자가 채택(y)·수정(e)·건너뜀(n)을 고른다.
 *
 *   node scripts/ops/ops-notion-backfill-body.mjs                  # dev
 *   node scripts/ops/ops-notion-backfill-body.mjs --target prod    # prod (쓰기 전에 prod ref 입력)
 *   node scripts/ops/ops-notion-backfill-body.mjs --dry-run        # 후보·선택·미리보기까지만
 *
 * 왜: 이주는 노션 DB **속성**만 읽었고, 9/30 본문 스캔에서 YouTube 링크 6쪽 13개,
 * 선수지식 4쪽(`선수지식: 값` 2·문장 속 2), 소요시간 2쪽(문장 속)이 본문에서 나왔다
 * (snumps-webpage/D-000007, D-000011).
 *
 * 규칙: 노션은 읽기만 한다. 짝짓기는 제목+학기(같은 쌍이 둘 이상이면 보고만). **빈 칸만** —
 * 이미 값이 있는 필드는 후보로 내지 않고, 적용 직전에 다시 읽어 그새 채워진 칸은 뺀다.
 * 쓰기는 관리자 기록 수정과 같은 SQL 흐름(flow_update_seminar_record), 메일 없음.
 * 앱 배포(영상 필드, 마이그레이션 20261014000000) 뒤에 돌릴 것 — 옛 코드는 videos 키를 지운다.
 *
 * 인증: 노션은 .env의 NOTION_API_KEY·NOTION_DB_SEMINARS(lib-env.mjs), DB는 `supabase login`
 * 세션(lib-supabase-cli.mjs). 출력: 세미나 제목과 후보 내용(세미나 정보)뿐, 개인정보 없음.
 */
import { createInterface } from "node:readline/promises";
import { loadDotenv } from "./lib-env.mjs";
import {
  candidatesFrom,
  currentSql,
  LIMITS,
  matchSeminars,
  patchIssue,
  patchSql,
} from "./lib-notion-body.mjs";
import { queryFor, REF } from "./lib-supabase-cli.mjs";

const USAGE =
  "사용: node scripts/ops/ops-notion-backfill-body.mjs [--target dev|prod] [--dry-run]";
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const targetAt = args.indexOf("--target");
const TARGET = targetAt === -1 ? "dev" : args[targetAt + 1];
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
const NOTION_DB = process.env.NOTION_DB_SEMINARS;
if (!NOTION_KEY || !NOTION_DB) {
  console.error("NOTION_API_KEY / NOTION_DB_SEMINARS 없음 — .env를 확인할 것.");
  process.exit(1);
}

const query = queryFor(/** @type {"dev" | "prod"} */ (TARGET));
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
 * 본문 블록(자식 3단계까지) → { type, text, links }.
 * @param {string} blockId
 * @param {number} depth
 * @param {import("./lib-notion-body.mjs").Block[]} out
 */
async function bodyBlocks(blockId, depth = 0, out = []) {
  if (depth > 3) return out;
  /** @type {string | undefined} */
  let cursor;
  do {
    const qs = new URLSearchParams({ page_size: "100" });
    if (cursor) qs.set("start_cursor", cursor);
    const body = await notion(
      `https://api.notion.com/v1/blocks/${blockId}/children?${qs}`,
    );
    for (const b of body.results ?? []) {
      const rich = b[b.type]?.rich_text ?? [];
      out.push({
        type: b.type,
        text: rich
          .map((/** @type {{ plain_text?: string }} */ t) => t.plain_text ?? "")
          .join(""),
        links: rich
          .filter((/** @type {{ href?: string }} */ t) => t.href)
          .map((/** @type {{ href: string, plain_text?: string }} */ t) => ({
            href: t.href,
            text: t.plain_text ?? "",
          })),
      });
      if (b.has_children && b.type !== "child_page")
        await bodyBlocks(b.id, depth + 1, out);
    }
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** @param {string} label */
async function choose(label) {
  for (;;) {
    const a = (await rl.question(`    ${label} [y 채택 / e 수정 / n 건너뜀]: `))
      .trim()
      .toLowerCase();
    if (a === "y" || a === "e" || a === "n") return a;
  }
}

async function main() {
  console.log(`대상: ${TARGET}${DRY_RUN ? " (dry-run — 쓰지 않음)" : ""}`);
  /** @type {{ id: string, title: string, semester: string }[]} */
  const notionRows = [];
  /** @type {string | undefined} */
  let cursor;
  do {
    const page = await notion(
      `https://api.notion.com/v1/databases/${NOTION_DB}/query`,
      {
        method: "POST",
        body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      },
    );
    for (const row of page.results ?? []) {
      const props = row.properties ?? {};
      notionRows.push({
        id: row.id,
        title: (props["제목"]?.title ?? [])
          .map((/** @type {{ plain_text: string }} */ t) => t.plain_text)
          .join(""),
        semester: props["학기"]?.select?.name ?? "",
      });
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  const current = () =>
    new Map(
      query(currentSql()).map((r) => [
        String(r.id),
        {
          id: String(r.id),
          title: String(r.title),
          semester: String(r.semester),
          videos: /** @type {unknown[]} */ (r.videos),
          prerequisites: String(r.prerequisites),
          durationMinutes:
            r.duration_minutes === null ? null : Number(r.duration_minutes),
        },
      ]),
    );
  const seminars = current();
  const { pairs, unmatched } = matchSeminars(notionRows, [
    ...seminars.values(),
  ]);
  console.log(
    `노션 세미나 ${notionRows.length}개, 짝지은 것 ${pairs.length}개`,
  );
  for (const u of unmatched)
    console.log(`  건너뜀: ${u.title} (${u.semester}) — ${u.reason}`);

  /** @type {{ id: string, title: string, patch: import("./lib-notion-body.mjs").Patch }[]} */
  const plans = [];
  for (const { notionId, seminarId } of pairs) {
    const s = /** @type {NonNullable<ReturnType<typeof seminars.get>>} */ (
      seminars.get(seminarId)
    );
    const c = candidatesFrom(await bodyBlocks(notionId));
    const wantVideos = s.videos.length === 0 && c.videos.length > 0;
    const wantPrereq = !s.prerequisites.trim() && c.prerequisites.length > 0;
    const wantDuration = s.durationMinutes === null && c.duration.length > 0;
    if (!wantVideos && !wantPrereq && !wantDuration) continue;

    console.log(`\n■ ${s.title} (${s.semester})`);
    /** @type {import("./lib-notion-body.mjs").Patch} */
    const patch = {};
    if (wantVideos) {
      /** @type {{ url: string, title: string }[]} */
      const kept = [];
      for (const v of c.videos.slice(0, LIMITS.video.count)) {
        console.log(`  영상: ${v.url}${v.title ? `  「${v.title}」` : ""}`);
        const a = await choose("이 링크");
        if (a === "y") kept.push(v);
        if (a === "e")
          kept.push({
            url: v.url,
            title: (await rl.question("    제목 (엔터 = 없음): ")).trim(),
          });
      }
      if (kept.length) patch.videos = kept;
    }
    if (wantPrereq) {
      for (const p of c.prerequisites) {
        console.log(
          `  선수지식 (${p.kind === "label" ? "라벨" : "문장 속"}): ${p.value}`,
        );
        const a = await choose("이 값");
        if (a === "y") patch.prerequisites = p.value;
        if (a === "e")
          patch.prerequisites = (await rl.question("    선수지식: ")).trim();
        if (a !== "n") break;
      }
    }
    if (wantDuration) {
      for (const d of c.duration) {
        console.log(
          `  소요시간 (${d.kind === "label" ? "라벨" : "문장 속"}): ${d.text}  → ${d.minutes ?? "분 해석 불가"}`,
        );
        const a = await choose(
          d.minutes === null
            ? "이 문장 (y 불가 — e로 분 입력)"
            : `${d.minutes}분`,
        );
        if (a === "y" && d.minutes !== null) patch.durationMinutes = d.minutes;
        if (a === "e" || (a === "y" && d.minutes === null)) {
          patch.durationMinutes = Number(
            (await rl.question("    소요 시간(분): ")).trim(),
          );
        }
        if (a !== "n") break;
      }
    }
    if (Object.keys(patch).length === 0) continue;
    const issue = patchIssue(patch);
    if (issue) {
      console.log(`  → 규칙 위반으로 이 세미나는 건너뜀: ${issue}`);
      continue;
    }
    plans.push({ id: s.id, title: s.title, patch });
  }

  if (plans.length === 0) {
    console.log("\n채택한 것이 없다 — 아무것도 바꾸지 않았다.");
    return;
  }
  console.log("\n미리보기 (빈 칸만 채움, 메일 없음):");
  for (const p of plans) {
    const parts = [];
    if (p.patch.videos) parts.push(`영상 ${p.patch.videos.length}개`);
    if (p.patch.prerequisites !== undefined)
      parts.push(`선수지식 "${p.patch.prerequisites}"`);
    if (p.patch.durationMinutes !== undefined)
      parts.push(`소요 ${p.patch.durationMinutes}분`);
    console.log(`  - ${p.title}: ${parts.join(", ")}`);
  }
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

  const now = current(); // 그새 채워진 칸은 빼고 쓴다 — 빈 칸만
  let done = 0;
  for (const p of plans) {
    const s = now.get(p.id);
    if (!s) {
      console.log(`  사라짐: ${p.title} — 건너뜀`);
      continue;
    }
    /** @type {import("./lib-notion-body.mjs").Patch} */
    const patch = {};
    if (p.patch.videos && s.videos.length === 0) patch.videos = p.patch.videos;
    if (p.patch.prerequisites !== undefined && !s.prerequisites.trim())
      patch.prerequisites = p.patch.prerequisites;
    if (p.patch.durationMinutes !== undefined && s.durationMinutes === null)
      patch.durationMinutes = p.patch.durationMinutes;
    if (Object.keys(patch).length === 0) {
      console.log(`  이미 채워짐: ${p.title} — 건너뜀`);
      continue;
    }
    try {
      query(patchSql(p.id, patch));
      done++;
      console.log(`  적용: ${p.title}`);
    } catch (e) {
      console.error(
        `  실패: ${p.title} — ${e instanceof Error ? e.message : e}`,
      );
      console.error(
        `  여기서 멈춘다. 적용된 것: ${done}건 (다시 실행하면 빈 칸만 다시 후보로 나온다).`,
      );
      return;
    }
  }
  console.log(`\n끝: ${done}건 적용.`);
}

try {
  await main();
} catch (e) {
  console.error(`중단: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
