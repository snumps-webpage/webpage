/**
 * Supabase CLI로 SQL을 돌리는 공용 부분 — `supabase login` 세션 하나로 dev·prod를
 * 프로젝트 ref로 고른다(`db query --linked --project-ref`, 로컬 링크는 바꾸지 않는다).
 * ops-fix-approval-dates.mjs·ops-notion-backfill-body.mjs가 쓴다(같은 코드가
 * ops-add-member.mjs 안에도 있다).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./lib-env.mjs";

export const REF = {
  prod: "rwlvnttpaqkhpebtebif",
  dev: "gcahkryexewswzvtfltj",
};

/** @param {string} out */
function parseJson(out) {
  const starts = [out.indexOf("{"), out.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const end = Math.max(out.lastIndexOf("}"), out.lastIndexOf("]"));
  try {
    return JSON.parse(out.slice(Math.min(...starts), end + 1));
  } catch {
    return null;
  }
}

/** CLI 출력에서 오류 문구만 — SQL 본문(base64 입력)은 되풀이하지 않는다. @param {string} out */
function cliError(out) {
  const json = parseJson(out);
  const message =
    json?.error?.message ?? json?.message ?? json?.error ?? undefined;
  const text =
    typeof message === "string"
      ? message
      : (out
          .split("\n")
          .find((l) => /error|ERROR|not found|login|link/i.test(l)) ??
        "원인 불명");
  return text.slice(0, 400);
}

/** 행 배열을 찾는다 — 모르는 형식이면 성공으로 치지 않고 던진다. @param {string} out */
function rowsOf(out) {
  const json = parseJson(out);
  if (Array.isArray(json)) return json;
  /** @param {unknown} v @returns {unknown[] | null} */
  const find = (v) => {
    if (v && typeof v === "object") {
      const o = /** @type {Record<string, unknown>} */ (v);
      if (Array.isArray(o.rows)) return o.rows;
      for (const x of Object.values(o)) {
        const r = find(x);
        if (r) return r;
      }
    }
    return null;
  };
  const rows = find(json);
  if (!rows) throw new Error("조회 결과를 읽지 못했다 (CLI 출력 형식).");
  return rows;
}

/**
 * 대상 프로젝트에 SQL을 돌리는 함수를 만든다. SQL 파일은 소유자 전용 임시
 * 디렉터리에 쓰고 곧바로 지운다. stdin을 닫아 숨은 프롬프트에서 멈추지 않는다.
 * @param {keyof typeof REF} target
 * @returns {(sql: string) => Record<string, unknown>[]}
 */
export function queryFor(target) {
  const workDir = mkdtempSync(path.join(tmpdir(), "ops-sql-"));
  process.once("exit", () => rmSync(workDir, { recursive: true, force: true }));
  return (sql) => {
    const file = path.join(workDir, "q.sql");
    writeFileSync(file, sql, { mode: 0o600 });
    const res = spawnSync(
      "supabase",
      [
        "--workdir",
        REPO_ROOT,
        "db",
        "query",
        "--linked",
        "--project-ref",
        REF[target],
        "--output-format",
        "json",
        "-f",
        file,
      ],
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
    );
    rmSync(file, { force: true });
    if (res.error) {
      const code = /** @type {NodeJS.ErrnoException} */ (res.error).code;
      throw new Error(
        code === "ENOENT"
          ? "supabase CLI가 없다."
          : `supabase 실행 실패: ${res.error.message}`,
      );
    }
    const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
    if (res.status !== 0) throw new Error(cliError(out));
    return /** @type {Record<string, unknown>[]} */ (rowsOf(out));
  };
}
