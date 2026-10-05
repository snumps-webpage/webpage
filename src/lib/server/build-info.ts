/**
 * What this build was made from. scripts/ops/release-prod.sh passes the commit,
 * its app key (scripts/ops/app-key.sh) and the build time to the Vercel build
 * as `--build-env VITE_BUILD_*`; Vite inlines them here. A build without them
 * (dev, or a deploy made outside the release script) answers nulls.
 *
 * Read by GET /api/version, which scripts/ops/check-deployed.mjs compares with
 * git. Nothing here is secret: a commit hash and a content hash.
 */
export interface BuildInfo {
  sha: string | null;
  appKey: string | null;
  builtAt: string | null;
}

const HASH = /^[0-9a-f]{40}$/;
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function readBuildInfo(
  env: Record<string, string | undefined> = {
    VITE_BUILD_SHA: import.meta.env.VITE_BUILD_SHA,
    VITE_BUILD_APP_KEY: import.meta.env.VITE_BUILD_APP_KEY,
    VITE_BUILD_AT: import.meta.env.VITE_BUILD_AT,
  },
): BuildInfo {
  const match = (value: string | undefined, pattern: RegExp) =>
    typeof value === "string" && pattern.test(value) ? value : null;
  return {
    sha: match(env.VITE_BUILD_SHA, HASH),
    appKey: match(env.VITE_BUILD_APP_KEY, HASH),
    builtAt: match(env.VITE_BUILD_AT, UTC_TIME),
  };
}
