// 실측 하네스 공용 헬퍼 — 떠 있는 실측 서버를 실제 HTTP로 조작한다.
import { encode } from "@auth/core/jwt";
import * as devalue from "devalue";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
export const MEASURE_DIR =
  process.env.MEASURE_DIR ?? path.join(os.tmpdir(), "snumps-measure");
const SECRET =
  process.env.MEASURE_AUTH_SECRET ?? "measure-secret-0123456789abcdef";
const PROBE = { "x-probe": process.env.MEASURE_PROBE_TOKEN ?? "probe-token" };
const CLOCK_FILE = path.join(MEASURE_DIR, "clock-offset");

// ---- 결과 집계 ---------------------------------------------------------------

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = [];
/** @param {string} name @param {unknown} ok @param {string} [detail] */
export function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`,
  );
}
/** @param {string} label @returns {number} 실패 개수 */
export function summary(label) {
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n== ${label}: ${results.length - failed.length}/${results.length} passed`,
  );
  for (const f of failed) console.log(`   FAIL ${f.name} ${f.detail}`);
  return failed.length;
}

// ---- 시간 (앱의 KST 학기 규칙과 같다: 3–8월 = YY-1, 9–2월 = YY-2) ----------

const DAY = 86_400_000;
const KST = 9 * 3_600_000;

/** @param {number} ms */
function kstLocal(ms) {
  return new Date(ms + KST).toISOString().slice(0, 16);
}
/** @param {number} ms @returns {{ code: string, startMs: number }} */
export function termAt(ms) {
  const d = new Date(ms + KST);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (m >= 3 && m <= 8)
    return { code: `${y % 100}-1`, startMs: Date.UTC(y, 2, 1) - KST };
  if (m >= 9) return { code: `${y % 100}-2`, startMs: Date.UTC(y, 8, 1) - KST };
  return { code: `${(y - 1) % 100}-2`, startMs: Date.UTC(y - 1, 8, 1) - KST };
}

/**
 * 시나리오는 실행 날짜와 무관해야 한다 — 서버 시계를 "현재 학기 시작 + 30일
 * 10:00 KST"에 고정하고, 모든 날짜를 거기서 잰다. 학기 끝 무렵에 돌려도
 * 일정이 다음 학기로 넘어가지 않는다.
 */
const ANCHOR_MS = termAt(Date.now()).startMs + 30 * DAY + 10 * 3_600_000;
export const ANCHOR = kstLocal(ANCHOR_MS);
export const TERM = termAt(ANCHOR_MS).code;
/** 직전 학기의 한 시점 (재가입 시나리오용). */
export const PREVIOUS_TERM_AT = kstLocal(
  termAt(ANCHOR_MS).startMs - 20 * DAY + 10 * 3_600_000,
);
/** 기준 시각에서 days일 뒤의 KST "YYYY-MM-DDTHH:mm". */
export const at = (/** @type {number} */ days, hhmm = "19:00") =>
  `${kstLocal(ANCHOR_MS + days * DAY).slice(0, 10)}T${hhmm}`;

/** 서버 시계를 KST 벽시계 시각으로 옮긴다. null이면 실제 시각. */
export async function setClock(/** @type {string | null} */ kstLocalTime) {
  const offset = kstLocalTime
    ? new Date(`${kstLocalTime}:00+09:00`).getTime() - Date.now()
    : 0;
  fs.mkdirSync(MEASURE_DIR, { recursive: true });
  fs.writeFileSync(CLOCK_FILE, String(offset));
  await new Promise((r) => setTimeout(r, 400)); // clock.cjs는 200ms마다 다시 읽는다
}

// ---- HTTP ---------------------------------------------------------------------

/** Auth.js 세션 쿠키를 위조한다. name은 "이름 / 신분 / 학과" 형식. */
export async function session(
  /** @type {string} */ email,
  /** @type {string} */ name,
) {
  const token = await encode({
    token: { name, email, sub: `sub-${email}` },
    secret: SECRET,
    salt: "authjs.session-token",
    maxAge: (365 * DAY) / 1000, // 시계를 옮겨도 만료되지 않게
  });
  return `authjs.session-token=${token}`;
}

/** 리디렉트를 따라가지 않는 GET. */
export async function get(
  /** @type {string} */ p,
  /** @type {string} [cookie] */ cookie,
) {
  const res = await fetch(BASE + p, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  return {
    status: res.status,
    location: res.headers.get("location"),
    headers: res.headers,
    text: await res.text(),
  };
}

/**
 * 폼 액션을 `use:enhance`와 같은 형식으로 보내고 ActionResult를 푼다.
 * @param {string} p @param {string | null} name
 * @param {Record<string, string | string[]>} [fields] @param {string} [cookie]
 * @returns {Promise<any>}
 */
export async function action(p, name, fields, cookie) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields ?? {})) {
    for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
  }
  const res = await fetch(`${BASE}${p}${name ? `?/${name}` : ""}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: BASE,
      "x-sveltekit-action": "true",
      accept: "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body,
  });
  const text = await res.text();
  /** @type {any} */
  let result;
  try {
    result = JSON.parse(text);
    if (typeof result.data === "string")
      result.data = devalue.parse(result.data);
  } catch {
    // 가드의 303처럼 JSON이 아닌 응답
    result = { type: "raw", text: text.slice(0, 300) };
  }
  result.httpStatus = res.status;
  return result;
}

// ---- 시드 API (inject/probe-server.ts) ---------------------------------------

/** @param {{ op: "seed" | "put" | "reset", tables?: { name: string, doc: unknown }[], queues?: { event_id: string, doc: unknown }[] }} payload */
export async function probeSeed(payload) {
  const res = await fetch(`${BASE}/api/__probe`, {
    method: "POST",
    headers: { ...PROBE, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw new Error(`probe seed ${res.status} — 실측 서버(start.sh)가 맞나?`);
}
/** 저장된 원본 행 (zod 기본값 적용 전). @returns {Promise<any[]>} */
export async function table(/** @type {string} */ name) {
  const res = await fetch(
    `${BASE}/api/__probe?kind=table&key=${encodeURIComponent(name)}`,
    {
      headers: PROBE,
    },
  );
  const doc = await res.json();
  return doc?.rows ?? [];
}
/** @returns {Promise<any[]>} */
export async function queue(/** @type {string} */ eventId) {
  const res = await fetch(
    `${BASE}/api/__probe?kind=queue&key=${encodeURIComponent(eventId)}`,
    {
      headers: PROBE,
    },
  );
  const doc = await res.json();
  return doc?.rows ?? [];
}
export async function putRows(
  /** @type {string} */ name,
  /** @type {unknown[]} */ rows,
) {
  await probeSeed({
    op: "put",
    tables: [{ name, doc: { schemaVersion: 1, rows } }],
  });
}
/** 관리자 폴링 API. @returns {Promise<any>} */
export async function adminQueue(
  /** @type {string} */ kind,
  /** @type {string} */ cookie,
) {
  const res = await fetch(`${BASE}/api/admin/${kind}`, { headers: { cookie } });
  return res.json();
}
