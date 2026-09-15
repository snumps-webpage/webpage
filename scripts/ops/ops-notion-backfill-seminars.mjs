/**
 * 노션 원본에서 **외부 발표자**를 되살린다 (감사 C-12 / 부록 D).
 *
 * 노션 `세미나 기록`에는 `진행자 (비회원)` rich_text 속성이 있는데, 이주
 * 스크립트는 `externalPresenters: ""` 를 박아 넣었다(`20-export-tables.ts:437`).
 * 원본에 값이 남아 있으므로 복구 대상이다.
 *
 * 짝짓기는 **제목 + 학기**뿐이다 — 노션 세미나 행에는 앱의 id도, 활동과의
 * relation도 없다. 그래서 같은 제목·학기가 둘 이상이면 **건드리지 않고 보고만
 * 한다**: 잘못 들어간 사람 이름은 나중에 눈으로 찾아내기 어렵다.
 *
 *   node scripts/ops/ops-notion-backfill-seminars.mjs         # 미리보기(기본)
 *   node scripts/ops/ops-notion-backfill-seminars.mjs apply   # 적용
 *
 * 노션은 읽기만 한다. Supabase 쓰기는 version-CAS 한 번, 앱 서비스·메일 미사용.
 */

/**
 * @typedef {{ title: string, semester: string, externalPresenters: string }} NotionSeminar
 * @typedef {{ id: string, title: string, semester: string, externalPresenters: string }} SeminarRow
 * @typedef {{ id: string, title: string, semester: string, value: string }} Planned
 * @typedef {{ title: string, semester: string, reason: string }} Unmatched
 */

/**
 * 제목·학기를 한 키로 — 짝짓기의 유일한 근거다.
 *
 * JSON 배열로 만든다. 예전에는 두 값을 구분자로 이어 붙이고 보고할 때 다시
 * 쪼갰는데, 제목에 공백이 있으면(대부분 그렇다) 쪼갠 결과가 원본과 달라져
 * **실패 목록의 제목이 잘려 나갔다** — 사람이 원본을 찾아보라고 내는 목록인데.
 * 키에서 값을 되찾지 않는 것이 답이다.
 *
 * @param {string} title
 * @param {string} semester
 */
const keyOf = (title, semester) =>
  JSON.stringify([title.trim(), semester.trim()]);

/**
 * 무엇을 채울지 **계산만** 한다 (I/O 없음 — 그래서 테스트할 수 있다).
 *
 * @param {{ notionRows: NotionSeminar[], seminars: SeminarRow[] }} input
 * @returns {{ rows: SeminarRow[], planned: Planned[], unmatched: Unmatched[], changed: boolean }}
 */
export function planExternalPresenterBackfill({ notionRows, seminars }) {
  /** @type {Map<string, NotionSeminar[]>} */
  const notionByKey = new Map();
  for (const row of notionRows) {
    const key = keyOf(row.title, row.semester);
    notionByKey.set(key, [...(notionByKey.get(key) ?? []), row]);
  }

  /** @type {Map<string, SeminarRow[]>} */
  const seminarsByKey = new Map();
  for (const row of seminars) {
    const key = keyOf(row.title, row.semester);
    seminarsByKey.set(key, [...(seminarsByKey.get(key) ?? []), row]);
  }

  /** @type {Planned[]} */
  const planned = [];
  /** @type {Unmatched[]} */
  const unmatched = [];
  /** @type {Map<string, string>} */
  const fill = new Map();

  for (const [key, candidates] of notionByKey) {
    // 보고에 쓰는 이름은 **원본 행**에서 가져온다 — 키를 되파싱하지 않는다.
    const title = candidates[0].title.trim();
    const semester = candidates[0].semester.trim();
    const value = (candidates[0].externalPresenters ?? "").trim();
    const targets = seminarsByKey.get(key) ?? [];

    if (targets.length === 0) {
      if (value) unmatched.push({ title, semester, reason: "짝 없음" });
      continue;
    }
    // 어느 쪽 값인지 정할 수 없다 — 사람 이름을 추측으로 넣지 않는다.
    if (candidates.length > 1 || targets.length > 1) {
      unmatched.push({ title, semester, reason: "제목·학기 중복" });
      continue;
    }
    if (!value) continue;

    const target = targets[0];
    // 이미 들어 있는 값은 운영진이 넣었을 수 있다 — 원본으로 덮지 않는다.
    if ((target.externalPresenters ?? "").trim()) continue;

    fill.set(target.id, value);
    planned.push({ id: target.id, title, semester, value });
  }

  const rows = seminars.map((s) =>
    fill.has(s.id) ? { ...s, externalPresenters: fill.get(s.id) ?? "" } : s,
  );

  return { rows, planned, unmatched, changed: planned.length > 0 };
}

