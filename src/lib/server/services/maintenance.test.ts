import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock(
  "$lib/server/data/storage",
  () => import("$lib/server/data/storage-memory"),
);

import {
  __putRawDoc,
  __reset as __resetStore,
  __sql,
} from "$lib/server/data/store-memory";
import {
  __exists,
  __readText,
  __reset as __resetStorage,
  __setCreatedAt,
  __stage,
  uploadToBackups,
} from "$lib/server/data/storage-memory";
import {
  STAGING_TTL_MS,
  cleanupStaging,
  runMaintenance,
  runWeeklyBackup,
} from "./maintenance";

const DAY_MS = 24 * 60 * 60 * 1000;

// 04:00 KST run times (§5-1 잡3). 2026-08-23 was a Sunday, 2026-08-24 a Monday.
const SUNDAY_KST = new Date("2026-08-23T04:00:00+09:00");
const MONDAY_KST = new Date("2026-08-24T04:00:00+09:00");

const dumpPathFor = (now: Date) =>
  `dumps/${now.toISOString().slice(0, 10)}.json`;

beforeEach(() => {
  __resetStore();
  __resetStorage();
  for (const key of Object.keys(testEnv)) delete testEnv[key];
});

describe("cleanupStaging", () => {
  // Uploads land at pending/<purpose>/<file> (uploads.ts), one folder below the
  // listing prefix — and the storage listing is not recursive.
  it("reaches files inside every purpose folder and removes only those older than 7 days", async () => {
    const now = MONDAY_KST;
    const oldIso = new Date(
      now.getTime() - STAGING_TTL_MS - DAY_MS,
    ).toISOString();
    const freshIso = new Date(now.getTime() - DAY_MS).toISOString();
    __stage("pending/seminar-photo/old.png", 100, "image/png", oldIso);
    __stage("pending/seminar-photo/fresh.png", 100, "image/png", freshIso);
    __stage("pending/gallery-photo/old.jpg", 100, "image/jpeg", oldIso);

    const removed = await cleanupStaging(now);

    expect(removed).toBe(2);
    expect(__exists("staging", "pending/seminar-photo/old.png")).toBe(false);
    expect(__exists("staging", "pending/gallery-photo/old.jpg")).toBe(false);
    expect(__exists("staging", "pending/seminar-photo/fresh.png")).toBe(true);
  });

  it("leaves staged files outside pending/ alone", async () => {
    const oldIso = new Date(
      MONDAY_KST.getTime() - STAGING_TTL_MS - DAY_MS,
    ).toISOString();
    __stage("other/old.png", 100, "image/png", oldIso);

    expect(await cleanupStaging(MONDAY_KST)).toBe(0);
    expect(__exists("staging", "other/old.png")).toBe(true);
  });

  it("returns 0 on an empty staging area", async () => {
    expect(await cleanupStaging(MONDAY_KST)).toBe(0);
  });
});

