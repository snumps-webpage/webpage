// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";

describe("client mutation regressions", () => {
  for (const [scenario, behavior] of [
    ["confirmation", "cancelled withdrawal sends no POST"],
    ["admin-event", "event changes preserve the latest server row"],
    ["admin-attendance", "attendance changes preserve the latest server row"],
    ["poster-retention", "validation failures retain uploaded posters"],
    [
      "poster-mode-switch",
      "uploading poster fields survive mode-switch attempts",
    ],
    [
      "poster-upload",
      "request submission waits for poster upload and clears replaced keys",
    ],
    ["admin-poster-upload", "admin creation waits for poster upload"],
    [
      "attendance-race",
      "previous event responses do not alter current attendance",
    ],
  ]) {
    it(behavior, () => {
      execFileSync(
        process.execPath,
        [
          "--conditions=browser",
          "scripts/test/ui-regression-runtime.mjs",
          scenario,
        ],
        {
          cwd: process.cwd(),
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15_000,
        },
      );
    });
  }
});
