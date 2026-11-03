// @vitest-environment node
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { planSessionLinks } from "../../../../scripts/ops/ops-notion-backfill-seminars.mjs";
import { TABLES, envelope, type TableName } from "./schemas";

const scratch = () => mkdtempSync(path.resolve(".tmp/ops-audit-test-"));
function moduleRun(scenario: string) {
  const dir = scratch();
  const res = spawnSync(
    process.execPath,
    [
      "--experimental-vm-modules",
      "src/lib/server/data/fixtures/ops-script-runner.mjs",
      scenario,
      dir,
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return JSON.parse(res.stdout.trim());
}
function shellRun(script: string, mode: string) {
  const dir = scratch();
  mkdirSync(path.join(dir, "scripts/ops"), { recursive: true });
  cpSync(`scripts/ops/${script}`, path.join(dir, "scripts/ops", script));
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  const executable = (name: string, body: string) =>
    writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`, {
      mode: 0o700,
    });
  executable(
    "supabase",
    'echo "$*" >> "$FAKE_CALLS"\nif [[ "$*" == *"api-keys"* ]]; then echo \'[{"type":"secret","api_key":"synthetic"}]\'; elif [[ "$*" == *"link"* && "$FAKE_MODE" == push ]]; then echo linked; else echo "synthetic CLI failure"; exit 1; fi',
  );
  executable("sleep", ":");
  executable("curl", "cat >/dev/null; printf 500");
  executable(
    "jq",
    'if [[ "$*" == *".token"* ]]; then echo synthetic; else /usr/bin/jq "$@"; fi',
  );
  executable("vercel", 'echo "synthetic permission failure" >&2; exit 1');
  if (script === "release-prod.sh") {
    mkdirSync(path.join(dir, ".git"));
    mkdirSync(path.join(dir, ".vercel"));
    mkdirSync(path.join(dir, "supabase/migrations"), { recursive: true });
    writeFileSync(path.join(dir, "package.json"), "{}");
    writeFileSync(path.join(dir, ".vercel/project.json"), "{}");
    writeFileSync(
      path.join(dir, "scripts/ops/app-key.sh"),
      "echo 0123456789012345678901234567890123456789\n",
    );
    executable(
      "git",
      'case "$*" in *--absolute-git-dir*) echo "$FAKE_ROOT/.git";; *--abbrev-ref*) echo main;; "status --porcelain") echo " M synthetic";; *) echo 0123456789012345678901234567890123456789;; esac',
    );
    executable("pnpm", ":");
    executable("vercel", ":");
  }
  writeFileSync(path.join(dir, ".env.devdbpass"), "synthetic");
  writeFileSync(
    path.join(dir, ".env"),
    "SUPABASE_URL=synthetic\nSUPABASE_SECRET_KEY=synthetic\nSUPABASE_ASSETS_BUCKET=assets\nSUPABASE_STAGING_BUCKET=staging\nSUPABASE_BACKUPS_BUCKET=backups\nASSETS_CDN_URL=synthetic\n",
  );
  const calls = path.join(dir, "calls");
  writeFileSync(calls, "");
  const res = spawnSync("bash", [path.join(dir, "scripts/ops", script)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_MODE: mode,
      FAKE_CALLS: calls,
      FAKE_ROOT: dir,
    },
    timeout: 5000,
  });
  return { ...res, calls: readFileSync(calls, "utf8") };
}
describe("operator audit regressions", () => {
  it("MIG-01 preserves operational member documents when exporting legacy data", () => {
    const r = moduleRun("migration");
    expect(r.status, r.messages.join("\n")).toBe(0);
    expect(r.db.members.version).toBe(42);
    expect(r.db["private-info"].version).toBe(42);
    expect(r.db["legacy-members"].doc.rows[0].id).toBe("legacy");
  });
  it("MIG-01 exports rows accepted by the actual current storage schemas", () => {
    const r = moduleRun("migration");
    expect(r.status, r.messages.join("\n")).toBe(0);
    for (const name of [
      "legacy-members",
      "legacy-private-info",
      "activities",
      "events",
      "seminar-requests",
      "studies",
      "seminars",
      "gallery-dinner",
    ])
      expect(r.db[name].doc.rows.length, name).toBeGreaterThan(0);
    for (const [name, stored] of Object.entries(r.db) as [
      TableName,
      { doc: unknown },
    ][]) {
      if (name === "members" || name === "private-info") continue; // untouched operational controls
      const decoded = envelope(TABLES[name].strict()).safeParse(stored.doc);
      expect(decoded.success, `${name}: ${decoded.error?.message}`).toBe(true);
      if (decoded.success) expect(decoded.data).toEqual(stored.doc);
    }
  });
  it("MIG-01 refuses schema-invalid source before local output or remote I/O", () => {
    const r = moduleRun("migration-invalid");
    expect(r.status).toBe(1);
    expect(r.effects).toEqual([]);
    expect(r.db.members.version).toBe(42);
  });
  it("OPS-02 saves an atomic attendance snapshot", () => {
    const r = moduleRun("backup");
    expect(r.backup.tables.app_tables).toEqual([
      { name: "activities", doc: { rows: [{ attendeeIds: ["member"] }] } },
    ]);
    expect(r.effects).toEqual(["flow_backup_snapshot"]);
  });
  it("OPS-01 accepts main then still refuses a dirty release tree", () => {
    const r = shellRun("release-prod.sh", "main");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("작업 트리가 깨끗하지 않다");
  });
  it("OPS-FE-03 probes current static and sample-backed dynamic routes", () => {
    const r = moduleRun("smoke");
    for (const p of [
      "/admin/seminar-series",
      "/admin/seminar-series/series",
      "/admin/studies/study",
      "/admin/executives/profiles",
      "/settings/executive-profile",
      "/members/member",
      "/api/version",
    ])
      expect(r.effects.some((u: string) => new URL(u).pathname === p)).toBe(
        true,
      );
  });
  it("OPS-FE-03 uses visible public samples while retaining withdrawn admin samples", () => {
    const r = moduleRun("smoke-hidden");
    expect(r.status, r.messages.join("\n")).toBe(0);
    const paths = r.effects.map((u: string) => new URL(u).pathname);
    expect(paths).toContain("/members/member");
    expect(paths).toContain("/admin/members/withdrawn");
    expect(paths).not.toContain("/members/withdrawn");
    expect(paths).not.toContain("/archive/seminars/draft");
    expect(r.messages.join("\n")).toContain("생략: /archive/seminars/[id]");
  });
  it("SEC-OPS-01 reports a failed body patch as unsuccessful", () => {
    expect(moduleRun("body-write-error").status).toBe(1);
  });
  it("OPS-DATA-03 refuses to certify failed reads as clean", () => {
    const r = moduleRun("clean-read-error");
    expect(r.status).toBe(1);
    expect(r.messages.join("\n")).not.toContain("✅ 전체 클린");
  });
  it.each(["link", "push"])(
    "OPS-DATA-02 fails setup after %s failure",
    (mode) => {
      const r = shellRun("ops-setup.sh", mode);
      expect(r.status).not.toBe(0);
      if (mode === "link") expect(r.calls).not.toContain("db push");
    },
  );
  it.each(["ops-vercel-env-preview.sh", "ops-vercel-preview-login.sh"])(
    "OPS-FE-02 propagates registration failures in %s",
    (script) => {
      expect(shellRun(script, "fail").status).not.toBe(0);
    },
  );
  it("OPS-FE-01 rejects invalid anonymous credentials", () => {
    expect(moduleRun("rls-bad-key").status).toBe(1);
  });
  it("OPS-FE-01 requires a privileged known-resource control", () => {
    expect(moduleRun("rls-no-control").status).toBe(1);
  });
  it("OPS-FE-01 accepts empty anonymous reads only after nonempty privileged controls", () => {
    expect(moduleRun("rls-denied").status).toBe(0);
  });
  it("OPS-FE-04 finds body text on later pages", () => {
    const r = moduleRun("audit-pages");
    expect(r.messages.join("\n")).toContain("글이 있는 행: 1/1");
  });
  it("OPS-FE-04 reports inaccessible bodies as unknown", () => {
    const r = moduleRun("audit-unknown");
    expect(r.status).toBe(1);
    expect(r.messages.join("\n")).toMatch(/본문.*(?:모름|미확인|unknown)/);
  });
  it.each(["2025-02-20", "2025-02-19T15:00:00.000Z"])(
    "OPS-DATA-01 matches migrated KST date %s",
    (startsAt) => {
      const r = planSessionLinks({
        notionSeminars: [
          {
            title: "Synthetic",
            semester: "24-W",
            sessions: [{ title: "Session", startsAt }],
          },
        ],
        appSeminars: [
          {
            id: "s1",
            title: "Synthetic",
            semester: "24-W",
            schedule: null,
            activityId: null,
          },
        ],
        appActivities: [
          {
            id: "a1",
            title: "Session",
            type: "세미나",
            date: { start: "2025-02-20T00:00:00+09:00", end: null },
          },
        ],
      });
      expect(r.rows[0].activityId).toBe("a1");
    },
  );
});