describe("runWeeklyBackup", () => {
  it("dumps every present table into one backups object; pushed=false without env", async () => {
    __putRawDoc("table", "members", { schemaVersion: 1, rows: [] });
    __putRawDoc("table", "events", { schemaVersion: 1, rows: [] });

    const { dumped, pushed } = await runWeeklyBackup(SUNDAY_KST);

    expect(dumped).toBe(2);
    expect(pushed).toBe(false);
    expect(__exists("backups", dumpPathFor(SUNDAY_KST))).toBe(true);
  });

  // The dump used to hold app_tables only: attendance queues and the audit
  // log were missing, and the tables were read one by one — an approval
  // committing mid-dump could leave the person in neither table (audit
  // LB24-1, LB24-4). It is now one snapshot of all three.
  it("dumps tables, attendance queues and the audit log from one snapshot", async () => {
    __putRawDoc("table", "members", { schemaVersion: 1, rows: [] });
    __putRawDoc("queue", "e1", { schemaVersion: 1, rows: [] });
    await __sql(
      `insert into audit_log (id, actor, action, target_tb, target_id)
       values ('audit-1', 'x', 'withdrawal.request', 'members', 'm1')`,
    );

    const result = await runWeeklyBackup(SUNDAY_KST);

    const dump = JSON.parse(__readText("backups", dumpPathFor(SUNDAY_KST))!);
    const ids = (rows: Record<string, string>[], key: string) =>
      rows.map((r) => r[key]);
    expect(ids(dump.tables.app_tables, "name")).toEqual(["members"]);
    expect(ids(dump.tables.app_queues, "event_id")).toEqual(["e1"]);
    expect(ids(dump.tables.audit_log, "id")).toEqual(["audit-1"]);
    expect(result).toMatchObject({ dumped: 1, queues: 1, auditRows: 1 });
  });

  it("attempts the GitHub contents PUT when the B2 env is set", async () => {
    testEnv.GITHUB_BACKUP_REPO = "org/backups";
    testEnv.GITHUB_BACKUP_TOKEN = "tok";
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? "GET" });
        if (init?.method === "PUT")
          return { ok: true, status: 201 } as Response;
        return { ok: false, status: 404 } as Response; // no existing file
      }),
    );
    try {
      const { pushed } = await runWeeklyBackup(SUNDAY_KST);

      expect(pushed).toBe(true);
      const put = calls.find((c) => c.method === "PUT");
      expect(put?.url).toBe(
        `https://api.github.com/repos/org/backups/contents/${dumpPathFor(SUNDAY_KST)}`,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("prunes dumps older than 8 weeks after writing the new one", async () => {
    await uploadToBackups("dumps/ancient.json", "{}");
    const nineWeeksAgo = new Date(
      SUNDAY_KST.getTime() - 9 * 7 * DAY_MS,
    ).toISOString();
    __setCreatedAt("backups", "dumps/ancient.json", nineWeeksAgo);

    await runWeeklyBackup(SUNDAY_KST);

    expect(__exists("backups", "dumps/ancient.json")).toBe(false);
    expect(__exists("backups", dumpPathFor(SUNDAY_KST))).toBe(true);
  });
});

describe("runMaintenance", () => {
  const dumpTakenAgo = async (days: number) => {
    const path = "dumps/earlier.json";
    await uploadToBackups(path, "{}");
    __setCreatedAt(
      "backups",
      path,
      new Date(MONDAY_KST.getTime() - days * DAY_MS).toISOString(),
    );
  };

  it("keeps alive and cleans staging without dump keys on a non-Sunday (KST)", async () => {
    await dumpTakenAgo(1); // yesterday's Sunday dump
    const results = await runMaintenance(MONDAY_KST);

    expect(results.keptAlive).toBe(true);
    expect(results.stagedRemoved).toBe(0);
    expect(results).not.toHaveProperty("dumped");
    expect(results).not.toHaveProperty("pushed");
  });

  it("branches into the weekly backup on a KST Sunday", async () => {
    __putRawDoc("table", "members", { schemaVersion: 1, rows: [] });

    const results = await runMaintenance(SUNDAY_KST);

    expect(results.keptAlive).toBe(true);
    expect(results.dumped).toBe(1);
    expect(results.pushed).toBe(false);
    expect(__exists("backups", dumpPathFor(SUNDAY_KST))).toBe(true);
  });

  // The backup ran only on a KST Sunday. A failed or missed Sunday was not
  // retried by the six daily runs that followed, so the last good dump could
  // be 14 days old against an RPO of 7 (audit LB24-2).
  it("catches up on a later day when the last dump is a week old", async () => {
    await dumpTakenAgo(8); // the Sunday before last; yesterday's run failed
    const results = await runMaintenance(MONDAY_KST);

    expect(results).toHaveProperty("dumped");
    expect(__exists("backups", dumpPathFor(MONDAY_KST))).toBe(true);
  });

  // The off-platform copy is the recovery path once a paused project expires;
  // a failed push must reach the run's failure census, not read as
  // "not configured" (audit LB24-3).
  it("reports a failed GitHub push in the run's results", async () => {
    testEnv.GITHUB_BACKUP_REPO = "org/backups";
    testEnv.GITHUB_BACKUP_TOKEN = "tok";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    try {
      const results = await runMaintenance(SUNDAY_KST);

      expect(results.pushed).toBe(false);
      expect(results.backup_push_failed).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("backs up on any day when there is no dump at all", async () => {
    const results = await runMaintenance(MONDAY_KST);

    expect(results).toHaveProperty("dumped");
  });
});
