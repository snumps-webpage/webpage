import { describe, expect, it } from "vitest";
import { readBuildInfo } from "./build-info";
import { GET } from "../../routes/api/version/+server";

const SHA = "a".repeat(40);
const KEY = "b".repeat(40);

/**
 * scripts/ops/release-prod.sh passes the commit and its app key to the
 * Vercel build (--build-env VITE_BUILD_*); /api/version answers them so
 * scripts/ops/check-deployed.mjs can tell what the live site was built from.
 */
describe("readBuildInfo", () => {
  it("reads the stamp the release passes to the build", () => {
    expect(
      readBuildInfo({
        VITE_BUILD_SHA: SHA,
        VITE_BUILD_APP_KEY: KEY,
        VITE_BUILD_AT: "2026-10-06T01:02:03Z",
      }),
    ).toEqual({ sha: SHA, appKey: KEY, builtAt: "2026-10-06T01:02:03Z" });
  });

  it("answers nulls for a build with no stamp (dev, or a deploy made elsewhere)", () => {
    expect(readBuildInfo({})).toEqual({
      sha: null,
      appKey: null,
      builtAt: null,
    });
  });

  it("drops a value that is not what the release writes", () => {
    expect(
      readBuildInfo({
        VITE_BUILD_SHA: "main",
        VITE_BUILD_APP_KEY: `${KEY}\n`,
        VITE_BUILD_AT: "yesterday",
      }),
    ).toEqual({ sha: null, appKey: null, builtAt: null });
  });
});

describe("GET /api/version", () => {
  it("answers the build info uncached — a stale copy would report an old build", async () => {
    const res = await GET({} as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(await res.json()).sort()).toEqual([
      "appKey",
      "builtAt",
      "sha",
    ]);
  });
});
