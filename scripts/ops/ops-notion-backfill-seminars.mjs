/**
 * 노션 원본에서 **외부 발표자**와 **세미나↔활동 링크(=출석 기록)**를 되살린다
 * (감사 C-12 / 부록 D).
 *
 * 노션 `세미나 기록`에는 `진행자 (비회원)` rich_text 속성이 있는데, 이주
 * 스크립트는 `externalPresenters: ""` 를 박아 넣었다(`20-export-tables.ts:437`).
 * 원본에 값이 남아 있으므로 복구 대상이다.
 *
 * 링크는 속성이 아니라 **페이지 본문**에 있다 — `활동 내역` 아래의 활동 페이지
 * mention이 그것이다. 이주는 속성만 읽었으므로 이 링크를 한 번도 보지 못했고,
 * 그래서 출석 기록이 달린 활동이 어느 세미나의 것인지 앱에서 알 수 없게 됐다.
 *
 * 세미나 짝짓기는 **제목 + 학기**다. 같은 제목·학기가 둘 이상이면 **건드리지 않고
 * 보고만 한다**: 잘못 박은 날짜나 남의 이름은 나중에 눈으로 찾아내기 어렵다.
 *
 *   node scripts/ops/ops-notion-backfill-seminars.mjs         # 미리보기(기본)
 *   node scripts/ops/ops-notion-backfill-seminars.mjs apply   # 적용
 *
 * 노션은 읽기만 한다. Supabase 쓰기는 version-CAS 한 번, 앱 서비스·메일 미사용.
 */

/**
 * @typedef {{ title: string, startsAt: string }} NotionSession
 * @typedef {{ id?: string, title: string, semester: string, externalPresenters: string, sessions?: NotionSession[] }} NotionSeminar
 * @typedef {{ startsAt: string, startTime: string | null, endsAt: string | null, location: string }} Schedule
 * @typedef {{ id: string, title: string, semester: string, externalPresenters: string, description?: string, schedule?: Schedule | null, activityId?: string | null }} SeminarRow
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

/**
 * @typedef {{ start: string, end: string | null }} DateRange
 * @typedef {{ id: string, title: string, type: string, date: DateRange }} AppActivity
 * @typedef {{ id: string, title: string, semester: string, schedule: Schedule | null, activityId: string | null }} AppSeminar
 */

/**
 * 세미나↔활동을 **원본이 말하는 대로** 잇는다.
 *
 * 노션 세미나 페이지의 `활동 내역` 본문에는 활동 페이지 링크(mention)가 있다.
 * 이주 스크립트는 속성만 읽었으므로 이 링크를 보지 못했고, 그래서 모든 세미나가
 * `activityId: null`이 됐다 — 출석 기록이 달린 활동이 어느 세미나의 것인지
 * 아무도 모르게 된 것이다. 제목 대조는 추측이지만 이 링크는 답이다.
 *
 * 노션 활동 ↔ 앱 활동은 제목+시작시각으로 잇는다(같은 페이지에서 이주됐다).
 * 세미나의 일정은 **가장 이른 회차**로 잡는다.
 *
 * @param {{
 *   notionSeminars: { title: string, semester: string, sessions: NotionSession[] }[],
 *   appSeminars: any[],
 *   appActivities: AppActivity[],
 *   location?: string,
 * }} input
 */
export function planSessionLinks({
  notionSeminars,
  appSeminars,
  appActivities,
  location = "기록 없음",
}) {
  /** @type {Map<string, AppActivity>} */
  const activityByKey = new Map();
  for (const a of appActivities) {
    activityByKey.set(keyOf(a.title, a.date.start), a);
  }

  /** @type {Map<string, AppSeminar[]>} */
  const seminarsByKey = new Map();
  for (const row of appSeminars) {
    const key = keyOf(row.title, row.semester);
    seminarsByKey.set(key, [...(seminarsByKey.get(key) ?? []), row]);
  }

  /** @type {{ id: string, title: string, semester: string, sessions: number, startsAt: string }[]} */
  const planned = [];
  /** @type {{ title: string, semester: string, reason: string }[]} */
  const unresolved = [];
  /** @type {Map<string, { activityId: string, schedule: Schedule }>} */
  const fix = new Map();

  for (const notionSeminar of notionSeminars) {
    const title = notionSeminar.title.trim();
    const semester = notionSeminar.semester.trim();
    if (notionSeminar.sessions.length === 0) continue; // 아직 열리지 않은 세미나

    const targets = seminarsByKey.get(keyOf(title, semester)) ?? [];
    if (targets.length === 0) {
      unresolved.push({ title, semester, reason: "앱에 세미나 없음" });
      continue;
    }
    if (targets.length > 1) {
      unresolved.push({ title, semester, reason: "제목·학기 중복" });
      continue;
    }

    const target = targets[0];
    // 손으로 넣은 일정을 되돌려 놓지 않는다.
    if (target.schedule) continue;

    const sorted = [...notionSeminar.sessions].sort((x, y) =>
      x.startsAt.localeCompare(y.startsAt),
    );
    const first = sorted.find((session) =>
      activityByKey.has(keyOf(session.title, session.startsAt)),
    );
    if (!first) {
      unresolved.push({ title, semester, reason: "앱에 활동 없음" });
      continue;
    }

    const activity = activityByKey.get(keyOf(first.title, first.startsAt));
    if (!activity) {
      unresolved.push({ title, semester, reason: "앱에 활동 없음" });
      continue;
    }

    fix.set(target.id, {
      activityId: activity.id,
      schedule: {
        startsAt: activity.date.start,
        // 원본에 시각이 없으면 null — 없던 시각을 지어내지 않는다.
        startTime: (() => {
          const clock = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Seoul",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(activity.date.start));
          return clock === "00:00" ? null : clock;
        })(),
        endsAt: activity.date.end ?? null,
        location,
      },
    });
    planned.push({
      id: target.id,
      title,
      semester,
      sessions: notionSeminar.sessions.length,
      startsAt: activity.date.start,
    });
  }

  const rows = appSeminars.map((s) => {
    const patch = fix.get(s.id);
    return patch ? { ...s, ...patch } : s;
  });

  return { rows, planned, unresolved, changed: planned.length > 0 };
}

