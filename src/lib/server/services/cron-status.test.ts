import { describe, expect, it } from "vitest";
import { cronFailures } from "./cron-status";

/**
 * The defect this guards against: `runCron`/`runMaintenance` never throw, so the
 * routes' try/catch could not see a failed step and every run reported 200
 * `success: true` — including a run in which nothing worked. The census is the
 * only thing standing between that and a false-green cron.
 */
describe("cronFailures", () => {
  it("finds nothing in an all-green run", () => {
    expect(
      cronFailures({
        expired: 0,
        generated: 3,
        keptAlive: true,
        steps_total: 2,
      }),
    ).toEqual([]);
  });

  it("catches a step the runner caught and flagged", () => {
    expect(
      cronFailures({ expired: 1, "generate-study-sessions_failed": 1 }),
    ).toEqual(["generate-study-sessions_failed"]);
  });

  it("catches errors a step swallowed internally and reported as a count", () => {
    // studySessionCronStep skips a bad entry and keeps going; without the count
    // a run where every entry failed looks like a run with nothing to do.
    expect(cronFailures({ generated: 0, generation_errors: 4 })).toEqual([
      "generation_errors",
    ]);
    expect(cronFailures({ generated: 2, generation_errors: 0 })).toEqual([]);
  });

  it("treats a false keep-alive as a failure — it is spelled differently", () => {
    expect(cronFailures({ keptAlive: false, stagedRemoved: 2 })).toEqual([
      "keptAlive",
    ]);
  });

  it("reports every failing phase of a total maintenance failure", () => {
    expect(
      cronFailures({ keptAlive: false, cleanup_failed: 1, backup_failed: 1 }),
    ).toEqual(["keptAlive", "cleanup_failed", "backup_failed"]);
  });

  it("does not mistake ordinary counters for failures", () => {
    expect(
      cronFailures({ expired: 7, generated: 9, stagedRemoved: 3, dumped: 1 }),
    ).toEqual([]);
  });
});
