import { describe, expect, it, vi } from "vitest";
import { markFailed, newCronReport, runIsolated } from "./cron-status";

/**
 * The defect this guards against: `runCron`/`runMaintenance` never throw, so the
 * routes' try/catch could not see a failed step and every run reported 200
 * `success: true` — including a run in which nothing worked. The census read
 * failure out of counter names, and a spelling it did not know read as green
 * (audit LB19-1). Failures now travel on their own channel.
 */
describe("cron report", () => {
  it("an all-green run has counters and no failures", async () => {
    const report = newCronReport();
    await runIsolated(report, "expire", async () => ({ expired: 0 }));
    await runIsolated(report, "keepalive", async () => ({ keptAlive: true }));

    expect(report).toEqual({
      counts: { expired: 0, keptAlive: true },
      failures: [],
    });
  });

  it("a step that throws is a failure; the next step still runs", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const report = newCronReport();
      const first = await runIsolated(report, "cleanup", async () => {
        throw new Error("boom");
      });
      const second = await runIsolated(report, "backup", async () => ({
        dumped: 1,
      }));

      expect([first, second]).toEqual([false, true]);
      expect(report.failures).toEqual(["cleanup_failed"]);
      expect(report.counts).toEqual({ dumped: 1 });
    } finally {
      error.mockRestore();
    }
  });

  it("a failure noticed without a throw is reported explicitly", () => {
    // `pushed: false` is ALSO the not-configured value, so the push failure
    // has to be marked or the weekly backup fails behind a green check.
    const report = newCronReport();
    report.counts.pushed = false;
    markFailed(report, "backup_push");

    expect(report.failures).toEqual(["backup_push_failed"]);
  });

  it("no counter name means failure any more", async () => {
    const report = newCronReport();
    await runIsolated(report, "odd", async () => ({
      keptAlive: false,
      legacy_failed: 1,
      generation_errors: 4,
    }));

    expect(report.failures).toEqual([]);
  });
});
