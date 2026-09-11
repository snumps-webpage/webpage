import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SvelteKit builds `$env/dynamic/private` by DROPPING every key that starts
 * with the public prefix (`PUBLIC_` by default) — see filter_env in
 * @sveltejs/kit runtime/server/index.js. A server module that reads
 * `env.PUBLIC_X` from the private module therefore always gets undefined, no
 * matter what is configured. Test mocks of `$env/dynamic/private` do not
 * apply that filter, so only a check on the source itself can catch it.
 */

const SRC = join(process.cwd(), "src");
const IMPORTS_PRIVATE_ENV = /from\s+["']\$env\/dynamic\/private["']/;
const READS_PUBLIC_KEY = /\benv(?:\.|\[\s*["'])PUBLIC_\w*/g;

function sourceFiles(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((f) => /\.(ts|js|svelte)$/.test(f) && !/\.(test|spec)\./.test(f))
    .map((f) => join(SRC, f));
}

describe("private env access", () => {
  it("never reads a PUBLIC_-prefixed key from $env/dynamic/private", () => {
    const offenders = sourceFiles().flatMap((file) => {
      const text = readFileSync(file, "utf-8");
      if (!IMPORTS_PRIVATE_ENV.test(text)) return [];
      return [...text.matchAll(READS_PUBLIC_KEY)].map(
        (m) => `${file.slice(SRC.length + 1)}: ${m[0]}`,
      );
    });

    expect(offenders).toEqual([]);
  });
});
