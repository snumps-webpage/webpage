import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));
vi.mock("$lib/server/data/storage", () => import("$lib/server/data/storage-memory"));

import { __putRawDoc, __reset as __resetStore } from "$lib/server/data/store-memory";
import {
  __exists,
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

const dumpPathFor = (now: Date) => `dumps/${now.toISOString().slice(0, 10)}.json`;

beforeEach(() => {
  __resetStore();
  __resetStorage();
  for (const key of Object.keys(testEnv)) delete testEnv[key];
});

describe("cleanupStaging", () => {
  it("removes only entries older than 7 days and skips folder placeholders", async () => {
    const now = MONDAY_KST;
    const oldIso = new Date(now.getTime() - STAGING_TTL_MS - DAY_MS).toISOString();
    const freshIso = new Date(now.getTime() - DAY_MS).toISOString();
    __stage("pending/seminar-photo/old.png", 100, "image/png", oldIso);
    __stage("pending/seminar-photo/fresh.png", 100, "image/png", freshIso);
    __stage("pending/seminar-photo", 0, "application/octet-stream", ""); // placeholder

    const removed = await cleanupStaging(now);

    expect(removed).toBe(1);
    expect(__exists("staging", "pending/seminar-photo/old.png")).toBe(false);
    expect(__exists("staging", "pending/seminar-photo/fresh.png")).toBe(true);
    expect(__exists("staging", "pending/seminar-photo")).toBe(true);
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

  it("attempts the GitHub contents PUT when the B2 env is set", async () => {
    testEnv.GITHUB_BACKUP_REPO = "org/backups";
    testEnv.GITHUB_BACKUP_TOKEN = "tok";
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? "GET" });
        if (init?.method === "PUT") return { ok: true, status: 201 } as Response;
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
    const nineWeeksAgo = new Date(SUNDAY_KST.getTime() - 9 * 7 * DAY_MS).toISOString();
    __setCreatedAt("backups", "dumps/ancient.json", nineWeeksAgo);

    await runWeeklyBackup(SUNDAY_KST);

    expect(__exists("backups", "dumps/ancient.json")).toBe(false);
    expect(__exists("backups", dumpPathFor(SUNDAY_KST))).toBe(true);
  });
});

describe("runMaintenance", () => {
  it("keeps alive and cleans staging without dump keys on a non-Sunday (KST)", async () => {
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
});
