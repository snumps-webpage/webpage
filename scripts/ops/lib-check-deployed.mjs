// The decision behind scripts/ops/check-deployed.mjs, kept free of I/O so it
// is tested (src/lib/server/ops-check-deployed.test.ts). The script gathers the
// facts — the live /api/version, the reference commit, git ancestry — and this
// says what they mean.

/**
 * @typedef {{ sha: string | null, appKey: string | null, builtAt: string | null }} BuildInfo
 * @typedef {{ name: string, sha: string, appKey: string }} Ref
 * @typedef {{
 *   deployed: BuildInfo | null,
 *   ref: Ref,
 *   known: boolean,
 *   deployedKeyOfSha: string | null,
 *   deployedIsAncestor: boolean,
 *   refIsAncestor: boolean,
 * }} Facts
 *   known: the live commit exists in this clone. deployedKeyOfSha: the app key
 *   of that commit as computed here (null when unknown). The two ancestry flags
 *   relate the live commit and the reference.
 * @typedef {"latest" | "same-app" | "behind" | "ahead" | "diverged" | "no-stamp" | "unknown-commit" | "content-mismatch"} State
 */

/**
 * Exit codes: 0 the live site is the reference (or differs only in files the
 * app key leaves out — docs, ops scripts, root *.md), 1 it is not, 2 cannot
 * tell.
 * @param {Facts} f
 * @returns {{ code: 0 | 1 | 2, state: State, message: string }}
 */
export function verdict(f) {
  const live = f.deployed;
  if (!live?.sha) {
    return {
      code: 2,
      state: "no-stamp",
      message:
        "배포본에 빌드 정보가 없다 — 이 기능 이전의 배포이거나 release-prod.sh 밖에서 배포됐다.",
    };
  }
  if (
    f.known &&
    live.appKey &&
    f.deployedKeyOfSha &&
    live.appKey !== f.deployedKeyOfSha
  ) {
    return {
      code: 2,
      state: "content-mismatch",
      message: `배포본이 자기 커밋(${short(live.sha)})과 다른 내용으로 빌드됐다 — 커밋되지 않은 변경이 섞인 빌드일 수 있다.`,
    };
  }
  if (live.sha === f.ref.sha) {
    return {
      code: 0,
      state: "latest",
      message: `최신 — 배포본이 ${f.ref.name}(${short(f.ref.sha)})이다.`,
    };
  }
  if (live.appKey && live.appKey === f.ref.appKey) {
    return {
      code: 0,
      state: "same-app",
      message: `앱 코드는 최신 — 배포본(${short(live.sha)})과 ${f.ref.name}(${short(f.ref.sha)})은 문서·운영 스크립트만 다르다.`,
    };
  }
  if (!f.known) {
    return {
      code: 2,
      state: "unknown-commit",
      message: `배포된 커밋 ${short(live.sha)}이 이 저장소에 없다 — git fetch 했는지, 다른 브랜치에서 배포했는지 볼 것.`,
    };
  }
  if (f.deployedIsAncestor) {
    return {
      code: 1,
      state: "behind",
      message: `뒤처짐 — 배포본(${short(live.sha)}) 뒤로 ${f.ref.name}(${short(f.ref.sha)})에 앱 변경이 있다.`,
    };
  }
  if (f.refIsAncestor) {
    return {
      code: 1,
      state: "ahead",
      message: `배포본(${short(live.sha)})이 ${f.ref.name}(${short(f.ref.sha)})보다 앞서 있다 — 기준이 오래됐거나 main에 아직 없는 커밋을 배포했다.`,
    };
  }
  return {
    code: 1,
    state: "diverged",
    message: `배포본(${short(live.sha)})과 ${f.ref.name}(${short(f.ref.sha)})이 갈라져 있다 — 다른 브랜치에서 배포됐다.`,
  };
}

/** @param {string} sha */
const short = (sha) => sha.slice(0, 7);
