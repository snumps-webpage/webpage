// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { build, loadConfigFromFile } from "vite";

/**
 * D-000172: the deployed Node 22 runtime must work without require(esm).
 * sanitize-html's security patch requires the ES-only htmlparser2, so the
 * app bundles that CommonJS boundary through Vite. Test the actual sanitizer
 * entry with the production SSR settings, not an upstream require() that
 * bypasses our bundle. Removing the bundling setting must break this test.
 */
describe("the sanitizer SSR artifact without require(esm)", () => {
  it("loads and sanitizes malicious and safe HTML", async () => {
    const root = process.cwd();
    const config = await loadConfigFromFile(
      { command: "build", mode: "production" },
      path.join(root, "vite.config.ts"),
    );
    if (!config) throw new Error("The production Vite config was not loaded");
    const scratch = path.join(root, ".tmp");
    mkdirSync(scratch, { recursive: true });
    const outDir = mkdtempSync(path.join(scratch, "sanitize-ssr-"));
    // No SvelteKit app build is needed: this entry has no framework imports.
    // Reuse the real SSR config so this exercises the production CJS boundary.
    await build({
      configFile: false,
      logLevel: "silent",
      ssr: config.config.ssr,
      build: {
        ssr: path.join(root, "src/lib/server/mail/broadcast/sanitize.ts"),
        outDir,
        emptyOutDir: false,
        minify: false,
        rollupOptions: { output: { entryFileNames: "sanitize.mjs" } },
      },
    });
    const child = spawnSync(
      process.execPath,
      [
        "--no-experimental-require-module",
        "--input-type=module",
        "-e",
        `import { writeFileSync } from 'node:fs';
         const { sanitizeMailHtml } = await import(process.argv[1]);
         writeFileSync(1, JSON.stringify({
           malicious: sanitizeMailHtml('<div><noscript></div><img src="https://audit.invalid/beacon.gif"></noscript>'),
           safe: sanitizeMailHtml('<p><strong>Safe</strong> <a href="https://example.org/">link</a></p>')
         }));`,
        pathToFileURL(path.join(outDir, "sanitize.mjs")).href,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      malicious: "<div></div>",
      safe: '<p><strong>Safe</strong> <a href="https://example.org/">link</a></p>',
    });
  }, 15_000);
});