// ---- CLI ------------------------------------------------------------------
if (
  process.argv[1] &&
  process.argv[1].endsWith("ops-notion-backfill-seminars.mjs")
) {
  const { createClient } = await import("@supabase/supabase-js");
  const { existsSync, readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const REPO_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) {
    for (const rawLine of readFileSync(envFile, "utf8").split("\n")) {
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

  const APPLY = process.argv.includes("apply");
  const token = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_DB_SEMINARS;
  if (!token || !dbId) {
    console.error("NOTION_API_KEY / NOTION_DB_SEMINARS 없음");
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error("SUPABASE_URL / SUPABASE_SECRET_KEY 없음");
    process.exit(1);
  }

  const headers = {
    authorization: `Bearer ${token}`,
    "notion-version": "2022-06-28",
    "content-type": "application/json",
  };

  /**
   * 노션 세미나 전량 — 페이지네이션 끝까지.
   * @type {NotionSeminar[]}
   */
  const notionRows = [];
  /** @type {string | undefined} */
  let cursor = undefined;
  do {
    /** @type {Response} */
    const res = await fetch(
      `https://api.notion.com/v1/databases/${dbId}/query`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
      },
    );
    if (!res.ok) {
      console.error(
        `노션 조회 실패: ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
      process.exit(1);
    }
    /** @type {{ results?: any[], has_more?: boolean, next_cursor?: string }} */
    const page = await res.json();
    for (const row of page.results ?? []) {
      const props = row.properties ?? {};
      /** @param {{ plain_text: string }[]} parts */
      const plain = (parts) => parts.map((t) => t.plain_text).join("");
      notionRows.push({
        title: plain(props["제목"]?.title ?? []),
        semester: props["학기"]?.select?.name ?? "",
        externalPresenters: plain(props["진행자 (비회원)"]?.rich_text ?? []),
      });
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
  );
  const { data: stored, error } = await sb
    .from("app_tables")
    .select("version, doc")
    .eq("name", "seminars")
    .single();
  if (error) throw error;
  /** @type {{ version: number, doc: { rows: SeminarRow[] } }} */
  const storedDoc = stored;

  const { rows, planned, unmatched, changed } = planExternalPresenterBackfill({
    notionRows,
    seminars: storedDoc.doc.rows,
  });

  const withValue = notionRows.filter((r) =>
    r.externalPresenters.trim(),
  ).length;
  console.log(
    `노션 세미나 ${notionRows.length}건 (외부 발표자 기재 ${withValue}건) · 앱 세미나 ${storedDoc.doc.rows.length}건`,
  );
  console.log(
    `복구 대상 ${planned.length}건 · 짝짓기 실패 ${unmatched.length}건`,
  );

  if (planned.length) {
    console.log("\n[복구]");
    console.table(
      planned.map((p) => ({
        제목: p.title.slice(0, 28),
        학기: p.semester,
        외부발표자: p.value.slice(0, 30),
      })),
    );
  }
  if (unmatched.length) {
    console.log("\n[짝짓기 실패 — 사람이 확인해야 한다]");
    console.table(
      unmatched.map((u) => ({
        제목: u.title.slice(0, 28),
        학기: u.semester,
        사유: u.reason,
      })),
    );
  }

  if (!APPLY) {
    console.log("\n(미리보기 — 적용하려면 'apply' 인자)");
    process.exit(0);
  }
  if (!changed) {
    console.log("\n바꿀 것이 없다.");
    process.exit(0);
  }

  const { data, error: writeError } = await sb
    .from("app_tables")
    .update({ doc: { ...storedDoc.doc, rows }, version: storedDoc.version + 1 })
    .eq("name", "seminars")
    .eq("version", storedDoc.version)
    .select("name");
  if (writeError) throw writeError;
  if (!data.length) throw new Error("CAS 실패 — 다시 실행할 것");
  console.log(`\n적용 완료: ${planned.length}건`);
}
