import { env } from "$env/dynamic/private";
import { readDoc, readVersion } from "$lib/server/data/store";
import {
  listBackups,
  listStaged,
  removeBackups,
  removeStaged,
  uploadToBackups,
} from "$lib/server/data/storage";
import { TABLE_NAMES } from "$lib/server/data/schemas";

/**
 * Maintenance job (SUPABASE-MIGRATION-SPEC §5 잡3, R2-9): staging cleanup,
 * keep-alive SELECT, and the Sunday backup branch (§7 B1/B2 + B1 retention).
 * Its own endpoint (/api/cron/maintenance) — deliberately NOT a sync-events
 * CronStep, so the hourly job stays cheap and the daily job owns the DB-touch
 * cadence.
 */

export const STAGING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BACKUP_RETENTION_MS = 8 * 7 * 24 * 60 * 60 * 1000; // B1: 8-week rotation

const STAGING_PREFIX = "pending";
const DUMPS_PREFIX = "dumps";

/**
 * One REAL DB read — resets Supabase's 7-day inactivity pause timer, which
 * counts DB query activity only (spec §0/§5, R1-12). Deliberately calls
 * readVersion on the store seam instead of getTable(): getTable is wrapped in
 * withCache + the conditional-GET version cache, so it could answer without
 * ever touching Postgres — which would NOT count as activity.
 */
export async function keepAliveSelect(): Promise<boolean> {
  await readVersion("table", "members");
  return true;
}

/**
 * Storage listings return names that may be prefix-relative (real Supabase
 * `.list(prefix)`) or full paths (memory backend) — normalize to full paths.
 */
function fullPath(prefix: string, name: string): string {
  return name.startsWith(`${prefix}/`) ? name : `${prefix}/${name}`;
}

/** Reap staged uploads older than STAGING_TTL_MS. Returns the removed count. */
export async function cleanupStaging(now: Date = new Date()): Promise<number> {
  const cutoff = now.getTime() - STAGING_TTL_MS;
  const entries = await listStaged(STAGING_PREFIX);
  const stale = entries.filter((e) => {
    if (e.createdAt === "") return false; // folder placeholder rows — skip
    const created = Date.parse(e.createdAt);
    return Number.isFinite(created) && created < cutoff;
  });
  const paths = stale.map((e) => fullPath(STAGING_PREFIX, e.name));
  await removeStaged(paths);
  return paths.length;
}

// B2 missing-env skip is logged once per process, not once per Sunday run.
let warnedMissingBackupEnv = false;

/** B2 (spec §7): push the dump to a private GitHub repo via the contents API. */
async function pushDumpToGitHub(path: string, body: string): Promise<boolean> {
  const repo = env.GITHUB_BACKUP_REPO;
  const token = env.GITHUB_BACKUP_TOKEN;
  if (!repo || !token) {
    if (!warnedMissingBackupEnv) {
      warnedMissingBackupEnv = true;
      console.warn("[maintenance] GITHUB_BACKUP_REPO/TOKEN not set — skipping B2 push");
    }
    return false;
  }
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
  try {
    // The contents API requires the current sha to overwrite; 404 means new file.
    let sha: string | undefined;
    const existing = await fetch(url, { headers });
    if (existing.ok) {
      sha = ((await existing.json()) as { sha?: string }).sha;
    }
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `backup: ${path}`,
        content: Buffer.from(body, "utf-8").toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`[maintenance] B2 GitHub push failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[maintenance] B2 GitHub push failed:", e);
    return false;
  }
}

/** B1 retention: drop dump objects older than 8 weeks. Never fails the backup. */
async function pruneOldDumps(now: Date): Promise<void> {
  try {
    const cutoff = now.getTime() - BACKUP_RETENTION_MS;
    const entries = await listBackups(DUMPS_PREFIX);
    const old = entries
      .filter((e) => {
        if (e.createdAt === "") return false;
        const created = Date.parse(e.createdAt);
        return Number.isFinite(created) && created < cutoff;
      })
      .map((e) => fullPath(DUMPS_PREFIX, e.name));
    await removeBackups(old);
  } catch (e) {
    console.error("[maintenance] B1 retention prune failed:", e);
  }
  // TODO(§7 B3, 잡3): assets-mirror/ 90-day cleanup — needs original-deletion
  // tracking, whose data linkage lands with the MIG track. Not implemented here.
}

/**
 * Weekly backup (spec §7 B1+B2): one JSON dump of every app_tables document
 * into the backups bucket, then the same JSON pushed off-platform to GitHub.
 *
 * audit_log is SKIPPED: audit rows are append-only in Postgres, not a document
 * readable via readDoc. TODO(§7): audit_log export needs a select API that is
 * not yet on the store seam — do not invent one here; the same dump cadence
 * can cover it once that API exists.
 */
export async function runWeeklyBackup(
  now: Date = new Date(),
): Promise<{ dumped: number; pushed: boolean }> {
  const tables: Record<string, unknown> = {};
  let dumped = 0;
  for (const name of TABLE_NAMES) {
    const stored = await readDoc("table", name);
    if (stored) {
      tables[name] = stored.doc;
      dumped++;
    }
  }
  const body = JSON.stringify({ generatedAt: now.toISOString(), tables });
  const path = `${DUMPS_PREFIX}/${now.toISOString().slice(0, 10)}.json`;

  await uploadToBackups(path, body); // B1
  const pushed = await pushDumpToGitHub(path, body); // B2 — never throws
  await pruneOldDumps(now); // 8-week rotation — never throws

  return { dumped, pushed };
}

/**
 * Dead-man's switch ping (spec §5-3): call ONLY on SUCCESS paths, so
 * Healthchecks' grace window catches every silence mode — scheduler death,
 * deploy accidents, and project pause alike. Failures are ignored: the ping
 * must never fail the cron that just succeeded.
 */
export async function pingHeartbeat(): Promise<void> {
  const url = env.HEALTHCHECKS_PING_URL;
  if (!url) return;
  try {
    await fetch(url);
  } catch {
    // ignored — see above
  }
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function isSundayKst(now: Date): boolean {
  return new Date(now.getTime() + KST_OFFSET_MS).getUTCDay() === 0;
}

/**
 * The daily maintenance run (잡3). Each phase is try/catch-isolated like
 * runCron — one failing phase reports itself without starving the others.
 */
export async function runMaintenance(
  now: Date = new Date(),
): Promise<Record<string, number | boolean>> {
  const results: Record<string, number | boolean> = {};

  try {
    results.keptAlive = await keepAliveSelect();
  } catch (e) {
    console.error("[maintenance] keep-alive failed:", e);
    results.keptAlive = false;
  }

  try {
    results.stagedRemoved = await cleanupStaging(now);
  } catch (e) {
    console.error("[maintenance] staging cleanup failed:", e);
    results.cleanup_failed = 1;
  }

  if (isSundayKst(now)) {
    try {
      Object.assign(results, await runWeeklyBackup(now));
    } catch (e) {
      console.error("[maintenance] weekly backup failed:", e);
      results.backup_failed = 1;
    }
  }

  return results;
}
