import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { __putRawDoc, __reset, __sql } from "./store-memory";

it("release backfills preserve the latest locked activity-type rule and grants", async () => {
  await __reset();
  const script = readFileSync("scripts/ops/release-prod.sh", "utf8");
  const declaration = script.match(/readonly BACKFILLS=\(([\s\S]*?)\n\)/)?.[1];
  if (!declaration)
    throw new Error("Release BACKFILLS configuration is missing");
  const files = declaration
    .split("\n")
    .map((line) => line.replace(/#.*/, ""))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  await __sql(`do $$ begin
    if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$`);
  // One prepared DO statement executes each complete configured SQL file.
  // This is the actual release order, including function replacements.
  for (const file of files) {
    const sql = readFileSync(file, "utf8");
    await __sql(`do $replay$ begin execute $file$${sql}$file$; end $replay$`);
  }
  await __putRawDoc("table", "activities", {
    schemaVersion: 1,
    rows: [
      {
        id: "a",
        title: "Seminar",
        date: { start: "2026-11-01T19:00:00+09:00", end: null },
        type: "세미나",
        attendeeIds: [],
        studyId: null,
        sourceRequestId: null,
      },
    ],
  });
  await __putRawDoc("table", "studies", {
    schemaVersion: 1,
    rows: [
      {
        id: "s",
        title: "Study",
        semester: "26-2",
        textbook: "",
        description: "",
        note: "",
        organizerIds: ["organizer"],
        participantIds: ["organizer"],
        pendingParticipantIds: [],
        pendingTransfer: null,
        schedule: [],
        transferHistory: [],
        photos: [],
        status: "ongoing",
        sourceRequestId: null,
      },
    ],
  });
  await expect(
    __sql(
      `select flow_set_activity_study('{"activityId":"a","studyId":"s"}'::jsonb)`,
    ),
  ).rejects.toMatchObject({
    message: "VALIDATION_FAILED",
    detail: "activity-type",
  });
  const permissions = await __sql<{
    anon: boolean;
    authenticated: boolean;
    service: boolean;
  }>(`select
    has_function_privilege('anon', f, 'EXECUTE') as anon,
    has_function_privilege('authenticated', f, 'EXECUTE') as authenticated,
    has_function_privilege('service_role', f, 'EXECUTE') as service
    from unnest(array['flow_connect_activity(jsonb)', 'flow_set_activity_study(jsonb)', 'flow_approve_study_request(jsonb)']) f`);
  expect(permissions).toEqual(
    Array.from({ length: 3 }, () => ({
      anon: false,
      authenticated: false,
      service: true,
    })),
  );
});
