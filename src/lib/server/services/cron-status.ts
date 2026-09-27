/**
 * What a cron job reports, and how its isolated steps report into it.
 *
 * `runCron` and `runMaintenance` deliberately isolate each step so one bad
 * step does not starve the rest — which means the route around them cannot
 * learn anything from a try/catch, and every run used to look green.
 *
 * Failure used to travel as a spelling in the counter map (`<step>_failed: 1`,
 * `keptAlive: false`, `<phase>_errors: n`) that only the reader knew; a
 * producer that spelled it any other way read as success, as the weekly
 * backup push once did (audit LB19-1). A failure now goes on its own channel,
 * `failures`, and the route alarms on that list alone. The counters are for
 * the log and the response body; nothing reads meaning into their names.
 */
export interface CronReport {
  /** Counters for the log and the response body. */
  counts: Record<string, number | boolean>;
  /** The steps that failed, as `<step>_failed`. Empty = a green run. */
  failures: string[];
}

export function newCronReport(): CronReport {
  return { counts: {}, failures: [] };
}

/** Record a failure the step noticed without throwing. */
export function markFailed(report: CronReport, step: string): void {
  report.failures.push(`${step}_failed`);
}

/**
 * Run one isolated step: its counters join the report; a throw is logged and
 * recorded as the step's failure, and the caller goes on to the next step.
 * Resolves to whether the step finished.
 */
export async function runIsolated(
  report: CronReport,
  step: string,
  run: () => Promise<Record<string, number | boolean>>,
  logPrefix = "[Cron]",
): Promise<boolean> {
  try {
    Object.assign(report.counts, await run());
    return true;
  } catch (e) {
    console.error(`${logPrefix} step '${step}' failed:`, e);
    markFailed(report, step);
    return false;
  }
}
