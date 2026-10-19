// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Vercel's nodejs22.x runtime refuses require() of an ES-only module, which
 * local Node 24 allows — so sanitize-html 2.18.0 (CommonJS, requiring the
 * ES-only htmlparser2 12) passed every local test yet answered 500 on the
 * preview deploy with ERR_REQUIRE_ESM (snumps-webpage/D-000172). Load it the
 * way that runtime does.
 */
describe("sanitize-html under a runtime without require(esm)", () => {
  it("loads with --no-experimental-require-module", () => {
    const out = execFileSync(
      process.execPath,
      [
        "--no-experimental-require-module",
        "-e",
        "require('sanitize-html'); process.stdout.write('load OK')",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(out).toBe("load OK");
  });
});
