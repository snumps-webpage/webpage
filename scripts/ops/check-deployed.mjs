#!/usr/bin/env node
// Is the live site the latest build? Reads what the site says it was built
// from (GET /api/version — the stamp release-prod.sh puts into the build) and
// compares it with a git reference, by commit and by app key
// (scripts/ops/app-key.sh). Read-only: no deploy, no DB, no login.
//
// usage: node scripts/ops/check-deployed.mjs [URL] [--ref REF] [--no-fetch]
//   URL   default https://snumps.vercel.app (a preview URL works too)
//   REF   default origin/main, fetched first unless --no-fetch
// exit:  0 up to date (or only docs/ops scripts differ), 1 not the reference,
//        2 cannot tell (no stamp, unknown commit, no answer)
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verdict } from "./lib-check-deployed.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const DEFAULT_SITE = "https://snumps.vercel.app";

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`check-deployed: ${message}`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let site = DEFAULT_SITE;
let ref = "origin/main";
let fetchFirst = true;
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--ref") ref = argv[++i] ?? fail("--ref 뒤에 ref가 없다.");
  else if (arg === "--no-fetch") fetchFirst = false;
  else if (arg === "-h" || arg === "--help") {
    console.log(
      "usage: node scripts/ops/check-deployed.mjs [URL] [--ref REF] [--no-fetch]",
    );
    process.exit(0);
  } else if (arg.startsWith("-")) fail(`모르는 옵션: ${arg}`);
  else site = arg;
}

/** @param {string[]} args */
const git = (...args) =>
  execFileSync("git", args, {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
/** @param {string[]} args */
const gitOk = (...args) =>
  spawnSync("git", args, { cwd: REPO, stdio: "ignore" }).status === 0;
/** @param {string} commit */
const appKey = (commit) =>
  execFileSync("bash", [path.join(HERE, "app-key.sh"), commit], {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

// 1. the reference
if (fetchFirst && ref.startsWith("origin/")) {
  if (!gitOk("fetch", "--quiet", "origin")) {
    console.warn(
      `check-deployed: git fetch 실패 — 마지막으로 받아 둔 ${ref} 기준으로 본다.`,
    );
  }
}
if (!gitOk("rev-parse", "--verify", "--quiet", `${ref}^{commit}`)) {
  fail(`기준 ref를 찾지 못했다: ${ref}`);
}
const refSha = git("rev-parse", `${ref}^{commit}`);
const refInfo = { name: ref, sha: refSha, appKey: appKey(refSha) };

// 2. what the live site says
const url = new URL("/api/version", site);
url.searchParams.set("t", String(Date.now())); // past any cache in the way
/** @type {Response} */
let res;
try {
  res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
} catch (e) {
  fail(`${url.origin} 에 닿지 못했다: ${e instanceof Error ? e.message : e}`);
}
/** @type {{ sha: string | null, appKey: string | null, builtAt: string | null } | null} */
let deployed = null;
if (res.status === 404) {
  console.warn("check-deployed: /api/version 이 404 — 이 기능 이전의 배포다.");
} else if (!res.ok) {
  fail(
    `/api/version 이 ${res.status} 로 답했다${res.status === 401 ? " (배포 보호가 켜진 프리뷰?)" : ""}.`,
  );
} else {
  /** @type {unknown} */
  let body;
  try {
    body = await res.json();
  } catch {
    fail("/api/version 응답이 JSON이 아니다.");
  }
  /** @param {unknown} v */
  const str = (v) => (typeof v === "string" ? v : null);
  const b = /** @type {Record<string, unknown>} */ (body ?? {});
  deployed = {
    sha: str(b.sha),
    appKey: str(b.appKey),
    builtAt: str(b.builtAt),
  };
}

// 3. how the two relate in git
const liveSha = deployed?.sha ?? null;
const known = !!liveSha && gitOk("cat-file", "-e", `${liveSha}^{commit}`);
const facts = {
  deployed,
  ref: refInfo,
  known,
  deployedKeyOfSha: known && liveSha ? appKey(liveSha) : null,
  deployedIsAncestor:
    known && !!liveSha && gitOk("merge-base", "--is-ancestor", liveSha, refSha),
  refIsAncestor:
    known && !!liveSha && gitOk("merge-base", "--is-ancestor", refSha, liveSha),
};
const v = verdict(facts);

console.log(`사이트  ${url.origin}`);
console.log(
  `배포본  ${liveSha ?? "(빌드 정보 없음)"}${deployed?.builtAt ? `  빌드 ${deployed.builtAt}` : ""}`,
);
console.log(`기준    ${refSha}  (${ref})`);
console.log(`\n${v.message}`);
if (v.state === "behind" && liveSha) {
  const range = `${liveSha}..${refSha}`;
  const appCommits = git(
    "log",
    "--oneline",
    "--no-decorate",
    range,
    "--",
    ".",
    ":(exclude)docs",
    ":(exclude)scripts",
    ":(exclude,glob)*.md",
  );
  const total = git("rev-list", "--count", range);
  const lines = appCommits ? appCommits.split("\n") : [];
  console.log(
    `\n배포되지 않은 커밋 ${total}개 중 앱에 영향 있는 것 ${lines.length}개:`,
  );
  for (const line of lines.slice(0, 30)) console.log(`  ${line}`);
  if (lines.length > 30) console.log(`  … 외 ${lines.length - 30}개`);
}
process.exit(v.code);
