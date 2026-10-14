import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async () => true,
}));

import { readFileSync } from "node:fs";
import {
  __docs,
  __putRawDoc,
  __reset,
  __sql,
} from "$lib/server/data/store-memory";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { currentTerm } from "$lib/server/core/semester";
import { createSeminar, updateSeminar } from "./records-admin";
import { actions } from "../../../routes/(admin)/admin/seminars/+page.server";

/**
 * 세미나 영상 링크 목록 (snumps-webpage/D-000010, D-000014): 링크마다 선택
 * 제목, https만, 세미나당 10개. 이 필드 전의 행에는 키가 없다 — 빈 목록이다.
 */

const YT = "https://www.youtube.com/watch?v=abc";
const MIGRATION_FILE = readFileSync(
  "supabase/migrations/20261014000000_seminar_videos.sql", // vitest runs from the repo root
  "utf8",
);
// The backfill statement alone — PGlite's query takes one statement, and the
// rest of the file (the approval flow) is already loaded with the migrations.
const start = MIGRATION_FILE.indexOf("update app_tables");
const MIGRATION = MIGRATION_FILE.slice(
  start,
  MIGRATION_FILE.indexOf(";", start) + 1,
);
const codeOf = (e: unknown) => (e instanceof AppError ? e.code : String(e));

const admin = {
  member: { memberId: "a1", isAdmin: true, status: "active" },
  auth: async () => ({ user: { email: "admin@snu.ac.kr" } }),
};
function post(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields))
    for (const item of Array.isArray(v) ? v : [v]) data.append(k, item);
  return { request: { formData: async () => data }, locals: admin } as never;
}
const record = (id: string) => ({
  id,
  title: "영상 세미나",
  semester: currentTerm(),
  note: "",
  externalPresenters: "",
  kind: "regular",
  durationMinutes: "",
  prerequisites: "",
});

async function seminar() {
  return createSeminar({
    title: "영상 세미나",
    semester: currentTerm(),
    note: "",
    presenterIds: [],
    externalPresenters: "",
  });
}
const stored = async () => (await getTable("seminars"))[0];

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "activities", "events"])
    await invalidateCache(`table_${t}`);
});
afterEach(expectTablesValid);

describe("storage", () => {
  it("reads a row written before the field as an empty list, and the migration writes it out", async () => {
    const s = await seminar();
    const { videos: _drop, ...legacy } = s;
    await invalidateCache("table_seminars");
    await __putRawDoc("table", "seminars", {
      schemaVersion: 1,
      rows: [legacy],
    });
    // between the old code's rewrite and the backfill re-run (release-prod.sh)
    expect((await stored()).videos).toEqual([]);

    await __sql(MIGRATION);
    await invalidateCache("table_seminars");
    const [raw] = (
      (await __docs("table")).get("seminars")!.doc as { rows: unknown[] }
    ).rows as Record<string, unknown>[];
    expect(raw.videos).toEqual([]);
    // a second run is a no-op — a written list is kept
    await updateSeminar(s.id, { videos: [{ url: YT, title: "" }] });
    await __sql(MIGRATION);
    await invalidateCache("table_seminars");
    expect((await stored()).videos).toEqual([{ url: YT, title: "" }]);
  });

  it("approval writes the empty list itself (no default relied on)", async () => {
    const req = await submitSeminarRequest({
      title: "신청 세미나",
      description: "",
      prerequisites: "",
      duration: "60분",
      preferredTiming: "",
      presenterIds: ["m-a"],
      attachment: "",
      requesterId: "m-a",
    });
    await approveSeminar(req.id);
    const [raw] = (
      (await __docs("table")).get("seminars")!.doc as { rows: unknown[] }
    ).rows as Record<string, unknown>[];
    expect(raw.videos).toEqual([]);
  });

  it("starts a new record with no videos", async () => {
    expect((await seminar()).videos).toEqual([]);
  });

  it("saves the list through the record update", async () => {
    const s = await seminar();
    await updateSeminar(s.id, {
      videos: [
        { url: YT, title: "1부" },
        { url: "https://youtu.be/xyz", title: "" },
      ],
    });
    expect((await stored()).videos).toEqual([
      { url: YT, title: "1부" },
      { url: "https://youtu.be/xyz", title: "" },
    ]);
  });

  it("refuses a non-https link at the service, writing nothing", async () => {
    const s = await seminar();
    const result = await updateSeminar(s.id, {
      videos: [{ url: "http://example.com/v", title: "" }],
    }).catch(codeOf);
    expect(result).toBe("VALIDATION_FAILED");
    expect((await stored()).videos).toEqual([]);
  });
});

describe("admin ?/update", () => {
  it("stores the editor's video rows, dropping blank ones", async () => {
    const s = await seminar();
    const result = await actions.update(
      post({
        ...record(s.id),
        videosSent: "1",
        videoUrl: [YT, ""],
        videoTitle: ["녹화", ""],
      }),
    );
    expect(result).toMatchObject({ success: true });
    expect((await stored()).videos).toEqual([{ url: YT, title: "녹화" }]);
  });

  it("clears the list when the editor sends it empty", async () => {
    const s = await seminar();
    await updateSeminar(s.id, { videos: [{ url: YT, title: "" }] });
    await actions.update(post({ ...record(s.id), videosSent: "1" }));
    expect((await stored()).videos).toEqual([]);
  });

  it("leaves the list alone when the form carries no video section", async () => {
    const s = await seminar();
    await updateSeminar(s.id, { videos: [{ url: YT, title: "" }] });
    await actions.update(post(record(s.id)));
    expect((await stored()).videos).toEqual([{ url: YT, title: "" }]);
  });

  it("answers a bad link with 400 and keeps the stored list", async () => {
    const s = await seminar();
    await updateSeminar(s.id, { videos: [{ url: YT, title: "" }] });
    const result = await actions.update(
      post({
        ...record(s.id),
        videosSent: "1",
        videoUrl: "http://example.com/v",
        videoTitle: "",
      }),
    );
    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        issues: { videos: expect.any(String) },
      },
    });
    expect((await stored()).videos).toEqual([{ url: YT, title: "" }]);
  });
});

describe("admin ?/create", () => {
  it("creates a record with its video rows", async () => {
    const { id: _id, ...fields } = record("");
    const result = await actions.create(
      post({ ...fields, videosSent: "1", videoUrl: YT, videoTitle: "" }),
    );
    expect(result).toMatchObject({ success: true });
    expect((await stored()).videos).toEqual([{ url: YT, title: "" }]);
  });
});
