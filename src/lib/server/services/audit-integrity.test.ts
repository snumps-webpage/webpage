import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const races = vi.hoisted(() => ({
  beforeConnect: null as null | (() => Promise<void>),
  beforeLink: null as null | (() => Promise<void>),
}));

// Real SQL and CAS writes. Delay only the connection/link commit boundary so
// the competing administrator's change deterministically commits first.
vi.mock("$lib/server/data/store", async () => {
  const real = await import("$lib/server/data/store-memory");
  async function beforeConnect() {
    const run = races.beforeConnect;
    races.beforeConnect = null;
    await run?.();
  }
  return {
    ...real,
    writeDocIf: async (...args: Parameters<typeof real.writeDocIf>) => {
      if (args[0] === "table" && args[1] === "events") await beforeConnect();
      return real.writeDocIf(...args);
    },
    rpc: async <T>(fn: string, args: unknown): Promise<T> => {
      if (fn === "flow_connect_activity") await beforeConnect();
      if (fn === "flow_set_activity_study" && races.beforeLink) {
        const run = races.beforeLink;
        races.beforeLink = null;
        await run();
      }
      return real.rpc<T>(fn, args);
    },
  };
});
vi.mock(
  "$lib/server/data/storage",
  () => import("$lib/server/data/storage-memory"),
);

import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { currentTerm } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import { TABLE_NAMES } from "$lib/server/data/schemas";
import { __reset, __sql } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { connectActivity } from "./events";
import {
  createActivity,
  createSeminar,
  createStudy,
  deleteActivity,
  setActivityStudy,
  updateActivity,
  updateSeminar,
} from "./records-admin";
import { approveStudy, submitStudyRequest } from "./studies";
import { requestWithdrawal } from "./withdrawal";
import integrityMigration from "/supabase/migrations/20261104000000_audit_integrity.sql?raw";

const codeIs = (code: string) => (e: unknown) =>
  e instanceof AppError && e.code === code;

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  races.beforeConnect = null;
  races.beforeLink = null;
  for (const name of TABLE_NAMES) await invalidateCache(`table_${name}`);
});
afterEach(expectTablesValid);

async function registeredMember() {
  const id = newId();
  await mutate("members", (rows) => [
    ...rows,
    {
      id,
      name: "Synthetic",
      department: "Math",
      joinedAt: "2026-01-01",
      status: "associate",
      statusChangedAt: nowKstIso(),
      withdrawal: null,
      isAlumni: false,
      alumniRevoked: false,
      alumniRevocationReason: null,
      roles: [],
      isAdmin: false,
      publicContact: null,
      project: null,
      legacyMemberId: null,
      sourceRequestId: null,
    },
  ]);
  await mutate("registrations", (rows) => [
    ...rows,
    {
      id: newId(),
      memberId: id,
      term: currentTerm(),
      registeredAt: nowKstIso(),
      sourceRequestId: null,
    },
  ]);
  return id;
}
const proposal = (requesterId: string) =>
  submitStudyRequest({
    title: "Synthetic study",
    textbook: "Textbook",
    description: "Synthetic study description",
    semester: "26-2",
    requesterId,
  });
const activity = () =>
  createActivity({
    title: "Synthetic dinner",
    type: "회식",
    date: { start: "2027-01-01T19:00:00+09:00", end: null },
  });

