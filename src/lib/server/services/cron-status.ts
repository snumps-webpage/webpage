/**
 * Failure census for the cron endpoints.
 *
 * `runCron` and `runMaintenance` deliberately isolate each step/phase and report
 * failure as a key in the result map rather than throwing (see their bodies).
 * That keeps one bad step from starving the rest — but it also means the route
 * around them cannot learn anything from a try/catch: the catch is unreachable,
 * so every run looked like a success and the dead-man's switch was pinged even
 * when nothing worked.
 *
 * The routes ask this helper instead. Failure is spelled three ways in those
 * result maps, so the rule is spelled out here once:
 *
 *   - `<step>_failed: 1`     a step threw and the loop caught it
 *   - `<phase>_errors: n`    a step swallowed per-item errors internally
 *   - `keptAlive: false`     the keep-alive SELECT did not reach Postgres
 */
export function cronFailures(
  results: Record<string, number | boolean>,
): string[] {
  return Object.entries(results)
    .filter(([key, value]) => {
      if (key === "keptAlive") return value === false;
      if (key.endsWith("_failed")) return value !== 0 && value !== false;
      if (key.endsWith("_errors"))
        return typeof value === "number" && value > 0;
      return false;
    })
    .map(([key]) => key);
}