/**
 * 세미나 **개요**를 페이지 본문에서 뽑는다.
 *
 * 원본의 본문은 `개요` 제목 아래 문단, 그리고 `활동 내역` 제목 아래 활동 링크로
 * 이뤄져 있다. 이주는 속성만 읽었으므로 이 설명이 통째로 넘어오지 않았고, 공개
 * 상세 페이지의 "1. 개요"가 25건 모두 비어 있다.
 *
 * 다음 제목에서 끊는다 — 활동 링크 목록을 설명으로 끌어오면 안 된다.
 *
 * @param {{ type: string, text: string, depth?: number }[]} blocks
 * @returns {string}
 */
export function extractOverview(blocks) {
  const start = blocks.findIndex(
    (b) => b.type.startsWith("heading") && b.text.trim() === "개요",
  );
  if (start === -1) return "";

  /** @type {string[]} */
  const parts = [];
  for (const block of blocks.slice(start + 1)) {
    if (block.type.startsWith("heading")) break; // 다음 절 — 여기까지가 개요다
    const text = block.text.trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

// ---- CLI ------------------------------------------------------------------
if (
  process.argv[1] &&
  process.argv[1].endsWith("ops-notion-backfill-seminars.mjs")
) {
  const { createClient } = await import("@supabase/supabase-js");
  const { loadDotenv } = await import("./lib-env.mjs");
  loadDotenv();

  const APPLY = process.argv.includes("apply");
  const locationArg = process.argv.indexOf("--location");
  const location =
    locationArg !== -1 ? process.argv[locationArg + 1] : "기록 없음";
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
   * @type {{ id: string, title: string, semester: string, externalPresenters: string, overview: string, sessions: NotionSession[] }[]}
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
        id: row.id,
        title: plain(props["제목"]?.title ?? []),
        semester: props["학기"]?.select?.name ?? "",
        externalPresenters: plain(props["진행자 (비회원)"]?.rich_text ?? []),
        overview: "",
        sessions: [],
      });
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  /** 블록을 자식까지 훑어 평문·타입을 모은다 (개요 추출용). */
  const bodyBlocks = async (
    /** @type {string} */ blockId,
    /** @type {number} */ depth = 0,
    /** @type {{type: string, text: string, depth: number}[]} */ out = [],
  ) => {
    if (depth > 3) return out;
    let blockCursor = undefined;
    do {
      const qs = new URLSearchParams({ page_size: "100" });
      if (blockCursor) qs.set("start_cursor", blockCursor);
      const res = await fetch(
        `https://api.notion.com/v1/blocks/${blockId}/children?${qs}`,
        { headers },
      );
      if (!res.ok) return out;
      const body = await res.json();
      for (const block of body.results ?? []) {
        const parts = block[block.type]?.rich_text ?? [];
        out.push({
          type: block.type,
          text: parts
            .map((/** @type {{plain_text?: string}} */ t) => t.plain_text ?? "")
            .join(""),
          depth,
        });
        if (block.has_children) await bodyBlocks(block.id, depth + 1, out);
      }
      blockCursor = body.has_more ? body.next_cursor : undefined;
    } while (blockCursor);
    return out;
  };

  /** 블록을 자식까지 훑어 mention 대상 페이지 id를 모은다. */
  /**
   * @param {string} blockId
   * @param {number} [depth]
   * @param {string[]} [found]
   * @returns {Promise<string[]>}
   */
  const linkedPageIds = async (blockId, depth = 0, found = []) => {
    if (depth > 3) return found;
    let blockCursor = undefined;
    do {
      const qs = new URLSearchParams({ page_size: "100" });
      if (blockCursor) qs.set("start_cursor", blockCursor);
      const res = await fetch(
        `https://api.notion.com/v1/blocks/${blockId}/children?${qs}`,
        { headers },
      );
      if (!res.ok) return found;
      const body = await res.json();
      for (const block of body.results ?? []) {
        const rich = block[block.type]?.rich_text ?? [];
        for (const part of rich) {
          if (part.type === "mention" && part.mention?.type === "page")
            found.push(part.mention.page.id);
        }
        if (block.has_children) await linkedPageIds(block.id, depth + 1, found);
      }
      blockCursor = body.has_more ? body.next_cursor : undefined;
    } while (blockCursor);
    return found;
  };

  // 활동 페이지의 제목·시작시각 — 앱 활동 행과 잇는 열쇠다.
  for (const seminar of notionRows) {
    // 개요는 페이지 본문에 있다 — 이주가 한 번도 읽지 않은 곳이다.
    seminar.overview = extractOverview(await bodyBlocks(seminar.id));
    const ids = await linkedPageIds(seminar.id);
    for (const id of ids) {
      const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        headers,
      });
      if (!res.ok) continue;
      const activity = await res.json();
      const startsAt = activity.properties?.["일정"]?.date?.start;
      const title = (activity.properties?.["활동명"]?.title ?? [])
        .map((/** @type {{plain_text: string}} */ t) => t.plain_text)
        .join("");
      // 활동 DB가 아닌 페이지(자료 링크 등)는 일정이 없다 — 회차가 아니다.
      if (startsAt && title) seminar.sessions.push({ title, startsAt });
    }
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
  );
  const readDoc = async (/** @type {string} */ name) => {
    const { data, error } = await sb
      .from("app_tables")
      .select("version, doc")
      .eq("name", name)
      .single();
    if (error) throw error;
    return data;
  };

  /** @type {{ version: number, doc: { rows: SeminarRow[] } }} */
  const storedDoc = await readDoc("seminars");
  const activitiesDoc = await readDoc("activities");

  // 두 복구를 이어서 계획한다 — 뒤 단계는 앞 단계의 결과 위에서 센다.
  const presenters = planExternalPresenterBackfill({
    notionRows,
    seminars: storedDoc.doc.rows,
  });
  // 개요는 비어 있는 행에만 넣는다 — 관리자가 고쳐 둔 글을 덮지 않는다.
  /** @type {{ title: string, semester: string, chars: number }[]} */
  const overviews = [];
  const withOverview = presenters.rows.map((row) => {
    if (row.description && row.description.trim()) return row;
    const source = notionRows.find(
      (n) =>
        n.title.trim() === row.title.trim() &&
        n.semester.trim() === row.semester.trim() &&
        n.overview.trim(),
    );
    if (!source) return row;
    // 제목·학기가 겹치면 어느 쪽 글인지 알 수 없다 — 건드리지 않는다.
    const rivals = notionRows.filter(
      (n) =>
        n.title.trim() === row.title.trim() &&
        n.semester.trim() === row.semester.trim(),
    );
    if (rivals.length > 1) return row;
    overviews.push({
      title: row.title,
      semester: row.semester,
      chars: source.overview.length,
    });
    return { ...row, description: source.overview };
  });

  const links = planSessionLinks({
    notionSeminars: notionRows,
    appSeminars: withOverview,
    appActivities: activitiesDoc.doc.rows,
    location,
  });
  const rows = links.rows;
  const planned = presenters.planned;
  const unmatched = presenters.unmatched;
  const changed = presenters.changed || links.changed || overviews.length > 0;

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

  console.log(`\n개요(설명) 복구 ${overviews.length}건`);
  if (overviews.length) {
    console.table(
      overviews.map((o) => ({
        제목: o.title.slice(0, 26),
        학기: o.semester,
        글자수: o.chars,
      })),
    );
  }
  console.log(
    `\n활동 링크 복구 ${links.planned.length}건 · 링크 실패 ${links.unresolved.length}건`,
  );
  if (links.planned.length) {
    console.log("\n[활동 링크 — 출석 기록이 세미나에 붙는다]");
    console.table(
      links.planned.map((p) => ({
        제목: p.title.slice(0, 26),
        학기: p.semester,
        회차: p.sessions,
        시작: p.startsAt.slice(0, 16).replace("T", " "),
      })),
    );
  }
  if (links.unresolved.length) {
    console.log("\n[링크 실패 — 사람이 확인해야 한다]");
    console.table(
      links.unresolved.map((u) => ({
        제목: u.title.slice(0, 26),
        학기: u.semester,
        사유: u.reason,
      })),
    );
  }
  console.log(
    `\n장소는 노션에 없다 — 링크로 복구되는 일정의 장소는 "${location}"으로 들어간다.`,
  );

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
  // 한 번의 쓰기에 세 가지가 함께 들어간다 — 발표자 수만 말하면 나머지가
  // 적용되지 않은 것처럼 읽힌다.
  console.log(
    `\n적용 완료 — 외부 발표자 ${planned.length}건 · 개요 ${overviews.length}건 · 활동 링크 ${links.planned.length}건`,
  );
}