describe("study approval appoints an eligible stored requester", () => {
  it("refuses after the requester withdraws, keeping the request pending", async () => {
    const requesterId = await registeredMember();
    const request = await proposal(requesterId);
    await requestWithdrawal(requesterId, {
      ackInfo: true,
      ackDataPolicy: true,
      confirmName: "Synthetic",
    });

    await expect(approveStudy(request.id)).rejects.toSatisfy(
      codeIs("VALIDATION_FAILED"),
    );

    expect(await getTable("studies")).toEqual([]);
    expect((await getTable("study-requests"))[0].status).toBe("pending");
  });

  it("refuses a requester no longer on the operating roster", async () => {
    const request = await proposal(newId());
    await expect(approveStudy(request.id)).rejects.toSatisfy(
      codeIs("VALIDATION_FAILED"),
    );
    expect(await getTable("studies")).toEqual([]);
  });

  it("approves an active requester as organizer and participant", async () => {
    const requesterId = await registeredMember();
    const request = await proposal(requesterId);
    await approveStudy(request.id);
    expect((await getTable("studies"))[0]).toMatchObject({
      organizerIds: [requesterId],
      participantIds: [requesterId],
    });
  });

  it("keeps withdrawal and approval from both succeeding", async () => {
    const requesterId = await registeredMember();
    const request = await proposal(requesterId);
    const outcomes = await Promise.allSettled([
      approveStudy(request.id),
      requestWithdrawal(requesterId, {
        ackInfo: true,
        ackDataPolicy: true,
        confirmName: "Synthetic",
      }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const [member] = await getTable("members");
    const studies = await getTable("studies");
    expect(studies).toHaveLength(member.status === "withdrawn" ? 0 : 1);
  });
});

describe("activity connection reads and writes in one transaction", () => {
  it("refuses when deletion commits before the connection write", async () => {
    const row = await activity();
    races.beforeConnect = () => deleteActivity(row.id);

    await expect(connectActivity(row.id)).rejects.toSatisfy(
      codeIs("NOT_FOUND"),
    );

    expect(await getTable("activities")).toEqual([]);
    expect(await getTable("events")).toEqual([]);
  });

  it("copies the latest stored activity when an edit commits first", async () => {
    const row = await activity();
    races.beforeConnect = () =>
      updateActivity(row.id, { title: "Corrected dinner" });
    const event = await connectActivity(row.id);
    expect(event).toMatchObject({
      title: "Corrected dinner",
      activityId: row.id,
      status: "active",
      type: "회식",
      date: row.date,
      applicantIds: [],
      presenterIds: [],
      studyId: null,
      sessionNo: null,
      autoGenerated: false,
      sourceRequestId: null,
    });
    expect((await getTable("events"))[0]).toEqual(event);
    await expect(deleteActivity(row.id)).rejects.toSatisfy(codeIs("CONFLICT"));
  });
});

describe("activity study links judge the type under the write lock", () => {
  it("refuses a type changed to a seminar after the caller read", async () => {
    const organizerId = await registeredMember();
    const study = await createStudy({
      title: "Synthetic study",
      semester: "26-2",
      textbook: "",
      description: "",
      note: "",
      organizerIds: [organizerId],
    });
    const row = await activity();
    races.beforeLink = () => updateActivity(row.id, { type: "세미나" });

    await expect(setActivityStudy(row.id, study.id)).rejects.toSatisfy(
      codeIs("VALIDATION_FAILED"),
    );

    expect((await getTable("activities"))[0]).toMatchObject({
      type: "세미나",
      studyId: null,
    });
  });
});

describe("seminar abstracts have a separate stored contract from notes", () => {
  it("creates an explicitly supplied abstract without changing the note", async () => {
    const seminar = await createSeminar({
      title: "Synthetic seminar",
      semester: "26-2",
      note: "Internal historical note",
      description: "Public abstract",
      presenterIds: [],
      externalPresenters: "",
    });
    expect(seminar).toMatchObject({
      description: "Public abstract",
      note: "Internal historical note",
    });
  });

  it("updates only the explicitly supplied abstract", async () => {
    const seminar = await createSeminar({
      title: "Synthetic seminar",
      semester: "26-2",
      note: "Internal historical note",
      presenterIds: [],
      externalPresenters: "",
    });
    await updateSeminar(seminar.id, {
      description: "Corrected public abstract",
    });
    expect((await getTable("seminars"))[0]).toMatchObject({
      description: "Corrected public abstract",
      note: "Internal historical note",
    });
  });
});

it("keeps the three integrity flows executable only by the service role", async () => {
  // Plain PGlite starts without Supabase roles. Replay the migration's grant
  // block with those roles present so its real grant/revoke branch executes.
  await __sql(`do $$ begin
    if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$`);
  await __sql(integrityMigration.slice(integrityMigration.indexOf("\ndo $$")));
  const privileges = await __sql<{
    anon: boolean;
    authenticated: boolean;
    service: boolean;
  }>(`select
    has_function_privilege('anon', name, 'EXECUTE') as anon,
    has_function_privilege('authenticated', name, 'EXECUTE') as authenticated,
    has_function_privilege('service_role', name, 'EXECUTE') as service
    from unnest(array['flow_approve_study_request(jsonb)', 'flow_connect_activity(jsonb)', 'flow_set_activity_study(jsonb)']) name`);
  expect(privileges).toEqual([
    { anon: false, authenticated: false, service: true },
    { anon: false, authenticated: false, service: true },
    { anon: false, authenticated: false, service: true },
  ]);
});
