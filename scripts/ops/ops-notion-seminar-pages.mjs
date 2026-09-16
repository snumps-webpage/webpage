/**
 * 노션 세미나 **페이지 본문**을 들여다본다 — 속성이 아니라 본문에 적힌 것들
 * (출석자 명단 등)이 이주에서 빠졌는지 확인하기 위한 점검용.
 *
 * 이주 스크립트는 **속성만** 읽었다(`20-export-tables.ts`). 페이지 본문 블록은
 * 한 번도 건드리지 않았으므로, 본문에 기록된 것은 전부 앱으로 넘어오지 않았다.
 *
 *   node scripts/ops/ops-notion-seminar-pages.mjs              # 구조 요약 (본문 미출력)
 *   node scripts/ops/ops-notion-seminar-pages.mjs --show 3     # 앞 3페이지 본문 출력
 *   node scripts/ops/ops-notion-seminar-pages.mjs --json out.json  # 전량 덤프(로컬 파일)
 *
 * 기본값이 "구조 요약"인 이유: 본문에는 회원 이름이 들어 있다. 파서를 만들려면
 * 형식을 봐야 하지만, 필요 이상으로 터미널에 흘리지는 않는다.
 *
 * 읽기 전용 — 노션에 아무것도 쓰지 않는다.
 */
import { writeFileSync } from "node:fs";
import { loadDotenv } from "./lib-env.mjs";

loadDotenv();

const token = process.env.NOTION_API_KEY;
const dbId = process.env.NOTION_DB_SEMINARS;
if (!token || !dbId) {
  console.error("NOTION_API_KEY / NOTION_DB_SEMINARS 없음");
  process.exit(1);
}

const showArg = process.argv.indexOf("--show");
const showCount = showArg !== -1 ? Number(process.argv[showArg + 1] ?? 1) : 0;
const jsonArg = process.argv.indexOf("--json");
const jsonPath = jsonArg !== -1 ? process.argv[jsonArg + 1] : null;

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

/** 블록 하나의 평문. 리스트·문단·제목·인용 등 텍스트를 가진 타입을 모두 다룬다. */
function blockText(block) {
  const body = block[block.type];
  if (!body) return "";
  const rich = body.rich_text ?? body.text ?? [];
  return Array.isArray(rich)
    ? rich.map((t) => t.plain_text ?? "").join("")
    : "";
}

/** 자식까지 훑어 내려간다 — 명단이 토글 안에 있는 경우가 흔하다. */
async function blocksOf(id, depth = 0) {
  if (depth > 3) return [];
  /** @type {{type: string, text: string, depth: number}[]} */
  const out = [];
  let cursor = undefined;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const page = await api(
      `https://api.notion.com/v1/blocks/${id}/children?${query}`,
    );
    for (const block of page.results ?? []) {
      out.push({ type: block.type, text: blockText(block), depth });
      if (block.has_children)
        out.push(...(await blocksOf(block.id, depth + 1)));
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return out;
}

// ---- 세미나 페이지 전량 -----------------------------------------------------
const pages = [];
let cursor = undefined;
do {
  const page = await api(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
  });
  for (const row of page.results ?? []) {
    const props = row.properties ?? {};
    pages.push({
      id: row.id,
      title: (props["제목"]?.title ?? []).map((t) => t.plain_text).join(""),
      semester: props["학기"]?.select?.name ?? "",
    });
  }
  cursor = page.has_more ? page.next_cursor : undefined;
} while (cursor);

console.log(`세미나 페이지 ${pages.length}건 — 본문 조회 중…\n`);

const summary = [];
const dump = [];
for (const page of pages) {
  const blocks = await blocksOf(page.id);
  const nonEmpty = blocks.filter((b) => b.text.trim());
  summary.push({
    제목: page.title.slice(0, 26),
    학기: page.semester,
    블록: blocks.length,
    글있는블록: nonEmpty.length,
    타입: [...new Set(blocks.map((b) => b.type))].slice(0, 5).join(","),
  });
  dump.push({ ...page, blocks });
}

console.table(summary);
const withBody = summary.filter((s) => s.글있는블록 > 0).length;
console.log(`본문이 있는 페이지: ${withBody} / ${pages.length}`);

if (showCount > 0) {
  for (const entry of dump.slice(0, showCount)) {
    console.log(`\n=== ${entry.title} (${entry.semester}) ===`);
    for (const block of entry.blocks) {
      if (!block.text.trim()) continue;
      console.log(`${"  ".repeat(block.depth)}[${block.type}] ${block.text}`);
    }
  }
}

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(dump, null, 2));
  console.log(`\n전량 덤프: ${jsonPath} (회원 이름 포함 — 커밋 금지)`);
}
