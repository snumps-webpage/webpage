/**
 * ops 스크립트 공용 `.env` 로더.
 *
 * 왜 따로 두나: 스크립트마다 최소 구현을 복사해 넣었더니 **같은 버그가 세 벌**
 * 생겼다 — 줄 끝 주석(`KEY=value   # 설명`)을 값의 일부로 읽어, 노션 DB id 뒤에
 * 설명이 그대로 붙어 요청 URL이 깨졌다. 파싱은 한 곳에 두고 테스트 아래 둔다.
 *
 * `.env`의 **값은 반환하지 않고** process.env로만 흘려보낸다(호출자가 화면에
 * 찍을 일이 없게). 이미 설정된 환경변수가 우선한다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/**
 * `.env` 본문 → { KEY: value }.
 *
 * 다루는 것: 빈 줄·전체 주석(`#`), `export ` 접두, 따옴표로 감싼 값, 그리고
 * **줄 끝 주석**. 따옴표 안의 `#`는 값의 일부다 — 주석으로 자르지 않는다.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseDotenv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ")
      ? line.slice(7).trim()
      : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();

    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length > 1) {
      const close = value.indexOf(quote, 1);
      // 닫는 따옴표까지가 값이고, 그 뒤(주석 등)는 버린다.
      value = close === -1 ? value.slice(1) : value.slice(1, close);
    } else {
      // 따옴표가 없을 때만 줄 끝 주석을 자른다. 값 안의 `#`를 자르지 않도록
      // **공백 뒤의 `#`**만 주석으로 본다.
      const comment = value.search(/\s#/);
      if (comment !== -1) value = value.slice(0, comment).trim();
    }

    out[key] = value;
  }
  return out;
}

/** 리포 루트의 `.env`를 읽어 process.env를 채운다 (기존 값 우선). */
export function loadDotenv(file = path.join(REPO_ROOT, ".env")) {
  if (!existsSync(file)) return;
  const parsed = parseDotenv(readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) process.env[key] = value;
  }
}

/**
 * Supabase 클라이언트를 만든다.
 *
 * `@supabase/supabase-js`는 **프로젝트 의존성**이다 — `node_modules`가 없는
 * 상태에서 부르면 모듈 스택이 튀어나온다. 그 스택은 "npm ci 를 먼저 하라"는
 * 뜻인데, 그렇게 읽히지 않는다. 여기서 한 번에 말해 준다.
 *
 * `optional`이면 없을 때 종료하지 않고 `null`을 준다 — Supabase가 있으면 더
 * 보고, 없으면 그만큼만 보고하는 스크립트를 위한 것이다.
 *
 * @param {{ optional?: boolean }} [opts]
 * @returns {Promise<import("@supabase/supabase-js").SupabaseClient | null>}
 */
export async function requireSupabase({ optional = false } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    if (optional) return null;
    console.error(
      "SUPABASE_URL / SUPABASE_SECRET_KEY 없음 — 리포 루트 .env 또는 환경변수에 넣을 것.",
    );
    process.exit(1);
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(url, key);
  } catch {
    const message =
      "@supabase/supabase-js 를 찾을 수 없다 — 리포에서 `npm ci` 를 먼저 실행할 것.";
    if (optional) {
      console.error(`${message} (Supabase가 필요한 부분은 건너뛴다)`);
      return null;
    }
    console.error(message);
    process.exit(1);
  }
}
